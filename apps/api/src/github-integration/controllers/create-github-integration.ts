import { and, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { integrationTable, projectTable } from "../../database/schema";
import { defaultGitHubConfig } from "../../plugins/github/config";
import { getGithubApp } from "../../plugins/github/utils/github-app";

type CreateGitHubIntegrationInput = {
  projectId?: string;
  workspaceId?: string;
  repositoryOwner: string;
  repositoryName: string;
};

export async function resolveWorkspaceId(input: {
  projectId?: string;
  workspaceId?: string;
}): Promise<string> {
  if (input.workspaceId) {
    return input.workspaceId;
  }

  if (!input.projectId) {
    throw new HTTPException(400, {
      message: "Either projectId or workspaceId is required",
    });
  }

  const project = await db.query.projectTable.findFirst({
    where: eq(projectTable.id, input.projectId),
  });

  if (!project) {
    throw new HTTPException(404, { message: "Project not found" });
  }

  return project.workspaceId;
}

async function createGithubIntegration({
  projectId,
  workspaceId,
  repositoryOwner,
  repositoryName,
}: CreateGitHubIntegrationInput) {
  const githubApp = getGithubApp();

  if (!githubApp) {
    throw new HTTPException(500, {
      message: "GitHub app not configured",
    });
  }

  const resolvedWorkspaceId = await resolveWorkspaceId({
    projectId,
    workspaceId,
  });

  if (projectId) {
    const project = await db.query.projectTable.findFirst({
      where: eq(projectTable.id, projectId),
    });

    if (!project || project.workspaceId !== resolvedWorkspaceId) {
      throw new HTTPException(400, {
        message: "Project does not belong to workspace",
      });
    }
  }

  let installationId: number | null = null;
  try {
    const { data: installation } =
      await githubApp.octokit.rest.apps.getRepoInstallation({
        owner: repositoryOwner,
        repo: repositoryName,
      });
    installationId = installation.id;
  } catch (error) {
    console.warn("Could not get installation ID for repository:", error);
  }

  const existingIntegration = await db.query.integrationTable.findFirst({
    where: and(
      eq(integrationTable.workspaceId, resolvedWorkspaceId),
      eq(integrationTable.type, "github"),
    ),
  });

  const allWorkspaceGitHubIntegrations =
    await db.query.integrationTable.findMany({
      where: and(
        eq(integrationTable.workspaceId, resolvedWorkspaceId),
        eq(integrationTable.type, "github"),
      ),
    });

  for (const integration of allWorkspaceGitHubIntegrations) {
    try {
      const config = JSON.parse(integration.config);
      if (
        config.repositoryOwner === repositoryOwner &&
        config.repositoryName === repositoryName
      ) {
        const [reactivated] = await db
          .update(integrationTable)
          .set({
            isActive: true,
            projectId: projectId ?? integration.projectId ?? null,
            updatedAt: new Date(),
          })
          .where(eq(integrationTable.id, integration.id))
          .returning();

        return {
          id: reactivated?.id,
          projectId: reactivated?.projectId ?? projectId ?? null,
          workspaceId: resolvedWorkspaceId,
          repositoryOwner,
          repositoryName,
          installationId,
          isActive: reactivated?.isActive,
          createdAt: reactivated?.createdAt,
          updatedAt: reactivated?.updatedAt,
        };
      }
    } catch {
      // Skip invalid config rows.
    }
  }

  const config = {
    repositoryOwner,
    repositoryName,
    installationId,
    ...defaultGitHubConfig,
  };

  if (existingIntegration && !existingIntegration.projectId) {
    const [newIntegration] = await db
      .insert(integrationTable)
      .values({
        projectId: projectId ?? null,
        workspaceId: resolvedWorkspaceId,
        type: "github",
        config: JSON.stringify(config),
        isActive: true,
      })
      .returning();

    return {
      id: newIntegration?.id,
      projectId: newIntegration?.projectId ?? null,
      workspaceId: resolvedWorkspaceId,
      repositoryOwner,
      repositoryName,
      installationId,
      isActive: newIntegration?.isActive,
      createdAt: newIntegration?.createdAt,
      updatedAt: newIntegration?.updatedAt,
    };
  }

  const [newIntegration] = await db
    .insert(integrationTable)
    .values({
      projectId: projectId ?? null,
      workspaceId: resolvedWorkspaceId,
      type: "github",
      config: JSON.stringify(config),
      isActive: true,
    })
    .returning();

  return {
    id: newIntegration?.id,
    projectId: newIntegration?.projectId ?? null,
    workspaceId: resolvedWorkspaceId,
    repositoryOwner,
    repositoryName,
    installationId,
    isActive: newIntegration?.isActive,
    createdAt: newIntegration?.createdAt,
    updatedAt: newIntegration?.updatedAt,
  };
}

export default createGithubIntegration;
