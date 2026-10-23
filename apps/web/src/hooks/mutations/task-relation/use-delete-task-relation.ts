import { useMutation, useQueryClient } from "@tanstack/react-query";
import deleteTaskRelation from "@/fetchers/task-relation/delete-task-relation";

function useDeleteTaskRelation(taskId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteTaskRelation,
    onSuccess: (relation) => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      for (const id of [relation.sourceTaskId, relation.targetTaskId]) {
        queryClient.invalidateQueries({ queryKey: ["task-relations", id] });
      }
      queryClient.invalidateQueries({
        queryKey: ["task-relations", taskId],
      });
    },
  });
}

export default useDeleteTaskRelation;
