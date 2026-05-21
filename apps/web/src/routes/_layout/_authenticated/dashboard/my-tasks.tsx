import {
  DndContext,
  type DragEndEvent,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { useQueries } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  CalendarDays,
  Layers,
  List as ListIcon,
  Search,
  UserRound,
} from "lucide-react";
import { useMemo, useState } from "react";
import PageTitle from "@/components/page-title";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import getColumns from "@/fetchers/column/get-columns";
import { useUpdateTaskStatus } from "@/hooks/mutations/task/use-update-task-status";
import { useGetMyAssignedTasks } from "@/hooks/queries/task/use-get-my-assigned-tasks";
import { toast } from "@/lib/toast";
import type Task from "@/types/task";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/my-tasks",
)({
  component: RouteComponent,
});

type ViewMode = "kanban" | "list";
type SortMode = "updated_desc" | "due_asc" | "priority_desc";
type StatusBucket = "backlog" | "todo" | "in_progress" | "in_review" | "done";

const BUCKETS: Array<{ id: StatusBucket; label: string }> = [
  { id: "backlog", label: "Backlog" },
  { id: "todo", label: "A faire" },
  { id: "in_progress", label: "En cours" },
  { id: "in_review", label: "En review" },
  { id: "done", label: "Termine" },
];

function normalizeStatus(task: {
  status: string;
  columnSlug: string | null;
  columnIsFinal: boolean | null;
}): StatusBucket {
  if (task.columnIsFinal) return "done";

  const raw = `${task.columnSlug ?? ""} ${task.status}`.toLowerCase();

  if (raw.includes("backlog") || raw.includes("planned")) return "backlog";
  if (raw.includes("review") || raw.includes("qa") || raw.includes("test")) {
    return "in_review";
  }
  if (
    raw.includes("progress") ||
    raw.includes("doing") ||
    raw.includes("develop") ||
    raw.includes("in-progress") ||
    raw.includes("wip")
  ) {
    return "in_progress";
  }
  if (
    raw.includes("done") ||
    raw.includes("closed") ||
    raw.includes("complete")
  ) {
    return "done";
  }

  return "todo";
}

function findColumnSlugForBucket(
  columns: Array<{ slug: string; isFinal?: boolean | null }>,
  bucket: StatusBucket,
  currentStatus: string,
): string | null {
  const byMatcher = (matcher: (slug: string) => boolean) =>
    columns.find((c) => matcher(c.slug.toLowerCase()))?.slug ?? null;

  if (bucket === "done") {
    return (
      columns.find((c) => c.isFinal)?.slug ??
      byMatcher(
        (s) =>
          s.includes("done") || s.includes("closed") || s.includes("complete"),
      )
    );
  }

  if (bucket === "in_review") {
    return byMatcher(
      (s) => s.includes("review") || s.includes("qa") || s.includes("test"),
    );
  }

  if (bucket === "in_progress") {
    return byMatcher(
      (s) =>
        s.includes("progress") ||
        s.includes("doing") ||
        s.includes("develop") ||
        s.includes("wip"),
    );
  }

  if (bucket === "backlog") {
    return byMatcher(
      (s) =>
        s.includes("backlog") || s.includes("planned") || s.includes("plan"),
    );
  }

  if (bucket === "todo") {
    return byMatcher(
      (s) =>
        s.includes("todo") ||
        s.includes("to-do") ||
        s.includes("open") ||
        s.includes("ready"),
    );
  }

  return currentStatus;
}

function DraggableTaskCard({
  task,
}: {
  task: {
    id: string;
    title: string;
    workspaceName: string;
    projectName: string;
    projectSlug: string;
    projectId: string;
    workspaceId: string;
    number: number | null;
  };
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: task.id,
      data: { taskId: task.id, projectId: task.projectId },
    });

  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
      }
    : undefined;

  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes}>
      <Link
        to="/dashboard/workspace/$workspaceId/project/$projectId/task/$taskId"
        params={{
          workspaceId: task.workspaceId,
          projectId: task.projectId,
          taskId: task.id,
        }}
        className={`block rounded-md border p-2 hover:bg-accent ${isDragging ? "opacity-60" : ""}`}
      >
        <div className="line-clamp-2 text-sm font-medium">{task.title}</div>
        <div className="mt-1 text-xs text-muted-foreground">
          {task.workspaceName} / {task.projectName}
        </div>
        <div className="mt-1 text-xs text-muted-foreground">
          {task.projectSlug.toUpperCase()}-{task.number ?? "?"}
        </div>
      </Link>
    </div>
  );
}

function DroppableBucket({
  bucket,
  children,
}: {
  bucket: StatusBucket;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: bucket });

  return (
    <div ref={setNodeRef} className={isOver ? "rounded-md bg-accent/40" : ""}>
      {children}
    </div>
  );
}

