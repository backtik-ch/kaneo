import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import deleteTaskRelation from "@/fetchers/task-relation/delete-task-relation";
import getTaskRelations from "@/fetchers/task-relation/get-task-relations";
import TaskParent from "./task-parent";

vi.mock("@/fetchers/task-relation/get-task-relations", () => ({
  default: vi.fn(),
}));
vi.mock("@/fetchers/task-relation/delete-task-relation", () => ({
  default: vi.fn(),
}));
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => vi.fn() }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("@/lib/toast", () => ({ toast: { error: vi.fn() } }));
vi.mock("./task-hierarchy-picker", () => ({ default: () => null }));
afterEach(cleanup);

it("detaches the parent relation and refreshes both tasks without deleting them", async () => {
  vi.mocked(getTaskRelations).mockResolvedValue([
    {
      id: "relation",
      sourceTaskId: "parent",
      targetTaskId: "child",
      relationType: "subtask",
      sourceTask: { id: "parent", title: "Parent" },
    },
  ] as never);
  vi.mocked(deleteTaskRelation).mockImplementation(async () => {
    vi.mocked(getTaskRelations).mockResolvedValue([]);
    return {
      id: "relation",
      sourceTaskId: "parent",
      targetTaskId: "child",
      relationType: "subtask",
      createdAt: "2026-10-23T00:00:00Z",
    };
  });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const invalidate = vi.spyOn(client, "invalidateQueries");
  render(
    <QueryClientProvider client={client}>
      <TaskParent taskId="child" projectId="p" workspaceId="w" />
    </QueryClientProvider>,
  );
  expect(await screen.findByText("Parent")).toBeVisible();
  fireEvent.click(
    screen.getByRole("button", { name: "tasks:hierarchy.removeParent" }),
  );
  await waitFor(() =>
    expect(deleteTaskRelation).toHaveBeenCalledWith(
      "relation",
      expect.anything(),
    ),
  );
  expect(
    await screen.findByRole("button", { name: "tasks:hierarchy.setParent" }),
  ).toBeEnabled();
  for (const key of [
    ["tasks"],
    ["task-relations", "parent"],
    ["task-relations", "child"],
  ])
    expect(invalidate).toHaveBeenCalledWith({ queryKey: key });
});
