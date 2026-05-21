import { createFileRoute } from "@tanstack/react-router";
import { Github } from "lucide-react";
import PageTitle from "@/components/page-title";
import { GitHubIntegrationSettings } from "@/components/project/github-integration-settings";
import useActiveWorkspace from "@/hooks/queries/workspace/use-active-workspace";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/settings/workspace/integrations",
)({
  component: RouteComponent,
});

function RouteComponent() {
  const { data: workspace } = useActiveWorkspace();

  if (!workspace) {
    return null;
  }

  return (
    <>
      <PageTitle title="Workspace Integrations" />
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold">Workspace integrations</h1>
          <p className="text-muted-foreground">
            Configure shared integrations for all projects in this workspace.
          </p>
        </div>

        <div className="space-y-6">
          <div className="rounded-xl border border-border bg-background">
            <div className="flex items-start gap-3 border-b border-border px-4 py-4">
              <div className="mt-0.5 text-muted-foreground">
                <Github className="size-4" />
              </div>
              <div className="min-w-0">
                <h2 className="text-md font-medium">GitHub</h2>
                <p className="text-xs text-muted-foreground">
                  Shared repositories and branch linking across this workspace.
                </p>
              </div>
            </div>
            <div className="p-4">
              <GitHubIntegrationSettings workspaceId={workspace.id} />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
