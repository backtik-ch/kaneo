import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useTaskFiltersWithLabelsSupport } from "./use-task-filters-with-labels-support";

describe("useTaskFiltersWithLabelsSupport", () => {
  const storageKey = "kaneo:board-filters:project-1";
  const createProject = () => ({
    id: "project-1",
    name: "Project",
    slug: "PROJ",
    icon: null,
    description: null,
    isPublic: false,
    createdAt: "2026-04-16T00:00:00.000Z",
    updatedAt: "2026-04-16T00:00:00.000Z",
    workspaceId: "workspace-1",
    columns: [
      {
        id: "todo",
        name: "Todo",
        isFinal: false,
        tasks: [
          {
            id: "task-1",
            title: "Bug task",
            number: 1,
            description: null,
            status: "todo",
            priority: null,
            startDate: null,
            dueDate: null,
            position: 0,
            createdAt: "2026-04-16T00:00:00.000Z",
            updatedAt: "2026-04-16T00:00:00.000Z",
            userId: null,
            assigneeId: null,
            assigneeName: null,
            assigneeImage: null,
            projectId: "project-1",
            labels: [
              {
                id: "label-bug",
                name: "bug",
                color: "red",
              },
            ],
            externalLinks: [],
          },
          {
            id: "task-2",
            title: "Other task",
            number: 2,
            description: null,
            status: "todo",
            priority: null,
            startDate: null,
            dueDate: null,
            position: 1,
            createdAt: "2026-04-16T00:00:00.000Z",
            updatedAt: "2026-04-16T00:00:00.000Z",
            userId: null,
            assigneeId: null,
            assigneeName: null,
            assigneeImage: null,
            projectId: "project-1",
            labels: [],
            externalLinks: [],
          },
          {
            id: "task-3",
            title: "Child task",
            number: 3,
            description: null,
            status: "todo",
            priority: null,
            startDate: null,
            dueDate: null,
            position: 2,
            createdAt: "2026-04-16T00:00:00.000Z",
            updatedAt: "2026-04-16T00:00:00.000Z",
            userId: null,
            assigneeId: null,
            assigneeName: null,
            assigneeImage: null,
            projectId: "project-1",
            labels: [],
            externalLinks: [],
            parentTask: {
              id: "task-1",
              title: "Bug task",
              number: 1,
            },
          },
        ],
      },
    ],
    plannedTasks: [],
    archivedTasks: [],
  });

  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it("restores persisted label filters from storage and matches tasks from project data", async () => {
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({ labels: ["label-bug"] }),
    );

    const { result } = renderHook(() =>
      useTaskFiltersWithLabelsSupport(createProject(), "project-1"),
    );

    await waitFor(() => {
      expect(result.current.filters.labels).toEqual(["label-bug"]);
    });

    expect(result.current.filteredProject?.columns[0]?.tasks).toHaveLength(1);
    expect(result.current.filteredProject?.columns[0]?.tasks[0]?.id).toBe(
      "task-1",
    );
  });

  it("shows subtasks by default when the persisted filters do not include the subtask setting", async () => {
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({ status: ["todo"] }),
    );

    const { result } = renderHook(() =>
      useTaskFiltersWithLabelsSupport(createProject(), "project-1"),
    );

    await waitFor(() => {
      expect(result.current.filters.showSubtasks).toBe(true);
    });

    expect(result.current.filteredProject?.columns[0]?.tasks).toHaveLength(3);
  });

  it("hides subtasks when the subtask filter is disabled", async () => {
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({ showSubtasks: false }),
    );

    const { result } = renderHook(() =>
      useTaskFiltersWithLabelsSupport(createProject(), "project-1"),
    );

    await waitFor(() => {
      expect(result.current.filters.showSubtasks).toBe(false);
    });

    expect(
      result.current.filteredProject?.columns[0]?.tasks.map((task) => task.id),
    ).toEqual(["task-1", "task-2"]);
  });
});
