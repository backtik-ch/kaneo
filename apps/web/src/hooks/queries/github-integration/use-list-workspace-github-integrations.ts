import { useQuery } from "@tanstack/react-query";
import listWorkspaceGithubIntegrations from "@/fetchers/github-integration/list-workspace-github-integrations";

function useListWorkspaceGithubIntegrations(workspaceId: string) {
  return useQuery({
    queryKey: ["github-integrations", workspaceId],
    queryFn: () => listWorkspaceGithubIntegrations(workspaceId),
    enabled: Boolean(workspaceId),
  });
}

export default useListWorkspaceGithubIntegrations;
