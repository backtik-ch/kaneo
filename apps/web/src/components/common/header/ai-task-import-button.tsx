import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Loader2, WandSparkles } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPopup,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import type { TaskToImport } from "@/fetchers/task/import-tasks";
import type { ImportTasksFromTextResponse } from "@/fetchers/task/import-tasks-from-text";
import useImportTasks from "@/hooks/mutations/task/use-import-tasks";
import useImportTasksFromText from "@/hooks/mutations/task/use-import-tasks-from-text";
import { toast } from "@/lib/toast";

export default function AiTaskImportButton() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const [plan, setPlan] = useState<ImportTasksFromTextResponse | null>(null);
  const { mutateAsync: analyzeNotes, isPending: isAnalyzing } =
    useImportTasksFromText();
  const { mutateAsync: importTasksMutation, isPending: isImporting } =
    useImportTasks();

  const isPending = isAnalyzing || isImporting;

  const handleAnalyze = async () => {
    if (notes.trim().length < 10) {
      toast.error("Add a bit more detail before importing");
      return;
    }

    try {
      const loadingId = toast.loading("Analyzing notes...");
      const result = await analyzeNotes(notes);
      toast.dismiss(loadingId);
      setPlan(result);
    } catch (error) {
      toast.error("Analysis failed. Check Gemini config or input text.");
      console.error(error);
    }
  };

  const handleConfirmImport = async () => {
    if (!plan) return;

    try {
      const loadingId = toast.loading("Importing tasks...");
      const result = await importTasksMutation({
        projectId: plan.projectId,
        tasks: plan.tasks as TaskToImport[],
      });
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["tasks", plan.projectId],
        }),
        queryClient.invalidateQueries({
          queryKey: ["project", plan.projectId],
        }),
      ]);
      toast.dismiss(loadingId);
      toast.success(`${result.results.successful} task(s) imported`);

      if (result.results.failed > 0) {
        toast.error(`${result.results.failed} task(s) failed during import`);
      }

      setOpen(false);
      setNotes("");
      setPlan(null);

      navigate({
        to: "/dashboard/workspace/$workspaceId/project/$projectId/board",
        params: {
          workspaceId: plan.workspaceId,
          projectId: plan.projectId,
        },
      });
    } catch (error) {
      toast.error("Import failed. Check Gemini config or input text.");
      console.error(error);
    }
  };

  return (
    <>
      <Button
        size="xs"
        variant="secondary"
        className="h-7 gap-1.5"
        onClick={() => setOpen(true)}
      >
        <WandSparkles className="size-3.5" />
        Import AI
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogPopup className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Import Tasks With AI</DialogTitle>
            <DialogDescription>
              Paste your notes. OpenAI will propose workspace/project and task
              cards, then you confirm before import.
            </DialogDescription>
          </DialogHeader>

          {!plan ? (
            <div className="px-6 pb-2">
              <Textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Example: Build hospital onboarding portal. Backend: auth API, patient CRUD, audit logs. Frontend: dashboard, forms, validation..."
                className="min-h-56"
              />
            </div>
          ) : (
            <div className="space-y-3 px-6 pb-2">
              <div className="rounded-lg border border-border bg-card p-3 text-sm">
                <div>
                  <span className="text-muted-foreground">Workspace: </span>
                  <span className="font-medium">{plan.workspaceName}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Project: </span>
                  <span className="font-medium">
                    {plan.projectName} ({plan.projectSlug})
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Tasks: </span>
                  <span className="font-medium">{plan.tasks.length}</span>
                </div>
              </div>

              <div className="max-h-84 space-y-2 overflow-auto pr-1">
                {plan.tasks.map((task) => (
                  <div
                    key={`${task.title}-${task.status}-${task.priority ?? "low"}-${task.description ?? ""}`}
                    className="rounded-lg border border-border bg-background p-3"
                  >
                    <div className="text-sm font-medium">{task.title}</div>
                    <div className="mt-1 line-clamp-3 text-xs text-muted-foreground">
                      {task.description || "No description"}
                    </div>
                    <div className="mt-2 flex gap-2 text-[11px] text-muted-foreground">
                      <span>Status: {task.status}</span>
                      <span>Priority: {task.priority || "low"}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="ghost"
              className="border border-border"
              onClick={() => {
                setOpen(false);
                setPlan(null);
              }}
              disabled={isPending}
            >
              Cancel
            </Button>
            {plan ? (
              <Button
                variant="secondary"
                onClick={() => setPlan(null)}
                disabled={isPending}
              >
                Back
              </Button>
            ) : null}
            <Button
              onClick={plan ? handleConfirmImport : handleAnalyze}
              disabled={isPending}
            >
              {isPending ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  {plan ? "Importing..." : "Analyzing..."}
                </>
              ) : plan ? (
                "Confirm Import"
              ) : (
                "Generate Preview"
              )}
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>
    </>
  );
}
