import { client } from "@kaneo/libs";

export type WorkspaceGithubIntegration = {
  id: string;
  projectId: string | null;
  workspaceId: string | null;
  repositoryOwner: string;
  repositoryName: string;
  installationId: number | null;
  branchPattern?: string;
  commentTaskLinkOnGitHubIssue?: boolean;
  isActive: boolean | null;
  createdAt: string;
  updatedAt: string;
};

async function listWorkspaceGithubIntegrations(workspaceId: string) {
  const response = await client["github-integration"].workspace[
    ":workspaceId"
  ].$get({
    param: { workspaceId },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error);
  }

  const data = await response.json();
  return data as WorkspaceGithubIntegration[];
}

export default listWorkspaceGithubIntegrations;
