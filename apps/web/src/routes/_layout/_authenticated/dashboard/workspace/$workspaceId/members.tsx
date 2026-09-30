import { createFileRoute } from "@tanstack/react-router";
import { UserPlus } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import WorkspaceLayout from "@/components/common/workspace-layout";
import PageTitle from "@/components/page-title";
import InviteTeamMemberModal from "@/components/team/invite-team-member-modal";
import MembersTable from "@/components/team/members-table";
import { Button } from "@/components/ui/button";
import useGetFullWorkspace from "@/hooks/queries/workspace/use-get-full-workspace";
import useGetWorkspaceMemberRole from "@/hooks/queries/workspace-users/use-get-workspace-member-role";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/workspace/$workspaceId/members",
)({
  component: RouteComponent,
});

function RouteComponent() {
  const { t } = useTranslation();
  const { workspaceId } = Route.useParams();
  const { data: workspace } = useGetFullWorkspace({ workspaceId });
  const { data: memberRole } = useGetWorkspaceMemberRole(workspaceId);

  const [isInviteTeamMemberModalOpen, setIsInviteTeamMemberModalOpen] =
    useState(false);

  const users = workspace?.members;
  const userInvitations = workspace?.invitations;
  const canInvite = memberRole === "admin" || memberRole === "owner";

  return (
    <>
      <PageTitle title={t("team:members.pageTitle")} />
      <WorkspaceLayout
        title={t("team:members.pageTitle")}
        headerActions={
          canInvite && (
            <Button
              onClick={() => setIsInviteTeamMemberModalOpen(true)}
              variant="outline"
              size="xs"
              className="gap-1 w-full md:w-auto"
            >
              <UserPlus className="w-3 h-3" />
              {t("team:members.inviteMember")}
            </Button>
          )
        }
      >
        <MembersTable users={users ?? []} invitations={userInvitations ?? []} />

        {canInvite && (
          <InviteTeamMemberModal
            open={isInviteTeamMemberModalOpen}
            onClose={() => setIsInviteTeamMemberModalOpen(false)}
          />
        )}
      </WorkspaceLayout>
    </>
  );
}
