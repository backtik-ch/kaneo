import { client } from "@kaneo/libs";

async function deleteWorkspaceGithubIntegration(
  workspaceId: string,
  integrationId: string,
) {
  const response = await client["github-integration"].workspace[":workspaceId"][
    ":integrationId"
  ].$delete({
    param: { workspaceId, integrationId },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error);
  }

  return response.json();
}

export default deleteWorkspaceGithubIntegration;
