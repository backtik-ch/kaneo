import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandDialog,
  CommandDialogPopup,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
  CommandPanel,
} from "@/components/ui/command";
import { DialogTitle } from "@/components/ui/dialog";
import useCreateTaskRelation from "@/hooks/mutations/task-relation/use-create-task-relation";
import { useGetTasks } from "@/hooks/queries/task/use-get-tasks";
import {
  getHierarchyCandidates,
  type HierarchyTask,
} from "@/lib/task-hierarchy";

type Props = {
  taskId: string;
  projectId: string;
  mode: "parent" | "child";
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export default function TaskHierarchyPicker({
  taskId,
  projectId,
  mode,
  open,
  onOpenChange,
}: Props) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const {
    data: project,
    isPending,
    isError,
    refetch,
  } = useGetTasks(open ? projectId : "");
  const createRelation = useCreateTaskRelation();
  const tasks = [
    ...(project?.columns?.flatMap((column) => column.tasks) ?? []),
    ...(project?.plannedTasks ?? []),
    ...(project?.archivedTasks ?? []),
  ];
  const label = (task: HierarchyTask) =>
    `${project?.slug ?? ""}-${task.number ?? ""} ${task.title}`;
  const candidates = getHierarchyCandidates(
    tasks,
    taskId,
    projectId,
    mode,
  ).filter((task) =>
    label(task).toLocaleLowerCase().includes(search.toLocaleLowerCase().trim()),
  );

  const handleLink = async (candidate: HierarchyTask) => {
    if (createRelation.isPending) return;
    setError("");
    try {
      await createRelation.mutateAsync({
        sourceTaskId: mode === "parent" ? candidate.id : taskId,
        targetTaskId: mode === "parent" ? taskId : candidate.id,
        relationType: "subtask",
      });
      setSearch("");
      onOpenChange(false);
    } catch {
      setError(t("tasks:hierarchy.linkError"));
      void refetch();
    }
  };

  return (
    <CommandDialog
      open={open}
      onOpenChange={(next) => {
        if (createRelation.isPending) return;
        setSearch("");
        setError("");
        onOpenChange(next);
      }}
    >
      <CommandDialogPopup>
        <DialogTitle className="px-4 pt-4 text-sm font-medium">
          {t(
            mode === "parent"
              ? "tasks:hierarchy.selectParent"
              : "tasks:hierarchy.selectChild",
          )}
        </DialogTitle>
        <Command
          items={candidates}
          itemToStringValue={(item) => label(item as HierarchyTask)}
          value={search}
          onValueChange={setSearch}
          filter={null}
        >
          <CommandInput
            aria-label={t("tasks:hierarchy.search")}
            placeholder={t("tasks:hierarchy.search")}
            disabled={createRelation.isPending}
          />
          <CommandPanel>
            {isPending ? (
              <p role="status" className="p-4 text-sm text-muted-foreground">
                {t("tasks:hierarchy.loading")}
              </p>
            ) : isError ? (
              <div className="p-4 text-sm">
                <p role="alert">{t("tasks:hierarchy.loadError")}</p>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void refetch()}
                >
                  {t("tasks:hierarchy.retry")}
                </Button>
              </div>
            ) : (
              <>
                <CommandEmpty>{t("tasks:hierarchy.empty")}</CommandEmpty>
                <CommandList>
                  {(task: HierarchyTask) => (
                    <CommandItem
                      key={task.id}
                      value={task}
                      aria-label={label(task)}
                      onClick={() => void handleLink(task)}
                      disabled={createRelation.isPending}
                    >
                      <span className="text-xs text-muted-foreground shrink-0">
                        {project?.slug}-{task.number}
                      </span>
                      <span className="truncate">{task.title}</span>
                    </CommandItem>
                  )}
                </CommandList>
              </>
            )}
          </CommandPanel>
          {error && (
            <p role="alert" className="px-4 py-3 text-sm text-destructive">
              {error}
            </p>
          )}
        </Command>
      </CommandDialogPopup>
    </CommandDialog>
  );
}
