import { useMutation } from "@tanstack/react-query";
import importTasksFromText from "@/fetchers/task/import-tasks-from-text";

function useImportTasksFromText() {
  return useMutation({
    mutationFn: (notes: string) => importTasksFromText(notes),
  });
}

export default useImportTasksFromText;
