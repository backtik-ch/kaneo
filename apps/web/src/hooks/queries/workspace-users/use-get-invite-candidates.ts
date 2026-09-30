import { useQuery } from "@tanstack/react-query";
import getInviteCandidates from "@/fetchers/workspace-user/get-invite-candidates";

function useGetInviteCandidates(workspaceId: string, open: boolean) {
  return useQuery({
    queryKey: ["workspace-invite-candidates", workspaceId],
    queryFn: () => getInviteCandidates({ workspaceId }),
    enabled: open && !!workspaceId,
    staleTime: 0,
  });
}

export default useGetInviteCandidates;
