export type HierarchyTask = {
  id: string;
  title: string;
  number: number | null;
  projectId: string;
  status: string;
  parentTask?: { id: string } | null;
};

export function getHierarchyCandidates<T extends HierarchyTask>(
  tasks: T[],
  taskId: string,
  projectId: string,
  mode: "parent" | "child",
): T[] {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  if (mode === "parent" && byId.get(taskId)?.parentTask) return [];
  return [...byId.values()].filter((candidate) => {
    if (
      candidate.id === taskId ||
      candidate.projectId !== projectId ||
      candidate.status === "archived"
    )
      return false;
    if (mode === "child" && candidate.parentTask) return false;
    const descendant = mode === "parent" ? taskId : candidate.id;
    let ancestor: string | undefined =
      mode === "parent" ? candidate.id : taskId;
    const visited = new Set<string>();
    while (ancestor) {
      if (ancestor === descendant || visited.has(ancestor)) return false;
      visited.add(ancestor);
      ancestor = byId.get(ancestor)?.parentTask?.id;
    }
    return true;
  });
}
