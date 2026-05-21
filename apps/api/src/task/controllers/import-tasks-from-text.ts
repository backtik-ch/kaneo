import { and, eq, isNull } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import {
  projectTable,
  workspaceTable,
  workspaceUserTable,
} from "../../database/schema";
import type { ImportTask } from "./import-tasks";

type AiImportPayload = {
  workspaceId: string;
  projectId: string;
  tasks: ImportTask[];
};

type AiImportPlan = {
  workspaceId: string;
  workspaceName: string;
  projectId: string;
  projectName: string;
  projectSlug: string;
  tasks: ImportTask[];
};

const DEFAULT_MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";

function buildPrompt(
  notes: string,
  workspaces: Array<{
    id: string;
    name: string;
    projects: Array<{ id: string; name: string; slug: string }>;
  }>,
) {
  return [
    "Tu reçois des notes de réunion client.",
    "Choisis le workspace ET le projet les plus pertinents parmi la liste fournie.",
    "Ensuite, extrais des tâches actionnables.",
    "Réponds uniquement en JSON conforme au schéma demandé.",
    "",
    `Notes:\n${notes}`,
    "",
    `Workspaces/Projects autorisés:\n${JSON.stringify(workspaces)}`,
  ].join("\n");
}

async function callOpenAi(
  notes: string,
  userId: string,
): Promise<AiImportPayload> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new HTTPException(500, {
      message: "OPENAI_API_KEY is not configured",
    });
  }

  const accessibleRows = await db
    .select({
      workspaceId: workspaceTable.id,
      workspaceName: workspaceTable.name,
      projectId: projectTable.id,
      projectName: projectTable.name,
      projectSlug: projectTable.slug,
    })
    .from(workspaceUserTable)
    .innerJoin(
      workspaceTable,
      eq(workspaceTable.id, workspaceUserTable.workspaceId),
    )
    .innerJoin(projectTable, eq(projectTable.workspaceId, workspaceTable.id))
    .where(
      and(
        eq(workspaceUserTable.userId, userId),
        isNull(projectTable.archivedAt),
      ),
    );

  if (accessibleRows.length === 0) {
    throw new HTTPException(400, {
      message: "No accessible project found for import",
    });
  }

  const workspaceMap = new Map<
    string,
    {
      id: string;
      name: string;
      projects: Array<{ id: string; name: string; slug: string }>;
    }
  >();

  for (const row of accessibleRows) {
    const existing = workspaceMap.get(row.workspaceId) ?? {
      id: row.workspaceId,
      name: row.workspaceName,
      projects: [],
    };
    existing.projects.push({
      id: row.projectId,
      name: row.projectName,
      slug: row.projectSlug,
    });
    workspaceMap.set(row.workspaceId, existing);
  }

  const workspaces = Array.from(workspaceMap.values());
  const prompt = buildPrompt(notes, workspaces);

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: DEFAULT_MODEL,
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content:
            "Tu es un assistant de planification. Réponds uniquement en JSON valide.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "task_import_plan",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              workspaceId: { type: "string" },
              projectId: { type: "string" },
              tasks: {
                type: "array",
                minItems: 1,
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    title: { type: "string" },
                    description: { type: "string" },
                    status: { type: "string" },
                    priority: { type: "string" },
                    startDate: { type: "string" },
                    dueDate: { type: "string" },
                    userId: { type: "string" },
                  },
                  required: ["title", "description", "status", "priority"],
                },
              },
            },
            required: ["workspaceId", "projectId", "tasks"],
          },
        },
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new HTTPException(502, {
      message: `OpenAI request failed: ${errorText}`,
    });
  }

  const json = (await response.json()) as {
    choices?: Array<{ message?: { content?: string | null } }>;
  };
  const content = json.choices?.[0]?.message?.content;

  if (!content) {
    throw new HTTPException(502, {
      message: "OpenAI returned an empty response",
    });
  }

  let payload: AiImportPayload;
  try {
    payload = JSON.parse(content) as AiImportPayload;
  } catch {
    throw new HTTPException(502, {
      message: "OpenAI returned invalid JSON",
    });
  }

  const allowedWorkspace = workspaceMap.get(payload.workspaceId);
  const allowedProject = allowedWorkspace?.projects.find(
    (project) => project.id === payload.projectId,
  );

  if (!allowedWorkspace || !allowedProject) {
    throw new HTTPException(400, {
      message: "OpenAI selected a workspace/project outside allowed scope",
    });
  }

  if (!Array.isArray(payload.tasks) || payload.tasks.length === 0) {
    throw new HTTPException(400, {
      message: "OpenAI did not return any task to import",
    });
  }

  return payload;
}

async function importTasksFromText(notes: string, userId: string) {
  const ai = await callOpenAi(notes, userId);
  const selectedProject = await db.query.projectTable.findFirst({
    where: eq(projectTable.id, ai.projectId),
    with: {
      workspace: true,
    },
  });

  if (!selectedProject?.workspace) {
    throw new HTTPException(404, {
      message: "Selected project not found",
    });
  }

  const plan: AiImportPlan = {
    workspaceId: selectedProject.workspace.id,
    workspaceName: selectedProject.workspace.name,
    projectId: selectedProject.id,
    projectName: selectedProject.name,
    projectSlug: selectedProject.slug,
    tasks: ai.tasks,
  };

  return plan;
}

export default importTasksFromText;
