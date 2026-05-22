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
  availableProjects: Array<{
    workspaceId: string;
    workspaceName: string;
    projectId: string;
    projectName: string;
    projectSlug: string;
  }>;
};

const DEFAULT_MODEL = process.env.GEMINI_MODEL || "gemini-3.1-flash-lite";

function buildPrompt(
  notes: string,
  workspaces: Array<{
    id: string;
    name: string;
    projects: Array<{ id: string; name: string; slug: string }>;
  }>,
) {
  return [
    "Tu reçois des notes de réunion client, ou un texte brut.",
    "Choisis le workspace ET le projet les plus pertinents parmi la liste fournie.",
    "Ensuite, extrais des tâches actionnables de la façon la plus intelligente possible.",
    "Le but étant de créer des petites tâches concises mais efficace pour le développeur",
    "IMPORTANT: les champs `title` et `description` de toutes les tâches doivent être en français.",
    "Réponds uniquement en JSON conforme au schéma demandé.",
    "",
    `Notes:\n${notes}`,
    "",
    `Workspaces/Projects autorisés:\n${JSON.stringify(workspaces)}`,
  ].join("\n");
}

function extractJsonFromText(text: string) {
  const fenced = text.match(/```json\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) {
    return fenced[1];
  }
  return text.trim();
}

async function callGemini(
  notes: string,
  userId: string,
): Promise<AiImportPayload> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new HTTPException(500, {
      message: "GEMINI_API_KEY is not configured",
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

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(DEFAULT_MODEL)}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [
            {
              text: "Tu es un assistant de planification. Réponds uniquement en JSON valide.",
            },
          ],
        },
        contents: [
          {
            role: "user",
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          temperature: 0.2,
          responseMimeType: "application/json",
          responseSchema: {
            type: "OBJECT",
            properties: {
              workspaceId: { type: "STRING" },
              projectId: { type: "STRING" },
              tasks: {
                type: "ARRAY",
                minItems: 1,
                items: {
                  type: "OBJECT",
                  properties: {
                    title: { type: "STRING" },
                    description: { type: "STRING" },
                    status: { type: "STRING" },
                    priority: { type: "STRING" },
                    startDate: { type: "STRING" },
                    dueDate: { type: "STRING" },
                    userId: { type: "STRING" },
                  },
                  required: ["title", "description", "status", "priority"],
                },
              },
            },
            required: ["workspaceId", "projectId", "tasks"],
          },
        },
      }),
    },
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new HTTPException(502, {
      message: `Gemini request failed: ${errorText}`,
    });
  }

  const json = (await response.json()) as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
    }>;
  };
  const content = json.candidates?.[0]?.content?.parts
    ?.map((part) => part.text ?? "")
    .join("\n");

  if (!content) {
    throw new HTTPException(502, {
      message: "Gemini returned an empty response",
    });
  }

  let payload: AiImportPayload;
  try {
    payload = JSON.parse(extractJsonFromText(content)) as AiImportPayload;
  } catch {
    throw new HTTPException(502, {
      message: "Gemini returned invalid JSON",
    });
  }

  const allowedWorkspace = workspaceMap.get(payload.workspaceId);
  const allowedProject = allowedWorkspace?.projects.find(
    (project) => project.id === payload.projectId,
  );

  if (!allowedWorkspace || !allowedProject) {
    throw new HTTPException(400, {
      message: "Gemini selected a workspace/project outside allowed scope",
    });
  }

  if (!Array.isArray(payload.tasks) || payload.tasks.length === 0) {
    throw new HTTPException(400, {
      message: "Gemini did not return any task to import",
    });
  }

  return payload;
}

async function importTasksFromText(notes: string, userId: string) {
  const ai = await callGemini(notes, userId);
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
    availableProjects: accessibleRows.map((row) => ({
      workspaceId: row.workspaceId,
      workspaceName: row.workspaceName,
      projectId: row.projectId,
      projectName: row.projectName,
      projectSlug: row.projectSlug,
    })),
  };

  return plan;
}

export default importTasksFromText;
