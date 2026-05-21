import { useMutation, useQueryClient } from "@tanstack/react-query";
import createWorkspaceGithubIntegration, {
  type CreateWorkspaceGithubIntegrationRequest,
} from "@/fetchers/github-integration/create-workspace-github-integration";
import deleteWorkspaceGithubIntegration from "@/fetchers/github-integration/delete-workspace-github-integration";
import updateWorkspaceGithubIntegration, {
  type UpdateWorkspaceGithubIntegrationRequest,
} from "@/fetchers/github-integration/update-workspace-github-integration";

export function useCreateWorkspaceGithubIntegration() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      workspaceId,
      data,
    }: {
      workspaceId: string;
      data: CreateWorkspaceGithubIntegrationRequest;
    }) => createWorkspaceGithubIntegration(workspaceId, data),
    onSuccess: (_, { workspaceId }) => {
      void queryClient.invalidateQueries({
        queryKey: ["github-integrations", workspaceId],
      });
    },
  });
}

export function useUpdateWorkspaceGithubIntegration() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      workspaceId,
      integrationId,
      json,
    }: {
      workspaceId: string;
      integrationId: string;
      json: UpdateWorkspaceGithubIntegrationRequest;
    }) => updateWorkspaceGithubIntegration(workspaceId, integrationId, json),
    onSuccess: (_, { workspaceId }) => {
      void queryClient.invalidateQueries({
        queryKey: ["github-integrations", workspaceId],
      });
    },
  });
}

export function useDeleteWorkspaceGithubIntegration() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      workspaceId,
      integrationId,
    }: {
      workspaceId: string;
      integrationId: string;
    }) => deleteWorkspaceGithubIntegration(workspaceId, integrationId),
    onSuccess: (_, { workspaceId }) => {
      void queryClient.invalidateQueries({
        queryKey: ["github-integrations", workspaceId],
      });
    },
  });
}
