import { client } from "@kaneo/libs";

export type CreateWorkspaceGithubIntegrationRequest = {
  repositoryOwner: string;
  repositoryName: string;
};

async function createWorkspaceGithubIntegration(
  workspaceId: string,
  data: CreateWorkspaceGithubIntegrationRequest,
) {
  const response = await client["github-integration"].workspace[
    ":workspaceId"
  ].$post({
    param: { workspaceId },
    json: data,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error);
  }

  return response.json();
}

export default createWorkspaceGithubIntegration;
