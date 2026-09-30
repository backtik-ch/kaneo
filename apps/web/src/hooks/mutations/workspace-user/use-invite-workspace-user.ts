import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { InviteCandidate } from "@/fetchers/workspace-user/get-invite-candidates";
import { authClient } from "@/lib/auth-client";

type InviteWorkspaceUserRequest = {
  workspaceId: string;
  email: string;
  role: "admin" | "member" | "owner";
  resend?: boolean;
};

function useInviteWorkspaceUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      workspaceId,
      email,
      role,
      resend,
    }: InviteWorkspaceUserRequest) => {
      const { data, error } = await authClient.organization.inviteMember({
        email,
        role,
        organizationId: workspaceId,
        resend,
      });

      if (error) {
        throw new Error(error.message || "Failed to invite workspace member");
      }

      return data;
    },
    onSuccess: (_, { workspaceId, email }) => {
      const candidatesKey = ["workspace-invite-candidates", workspaceId];
      queryClient.setQueryData<InviteCandidate[]>(candidatesKey, (candidates) =>
        candidates?.filter(
          (candidate) => candidate.email.toLowerCase() !== email.toLowerCase(),
        ),
      );
      queryClient.invalidateQueries({ queryKey: candidatesKey });

      queryClient.invalidateQueries({
        queryKey: ["workspace-invites", workspaceId],
      });

      queryClient.invalidateQueries({
        queryKey: ["workspace", "full", workspaceId],
      });

      queryClient.invalidateQueries({
        queryKey: ["workspace-users", workspaceId],
      });
    },
  });
}

export default useInviteWorkspaceUser;
