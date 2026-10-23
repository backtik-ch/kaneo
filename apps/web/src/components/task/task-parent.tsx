import { useNavigate } from "@tanstack/react-router";
import { ArrowUpRight, Unlink } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import useDeleteTaskRelation from "@/hooks/mutations/task-relation/use-delete-task-relation";
import useGetTaskRelations from "@/hooks/queries/task-relation/use-get-task-relations";
import { toast } from "@/lib/toast";
import TaskHierarchyPicker from "./task-hierarchy-picker";

export default function TaskParent({
  taskId,
  projectId,
  workspaceId,
}: {
  taskId: string;
  projectId: string;
  workspaceId: string;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const { data: relations, isPending, isError } = useGetTaskRelations(taskId);
  const remove = useDeleteTaskRelation(taskId);
  const parent = relations?.find(
    (relation) =>
      relation.relationType === "subtask" && relation.targetTaskId === taskId,
  );
  const parentTask = parent?.sourceTask;
  const detach = async () => {
    if (!parent) return;
    try {
      await remove.mutateAsync(parent.id);
    } catch {
      toast.error(t("tasks:hierarchy.detachError"));
    }
  };
  return (
    <div className="flex items-center gap-2">
      {parentTask ? (
        <>
          <button
            type="button"
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            onClick={() =>
              navigate({
                to: "/dashboard/workspace/$workspaceId/project/$projectId/task/$taskId",
                params: {
                  workspaceId,
                  projectId,
                  taskId: parentTask.id,
                },
              })
            }
          >
            <ArrowUpRight className="size-3" />
            {t("tasks:detail.subtaskOf")}{" "}
            <span className="font-medium">{parentTask.title}</span>
          </button>
          <Button
            size="xs"
            variant="ghost"
            aria-label={t("tasks:hierarchy.removeParent")}
            title={t("tasks:hierarchy.removeParent")}
            disabled={remove.isPending}
            onClick={() => void detach()}
          >
            <Unlink className="size-3" />
          </Button>
        </>
      ) : (
        <Button
          size="xs"
          variant="ghost"
          disabled={isPending || isError || !!parent}
          onClick={() => setOpen(true)}
        >
          {t("tasks:hierarchy.setParent")}
        </Button>
      )}
      <TaskHierarchyPicker
        key={taskId}
        taskId={taskId}
        projectId={projectId}
        mode="parent"
        open={open}
        onOpenChange={setOpen}
      />
    </div>
  );
}