function RouteComponent() {
  const { data: tasks = [], isLoading } = useGetMyAssignedTasks();
  const { mutateAsync: updateTaskStatus } = useUpdateTaskStatus();

  const [viewMode, setViewMode] = useState<ViewMode>("kanban");
  const [query, setQuery] = useState("");
  const [hideDone, setHideDone] = useState(true);
  const [workspaceFilter, setWorkspaceFilter] = useState("all");
  const [projectFilter, setProjectFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [sortMode, setSortMode] = useState<SortMode>("updated_desc");

  const projectIds = useMemo(
    () => Array.from(new Set(tasks.map((task) => task.projectId))),
    [tasks],
  );

  const columnsQueries = useQueries({
    queries: projectIds.map((projectId) => ({
      queryKey: ["columns", projectId],
      queryFn: () => getColumns(projectId),
      enabled: Boolean(projectId),
    })),
  });

  const columnsByProjectId = useMemo(() => {
    const map = new Map<
      string,
      Array<{ slug: string; isFinal?: boolean | null }>
    >();
    projectIds.forEach((projectId, index) => {
      const data = columnsQueries[index]?.data as
        | Array<{ slug: string; isFinal?: boolean | null }>
        | undefined;
      map.set(projectId, data ?? []);
    });
    return map;
  }, [columnsQueries, projectIds]);

  const workspaceOptions = useMemo(
    () => Array.from(new Set(tasks.map((task) => task.workspaceName))).sort(),
    [tasks],
  );
  const projectOptions = useMemo(
    () =>
      Array.from(
        new Set(tasks.map((task) => `${task.projectId}::${task.projectName}`)),
      )
        .map((v) => {
          const [id, name] = v.split("::");
          return { id, name };
        })
        .sort((a, b) => a.name.localeCompare(b.name)),
    [tasks],
  );

  const filteredAndSortedTasks = useMemo(() => {
    const q = query.trim().toLowerCase();

    const list = tasks.filter((task) => {
      const bucket = normalizeStatus(task);
      if (hideDone && bucket === "done") return false;

      if (workspaceFilter !== "all" && task.workspaceName !== workspaceFilter) {
        return false;
      }

      if (projectFilter !== "all" && task.projectId !== projectFilter) {
        return false;
      }

      if (
        priorityFilter !== "all" &&
        (task.priority ?? "") !== priorityFilter
      ) {
        return false;
      }

      if (!q) return true;

      const text = [
        task.title,
        task.workspaceName,
        task.projectName,
        task.projectSlug,
        task.status,
        task.columnName ?? "",
      ]
        .join(" ")
        .toLowerCase();

      return text.includes(q);
    });

    const priorityWeight: Record<string, number> = {
      urgent: 5,
      high: 4,
      medium: 3,
      low: 2,
      "no-priority": 1,
      "": 0,
    };

    list.sort((a, b) => {
      if (sortMode === "updated_desc") {
        return +new Date(b.updatedAt) - +new Date(a.updatedAt);
      }

      if (sortMode === "due_asc") {
        const ad = a.dueDate ? +new Date(a.dueDate) : Number.POSITIVE_INFINITY;
        const bd = b.dueDate ? +new Date(b.dueDate) : Number.POSITIVE_INFINITY;
        return ad - bd;
      }

      return (
        (priorityWeight[b.priority ?? ""] ?? 0) -
        (priorityWeight[a.priority ?? ""] ?? 0)
      );
    });

    return list;
  }, [
    tasks,
    query,
    hideDone,
    workspaceFilter,
    projectFilter,
    priorityFilter,
    sortMode,
  ]);

  const grouped = useMemo(() => {
    const map: Record<StatusBucket, typeof filteredAndSortedTasks> = {
      backlog: [],
      todo: [],
      in_progress: [],
      in_review: [],
      done: [],
    };

    for (const task of filteredAndSortedTasks) {
      map[normalizeStatus(task)].push(task);
    }

    return map;
  }, [filteredAndSortedTasks]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;

    const targetBucket = over.id as StatusBucket;
    const activeTaskId = String(active.id);
    const task = filteredAndSortedTasks.find((t) => t.id === activeTaskId);
    if (!task) return;

    const columns = columnsByProjectId.get(task.projectId) ?? [];
    const targetStatus = findColumnSlugForBucket(
      columns,
      targetBucket,
      task.status,
    );

    if (!targetStatus) {
      toast.error("Impossible de mapper ce statut pour le projet source");
      return;
    }

    if (targetStatus === task.status) return;

    const payload: Task = {
      id: task.id,
      title: task.title,
      number: task.number,
      description: task.description,
      status: targetStatus,
      priority: task.priority,
      startDate: null,
      dueDate: task.dueDate,
      position: null,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
      userId: null,
      assigneeId: null,
      assigneeName: null,
      projectId: task.projectId,
      columnId: task.columnId,
    };

    try {
      await updateTaskStatus(payload);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Update status failed",
      );
    }
  };

  return (
    <div className="space-y-4">
      <PageTitle title="Mes taches" />

      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <Tabs
            value={viewMode}
            onValueChange={(v) => setViewMode(v as ViewMode)}
          >
            <TabsList>
              <TabsTrigger value="kanban">
                <Layers className="mr-1 size-4" />
                Kanban
              </TabsTrigger>
              <TabsTrigger value="list">
                <ListIcon className="mr-1 size-4" />
                Liste
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <label className="ml-2 inline-flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={hideDone}
              onChange={(e) => setHideDone(e.target.checked)}
            />
            Masquer terminees
          </label>
        </div>

        <div className="grid grid-cols-1 gap-2 md:grid-cols-5">
          <div className="relative md:col-span-2">
            <Search className="pointer-events-none absolute top-2.5 left-2 size-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-8"
              placeholder="Rechercher une tache, projet, workspace..."
            />
          </div>

          <select
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            value={workspaceFilter}
            onChange={(e) => setWorkspaceFilter(e.target.value)}
          >
            <option value="all">Tous les workspaces</option>
            {workspaceOptions.map((workspace) => (
              <option key={workspace} value={workspace}>
                {workspace}
              </option>
            ))}
          </select>

          <select
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            value={projectFilter}
            onChange={(e) => setProjectFilter(e.target.value)}
          >
            <option value="all">Tous les projets</option>
            {projectOptions.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>

          <select
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
          >
            <option value="all">Toutes les priorites</option>
            <option value="urgent">Urgent</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
            <option value="no-priority">No priority</option>
          </select>
        </div>

        <div className="flex justify-end">
          <select
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            value={sortMode}
            onChange={(e) => setSortMode(e.target.value as SortMode)}
          >
            <option value="updated_desc">Tri: Derniere mise a jour</option>
            <option value="due_asc">Tri: Echeance proche</option>
            <option value="priority_desc">Tri: Priorite</option>
          </select>
        </div>

        {isLoading ? (
          <div className="text-sm text-muted-foreground">Chargement...</div>
        ) : viewMode === "kanban" ? (
          <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
              {BUCKETS.map((bucket) => (
                <Card key={bucket.id} className="min-h-[240px]">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center justify-between text-sm">
                      <span>{bucket.label}</span>
                      <Badge variant="secondary">
                        {grouped[bucket.id].length}
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <DroppableBucket bucket={bucket.id}>
                      <div className="space-y-2">
                        {grouped[bucket.id].map((task) => (
                          <DraggableTaskCard key={task.id} task={task} />
                        ))}
                      </div>
                    </DroppableBucket>
                  </CardContent>
                </Card>
              ))}
            </div>
          </DndContext>
        ) : (
          <Card>
            <CardContent className="p-0">
              <div className="grid grid-cols-12 border-b px-3 py-2 text-xs text-muted-foreground">
                <div className="col-span-4">Tache</div>
                <div className="col-span-2">Projet</div>
                <div className="col-span-2">Workspace</div>
                <div className="col-span-2">Statut</div>
                <div className="col-span-1">Echeance</div>
                <div className="col-span-1">Priorite</div>
              </div>
              {filteredAndSortedTasks.map((task) => (
                <Link
                  key={task.id}
                  to="/dashboard/workspace/$workspaceId/project/$projectId/task/$taskId"
                  params={{
                    workspaceId: task.workspaceId,
                    projectId: task.projectId,
                    taskId: task.id,
                  }}
                  className="grid grid-cols-12 items-center border-b px-3 py-2 text-sm hover:bg-accent"
                >
                  <div className="col-span-4 min-w-0">
                    <div className="truncate font-medium">{task.title}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {task.projectSlug.toUpperCase()}-{task.number ?? "?"}
                    </div>
                  </div>
                  <div className="col-span-2 truncate">{task.projectName}</div>
                  <div className="col-span-2 truncate">
                    {task.workspaceName}
                  </div>
                  <div className="col-span-2">
                    <Badge variant="outline">
                      {task.columnName ?? task.status}
                    </Badge>
                  </div>
                  <div className="col-span-1 text-xs text-muted-foreground">
                    {task.dueDate ? (
                      <span className="inline-flex items-center gap-1">
                        <CalendarDays className="size-3" />
                        {new Date(task.dueDate).toLocaleDateString()}
                      </span>
                    ) : (
                      "-"
                    )}
                  </div>
                  <div className="col-span-1 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <UserRound className="size-3" />
                      {task.priority ?? "-"}
                    </span>
                  </div>
                </Link>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
