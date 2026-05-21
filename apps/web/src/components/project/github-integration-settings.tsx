import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import {
  AlertTriangle,
  CheckCircle,
  ExternalLink,
  GitBranch,
  Github,
  Import,
  Link,
  RefreshCw,
  Trash2,
  XCircle,
} from "lucide-react";
import React from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod/v4";
import { RepositoryBrowserModal } from "@/components/project/repository-browser-modal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import type { VerifyGithubInstallationResponse } from "@/fetchers/github-integration/verify-github-installation";
import { useVerifyGithubInstallation } from "@/hooks/mutations/github-integration/use-create-github-integration";
import useImportGithubIssues from "@/hooks/mutations/github-integration/use-import-github-issues";
import {
  useCreateWorkspaceGithubIntegration,
  useDeleteWorkspaceGithubIntegration,
  useUpdateWorkspaceGithubIntegration,
} from "@/hooks/mutations/github-integration/use-workspace-github-integrations";
import useListWorkspaceGithubIntegrations from "@/hooks/queries/github-integration/use-list-workspace-github-integrations";
import { cn } from "@/lib/cn";
import { toast } from "@/lib/toast";

type GithubIntegrationFormValues = {
  repositoryOwner: string;
  repositoryName: string;
};

export function GitHubIntegrationSettings({
  projectId,
  workspaceId,
}: {
  projectId: string;
  workspaceId: string;
}) {
  const { t } = useTranslation();

  const githubIntegrationSchema = React.useMemo(
    () =>
      z.object({
        repositoryOwner: z
          .string()
          .min(1, t("settings:githubIntegration.validation.ownerRequired"))
          .regex(
            /^[a-zA-Z0-9-]+$/,
            t("settings:githubIntegration.validation.ownerInvalid"),
          ),
        repositoryName: z
          .string()
          .min(1, t("settings:githubIntegration.validation.nameRequired"))
          .regex(
            /^[a-zA-Z0-9._-]+$/,
            t("settings:githubIntegration.validation.nameInvalid"),
          ),
      }),
    [t],
  );

  const { data: integrations = [], isLoading } =
    useListWorkspaceGithubIntegrations(workspaceId);
  const { mutateAsync: createIntegration, isPending: isCreating } =
    useCreateWorkspaceGithubIntegration();
  const { mutateAsync: deleteIntegration, isPending: isDeleting } =
    useDeleteWorkspaceGithubIntegration();
  const { mutateAsync: updateIntegration, isPending: isUpdating } =
    useUpdateWorkspaceGithubIntegration();
  const { mutateAsync: verifyInstallation, isPending: isVerifying } =
    useVerifyGithubInstallation();
  const { mutateAsync: importIssues, isPending: isImporting } =
    useImportGithubIssues();

  const [showRepositoryBrowser, setShowRepositoryBrowser] =
    React.useState(false);
  const [verificationResult, setVerificationResult] =
    React.useState<VerifyGithubInstallationResponse | null>(null);
  const [selectedIntegrationId, setSelectedIntegrationId] = React.useState<
    string | null
  >(null);

  React.useEffect(() => {
    if (!selectedIntegrationId && integrations.length > 0) {
      setSelectedIntegrationId(integrations[0]?.id ?? null);
    }
  }, [integrations, selectedIntegrationId]);

  const selectedIntegration = React.useMemo(
    () =>
      integrations.find((it) => it.id === selectedIntegrationId) ??
      integrations[0],
    [integrations, selectedIntegrationId],
  );

  const form = useForm<GithubIntegrationFormValues>({
    resolver: standardSchemaResolver(githubIntegrationSchema),
    defaultValues: {
      repositoryOwner: "",
      repositoryName: "",
    },
  });

  const handleRepositorySelect = (repository: {
    owner: string;
    name: string;
  }) => {
    form.setValue("repositoryOwner", repository.owner, {
      shouldValidate: true,
      shouldDirty: true,
      shouldTouch: true,
    });
    form.setValue("repositoryName", repository.name, {
      shouldValidate: true,
      shouldDirty: true,
      shouldTouch: true,
    });
    setShowRepositoryBrowser(false);
    setVerificationResult(null);
  };

  const handleVerifyInstallation = React.useCallback(
    async (data: GithubIntegrationFormValues, showToast = true) => {
      try {
        const result = await verifyInstallation(data);
        setVerificationResult(result);

        if (showToast) {
          if (result.isInstalled && result.hasRequiredPermissions) {
            toast.success(t("settings:githubIntegration.toast.installedOk"));
          } else if (result.isInstalled) {
            toast.warning(
              t("settings:githubIntegration.toast.installedMissingPerms"),
            );
          } else if (result.repositoryExists) {
            toast.warning(
              t("settings:githubIntegration.toast.needsInstallOnRepo"),
            );
          } else {
            toast.error(t("settings:githubIntegration.toast.repoNotFound"));
          }
        }
      } catch (error) {
        if (showToast) {
          toast.error(
            error instanceof Error
              ? error.message
              : t("settings:githubIntegration.toast.verifyError"),
          );
        }
        setVerificationResult(null);
      }
    },
    [verifyInstallation, t],
  );

  const onSubmit = async (data: GithubIntegrationFormValues) => {
    try {
      const verification = await verifyInstallation(data);
      if (!verification.isInstalled) {
        toast.error(t("settings:githubIntegration.toast.installAppFirst"));
        return;
      }
      if (!verification.hasRequiredPermissions) {
        toast.error(
          t("settings:githubIntegration.toast.missingPermsDetail", {
            list: verification.missingPermissions?.join(", ") || "issues",
          }),
        );
        return;
      }

      await createIntegration({ workspaceId, data });
      toast.success(t("settings:githubIntegration.toast.updated"));
      form.reset({ repositoryOwner: "", repositoryName: "" });
      setVerificationResult(null);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("settings:githubIntegration.toast.updateError"),
      );
    }
  };

  const handleDelete = async (integrationId: string) => {
    try {
      await deleteIntegration({ workspaceId, integrationId });
      toast.success(t("settings:githubIntegration.toast.removed"));
      if (selectedIntegrationId === integrationId) {
        setSelectedIntegrationId(null);
      }
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("settings:githubIntegration.toast.removeError"),
      );
    }
  };

  const handleImportIssues = async () => {
    if (!selectedIntegration) {
      toast.error("Select a repository first");
      return;
    }

    try {
      await importIssues({ projectId, integrationId: selectedIntegration.id });
      toast.success(t("settings:githubIntegration.toast.issuesImported"));
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("settings:githubIntegration.toast.importError"),
      );
    }
  };

  const isConnected = integrations.length > 0;
  const canImport = Boolean(isConnected && selectedIntegration?.isActive);

  if (isLoading) {
    return <div className="h-20 animate-pulse rounded-md bg-muted" />;
  }

  return (
    <div className="space-y-4">
      <div className="space-y-4 border border-border rounded-md p-4 bg-sidebar">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <p className="text-sm font-medium">
              {t("settings:githubIntegration.connectionStatus")}
            </p>
            <p className="text-xs text-muted-foreground">
              {isConnected
                ? `${integrations.length} repository(ies) connected for this workspace`
                : t("settings:githubIntegration.notConnectedHint")}
            </p>
          </div>
          {isConnected ? (
            <Badge variant="secondary" className="gap-1">
              <CheckCircle className="w-3 h-3" />
              {t("settings:githubIntegration.badgeConnected")}
            </Badge>
          ) : (
            <Badge variant="outline" className="gap-1">
              <XCircle className="w-3 h-3" />
              {t("settings:githubIntegration.badgeNotConnected")}
            </Badge>
          )}
        </div>

        {integrations.length > 0 && (
          <>
            <Separator />
            <div className="space-y-2">
              {integrations.map((integration) => {
                const fullName = `${integration.repositoryOwner}/${integration.repositoryName}`;
                const selected = integration.id === selectedIntegration?.id;

                return (
                  <div
                    key={integration.id}
                    className={cn(
                      "flex items-center justify-between rounded-md border p-3",
                      selected ? "border-primary bg-accent" : "border-border",
                    )}
                  >
                    <button
                      type="button"
                      className="flex min-w-0 items-center gap-2 text-left"
                      onClick={() => setSelectedIntegrationId(integration.id)}
                    >
                      <Github className="size-4" />
                      <span className="truncate font-medium">{fullName}</span>
                      <a
                        href={`https://github.com/${fullName}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <ExternalLink className="size-3" />
                      </a>
                    </button>

                    <div className="flex items-center gap-2">
                      <Switch
                        checked={integration.isActive ?? false}
                        onCheckedChange={async (checked) => {
                          try {
                            await updateIntegration({
                              workspaceId,
                              integrationId: integration.id,
                              json: { isActive: checked },
                            });
                          } catch (error) {
                            toast.error(
                              error instanceof Error
                                ? error.message
                                : "Update failed",
                            );
                          }
                        }}
                        disabled={isUpdating}
                      />
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        onClick={() => handleDelete(integration.id)}
                        disabled={isDeleting}
                        className="gap-2"
                      >
                        <Trash2 className="size-3" />
                        {t("settings:githubIntegration.disconnect")}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {selectedIntegration && (
          <>
            <Separator />
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0 flex-1 space-y-0.5">
                <p className="text-sm font-medium">
                  {t("settings:githubIntegration.commentTaskLinkTitle")}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t("settings:githubIntegration.commentTaskLinkHint")}
                </p>
              </div>
              <Switch
                checked={
                  selectedIntegration.commentTaskLinkOnGitHubIssue !== false
                }
                onCheckedChange={async (checked) => {
                  try {
                    await updateIntegration({
                      workspaceId,
                      integrationId: selectedIntegration.id,
                      json: { commentTaskLinkOnGitHubIssue: checked },
                    });
                  } catch (error) {
                    toast.error(
                      error instanceof Error
                        ? error.message
                        : t(
                            "settings:githubIntegration.toast.settingsUpdateError",
                          ),
                    );
                  }
                }}
                disabled={isUpdating}
              />
            </div>
          </>
        )}
      </div>

      <div className="space-y-4 border border-border rounded-md p-4 bg-sidebar">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="repositoryOwner"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    {t("settings:githubIntegration.ownerLabel")}
                  </FormLabel>
                  <FormControl>
                    <Input
                      placeholder={t(
                        "settings:githubIntegration.ownerPlaceholder",
                      )}
                      {...field}
                      disabled={isCreating}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="repositoryName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    {t("settings:githubIntegration.repoNameLabel")}
                  </FormLabel>
                  <FormControl>
                    <Input
                      placeholder={t(
                        "settings:githubIntegration.repoNamePlaceholder",
                      )}
                      {...field}
                      disabled={isCreating}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowRepositoryBrowser(true)}
                className="gap-2"
              >
                <GitBranch className="size-3" />
                {t("settings:githubIntegration.browse")}
              </Button>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleVerifyInstallation(form.getValues())}
                disabled={isVerifying || !form.formState.isValid}
                className="gap-2"
              >
                <RefreshCw
                  className={cn("size-3", isVerifying && "animate-spin")}
                />
                {t("settings:githubIntegration.verify")}
              </Button>

              <Button
                type="submit"
                size="sm"
                disabled={
                  isCreating ||
                  !form.formState.isValid ||
                  (verificationResult
                    ? !verificationResult.isInstalled ||
                      !verificationResult.hasRequiredPermissions
                    : false)
                }
                className="gap-2"
              >
                <Link className="size-3" />
                Add repository to workspace
              </Button>
            </div>
          </form>
        </Form>

        {verificationResult && (
          <>
            <Separator />
            <div
              className={cn(
                "flex items-start gap-3 p-3 border rounded-md text-sm",
                verificationResult.isInstalled &&
                  verificationResult.hasRequiredPermissions
                  ? "border-success/25 bg-success/10"
                  : verificationResult.isInstalled ||
                      verificationResult.repositoryExists
                    ? "border-warning/25 bg-warning/10"
                    : "border-destructive/25 bg-destructive/10",
              )}
            >
              {verificationResult.isInstalled &&
              verificationResult.hasRequiredPermissions ? (
                <CheckCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-success-foreground" />
              ) : verificationResult.isInstalled ||
                verificationResult.repositoryExists ? (
                <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-warning-foreground" />
              ) : (
                <XCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-destructive-foreground" />
              )}
              <div className="flex-1">
                <p className="font-medium">{verificationResult.message}</p>
              </div>
            </div>
          </>
        )}
      </div>

      {isConnected && (
        <div className="space-y-4 border border-border rounded-md p-4 bg-sidebar">
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-0.5">
              <p className="text-sm font-medium">
                {t("settings:githubIntegration.importSectionTitle")}
              </p>
              <p className="text-xs text-muted-foreground">
                {t("settings:githubIntegration.importSectionHint")}
              </p>
              {selectedIntegration && (
                <p className="text-xs text-muted-foreground">
                  Import source: {selectedIntegration.repositoryOwner}/
                  {selectedIntegration.repositoryName}
                </p>
              )}
            </div>
            <Button
              onClick={handleImportIssues}
              disabled={isImporting || !canImport}
              className="gap-2"
              size="sm"
              variant="outline"
            >
              {isImporting ? (
                <RefreshCw className="size-3 animate-spin" />
              ) : (
                <Import className="size-3" />
              )}
              {isImporting
                ? t("settings:githubIntegration.importing")
                : t("settings:githubIntegration.importIssues")}
            </Button>
          </div>
        </div>
      )}

      <RepositoryBrowserModal
        open={showRepositoryBrowser}
        onOpenChange={setShowRepositoryBrowser}
        onSelectRepository={handleRepositorySelect}
        selectedRepository={
          form.getValues("repositoryOwner") && form.getValues("repositoryName")
            ? `${form.getValues("repositoryOwner")}/${form.getValues("repositoryName")}`
            : undefined
        }
      />
    </div>
  );
}
