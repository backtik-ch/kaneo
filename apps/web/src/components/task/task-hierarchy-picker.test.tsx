import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import getTasks from "@/fetchers/task/get-tasks";
import createTaskRelation from "@/fetchers/task-relation/create-task-relation";
import TaskHierarchyPicker from "./task-hierarchy-picker";

vi.mock("@/fetchers/task/get-tasks", () => ({ default: vi.fn() }));
vi.mock("@/fetchers/task-relation/create-task-relation", () => ({
  default: vi.fn(),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("@/lib/i18n", () => ({ i18n: { t: (key: string) => key } }));

const task = (
  id: string,
  number: number,
  title: string,
  parent?: string,
  status = "to-do",
) => ({
  id,
  number,
  title,
  status,
  projectId: "project-1",
  parentTask: parent ? { id: parent, title: parent, number: 1 } : null,
});
const project = {
  id: "project-1",
  slug: "PROJ",
  columns: [
    {
      id: "to-do",
      tasks: [
        task("current", 1, "Current"),
        task("candidate", 2, "Candidate"),
        task("child", 3, "Already linked", "current"),
      ],
    },
  ],
  plannedTasks: [task("planned", 4, "Future work", undefined, "planned")],
  archivedTasks: [task("archived", 5, "Archived", undefined, "archived")],
};

function mount(mode: "parent" | "child" = "parent") {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  const onOpenChange = vi.fn();
  render(
    <QueryClientProvider client={client}>
      <TaskHierarchyPicker
        taskId="current"
        projectId="project-1"
        mode={mode}
        open
        onOpenChange={onOpenChange}
      />
    </QueryClientProvider>,
  );
  return { client, onOpenChange };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getTasks).mockResolvedValue(project as never);
  vi.mocked(createTaskRelation).mockResolvedValue({
    id: "relation",
    sourceTaskId: "candidate",
    targetTaskId: "current",
    relationType: "subtask",
    createdAt: "2026-10-23T00:00:00Z",
  });
  // Base UI measures the list and scrolls the highlighted item into view.
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.getAnimations = vi.fn(() => []);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("existing task hierarchy picker", () => {
  it.each([
    "parent",
    "child",
  ] as const)("links an existing %s in the correct direction", async (mode) => {
    const { client, onOpenChange } = mount(mode);
    const invalidation = vi.spyOn(client, "invalidateQueries");
    fireEvent.click(
      await screen.findByRole("option", { name: /PROJ-2 Candidate/ }),
    );
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(createTaskRelation).toHaveBeenCalledExactlyOnceWith(
      {
        sourceTaskId: mode === "parent" ? "candidate" : "current",
        targetTaskId: mode === "parent" ? "current" : "candidate",
        relationType: "subtask",
      },
      expect.anything(),
    );
    for (const key of [
      ["task-relations", "current"],
      ["task-relations", "candidate"],
      ["tasks"],
    ])
      expect(invalidation).toHaveBeenCalledWith({ queryKey: key });
  });

  it("finds planned tasks by title and reference and excludes invalid candidates", async () => {
    mount();
    await screen.findByRole("option", { name: /Candidate/ });
    expect(
      screen.queryByRole("option", { name: /Already linked|Archived|Current/ }),
    ).toBeNull();
    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "PROJ-4" } });
    expect(
      await screen.findByRole("option", { name: /Future work/ }),
    ).toBeVisible();
    expect(screen.queryByRole("option", { name: /Candidate/ })).toBeNull();
    fireEvent.change(input, { target: { value: "CANDIDATE" } });
    expect(
      await screen.findByRole("option", { name: /Candidate/ }),
    ).toBeVisible();
  });

  it("supports keyboard selection", async () => {
    const { onOpenChange } = mount();
    await screen.findByRole("option", { name: /Candidate/ });
    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "Candidate" } });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it("keeps the picker open and shows an error when the API refuses the link", async () => {
    vi.mocked(createTaskRelation).mockRejectedValue(
      new Error("Already has a parent"),
    );
    const { onOpenChange } = mount();
    fireEvent.click(await screen.findByRole("option", { name: /Candidate/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "tasks:hierarchy.linkError",
    );
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeVisible();
  });

  it("offers a retry after loading fails", async () => {
    vi.mocked(getTasks).mockRejectedValueOnce(new Error("Offline"));
    mount();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "tasks:hierarchy.loadError",
    );
    fireEvent.click(
      screen.getByRole("button", { name: "tasks:hierarchy.retry" }),
    );
    expect(
      await screen.findByRole("option", { name: /Candidate/ }),
    ).toBeVisible();
  });
});
