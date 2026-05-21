import { useQuery } from "@tanstack/react-query";
import getMyAssignedTasks from "@/fetchers/task/get-my-assigned-tasks";

export function useGetMyAssignedTasks() {
  return useQuery({
    queryKey: ["my-assigned-tasks"],
    queryFn: () => getMyAssignedTasks(),
    refetchInterval: 30000,
  });
}
