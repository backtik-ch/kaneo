import { and, eq } from "drizzle-orm";
import db from "../../database";
import { integrationTable, projectTable } from "../../database/schema";
import {
  defaultGitHubConfig,
  type GitHubConfig,
} from "../../plugins/github/config";

export async function listGithubIntegrationsByWorkspace(workspaceId: string) {
  const integrations = await db.query.integrationTable.findMany({
    where: and(
      eq(integrationTable.workspaceId, workspaceId),
      eq(integrationTable.type, "github"),
    ),
    orderBy: (table, { asc }) => [asc(table.createdAt)],
  });

  return integrations.map((integration) => {
    const config = JSON.parse(integration.config) as GitHubConfig;

    return {
      id: integration.id,
      projectId: integration.projectId,
      workspaceId: integration.workspaceId,
      repositoryOwner: config.repositoryOwner,
      repositoryName: config.repositoryName,
      installationId: config.installationId,
      branchPattern: config.branchPattern || defaultGitHubConfig.branchPattern,
      commentTaskLinkOnGitHubIssue:
        config.commentTaskLinkOnGitHubIssue !== false,
      isActive: integration.isActive,
      createdAt: integration.createdAt,
      updatedAt: integration.updatedAt,
    };
  });
}

async function getGithubIntegration(projectId: string) {
  const project = await db.query.projectTable.findFirst({
    where: eq(projectTable.id, projectId),
  });

  if (!project) {
    return null;
  }

  const integrations = await listGithubIntegrationsByWorkspace(
    project.workspaceId,
  );
  return integrations[0] ?? null;
}

export default getGithubIntegration;
