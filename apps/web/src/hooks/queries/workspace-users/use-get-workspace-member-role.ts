import { useQuery } from "@tanstack/react-query";
import useAuth from "@/components/providers/auth-provider/hooks/use-auth";
import { authClient } from "@/lib/auth-client";

function useGetWorkspaceMemberRole(workspaceId: string) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["workspace-users", workspaceId, "current-role", user?.id],
    enabled: !!workspaceId && !!user?.id,
    queryFn: async () => {
      const { data, error } = await authClient.organization.getActiveMemberRole(
        {
          query: { organizationId: workspaceId },
        },
      );

      if (error) {
        throw new Error(error.message || "Failed to get workspace member role");
      }

      return data.role;
    },
  });
}

export default useGetWorkspaceMemberRole;
