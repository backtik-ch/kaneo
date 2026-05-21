import { client } from "@kaneo/libs";

export type UpdateWorkspaceGithubIntegrationRequest = {
  isActive?: boolean;
  commentTaskLinkOnGitHubIssue?: boolean;
};

async function updateWorkspaceGithubIntegration(
  workspaceId: string,
  integrationId: string,
  json: UpdateWorkspaceGithubIntegrationRequest,
) {
  const response = await client["github-integration"].workspace[":workspaceId"][
    ":integrationId"
  ].$patch({
    param: { workspaceId, integrationId },
    json,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error);
  }

  return response.json();
}

export default updateWorkspaceGithubIntegration;
