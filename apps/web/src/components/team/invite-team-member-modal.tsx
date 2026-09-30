import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { useRef } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod/v4";
import useInviteWorkspaceUser from "@/hooks/mutations/workspace-user/use-invite-workspace-user";
import useGetInviteCandidates from "@/hooks/queries/workspace-users/use-get-invite-candidates";
import { toast } from "@/lib/toast";
import { Route } from "@/routes/_layout/_authenticated/dashboard/workspace/$workspaceId/members";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogClose,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "../ui/form";
import { Input } from "../ui/input";

type Props = {
  open: boolean;
  onClose: () => void;
};

const teamMemberSchema = z.object({
  email: z.string(),
});

type TeamMemberFormValues = z.infer<typeof teamMemberSchema>;

function InviteTeamMemberModal({ open, onClose }: Props) {
  const { t } = useTranslation();
  const { mutateAsync, isPending } = useInviteWorkspaceUser();
  const { workspaceId } = Route.useParams();
  const {
    data: candidates = [],
    isPending: isLoadingCandidates,
    isError: isCandidatesError,
    isFetching,
    refetch,
  } = useGetInviteCandidates(workspaceId, open);
  const submitting = useRef(false);
  const emailInputRef = useRef<HTMLInputElement>(null);

  const form = useForm<TeamMemberFormValues>({
    resolver: standardSchemaResolver(teamMemberSchema),
    defaultValues: {
      email: "",
    },
  });

  const email = form.watch("email");
  const search = email.trim().toLowerCase();
  const filteredCandidates = candidates.filter(
    (candidate) =>
      candidate.name.toLowerCase().includes(search) ||
      candidate.email.toLowerCase().includes(search),
  );
  const isSubmitting = isPending || form.formState.isSubmitting;

  const onSubmit = async ({ email }: TeamMemberFormValues) => {
    if (submitting.current) return;
    submitting.current = true;

    try {
      await mutateAsync({
        email: email.trim(),
        workspaceId,
        role: "member",
      });

      toast.success(t("team:inviteModal.success"));
      form.reset();
      emailInputRef.current?.focus();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("team:inviteModal.error"),
      );
    } finally {
      submitting.current = false;
    }
  };

  const resetAndCloseModal = () => {
    form.reset();
    onClose();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => !nextOpen && resetAndCloseModal()}
    >
      <DialogPopup className="w-full max-w-md">
        <DialogHeader>
          <DialogTitle>{t("team:inviteModal.title")}</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="contents">
            <DialogPanel className="space-y-4">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("team:inviteModal.emailLabel")}</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        ref={(input) => {
                          field.ref(input);
                          emailInputRef.current = input;
                        }}
                        type="text"
                        inputMode="email"
                        autoComplete="email"
                        readOnly={isSubmitting}
                        placeholder={t("team:inviteModal.emailPlaceholder")}
                        autoFocus
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="space-y-2">
                <p className="text-sm font-medium">
                  {t("team:inviteModal.suggestionsTitle")}
                </p>
                {isLoadingCandidates ? (
                  <p role="status" className="text-sm text-muted-foreground">
                    {t("team:inviteModal.loadingSuggestions")}
                  </p>
                ) : isCandidatesError ? (
                  <div className="space-y-2">
                    <p role="alert" className="text-sm text-muted-foreground">
                      {t("team:inviteModal.suggestionsError")}
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      loading={isFetching}
                      onClick={() => void refetch()}
                    >
                      {t("team:inviteModal.retrySuggestions")}
                    </Button>
                  </div>
                ) : filteredCandidates.length === 0 ? (
                  <p role="status" className="text-sm text-muted-foreground">
                    {t(
                      candidates.length === 0
                        ? "team:inviteModal.noSuggestions"
                        : "team:inviteModal.noMatchingSuggestions",
                    )}
                  </p>
                ) : (
                  <ul
                    aria-label={t("team:inviteModal.suggestionsTitle")}
                    className="max-h-60 space-y-1 overflow-y-auto"
                  >
                    {filteredCandidates.map((candidate) => (
                      <li key={candidate.id}>
                        <Button
                          type="button"
                          variant="ghost"
                          className="h-auto w-full justify-start gap-3 px-2 py-2 text-left sm:h-auto"
                          disabled={isSubmitting}
                          aria-label={`${candidate.name} (${candidate.email})`}
                          onClick={() => {
                            form.setValue("email", candidate.email, {
                              shouldDirty: true,
                            });
                            emailInputRef.current?.focus();
                          }}
                        >
                          <Avatar>
                            {candidate.image && (
                              <AvatarImage src={candidate.image} alt="" />
                            )}
                            <AvatarFallback>
                              {candidate.name.charAt(0).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <span className="min-w-0">
                            <span className="block truncate font-medium">
                              {candidate.name}
                            </span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {candidate.email}
                            </span>
                          </span>
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </DialogPanel>

            <DialogFooter>
              <DialogClose
                render={<Button variant="outline" size="sm" type="button" />}
              >
                {t("common:actions.cancel")}
              </DialogClose>
              <Button
                type="submit"
                size="sm"
                loading={isSubmitting}
                disabled={!email.trim()}
              >
                {t("team:inviteModal.sendInvitation")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogPopup>
    </Dialog>
  );
}

export default InviteTeamMemberModal;
