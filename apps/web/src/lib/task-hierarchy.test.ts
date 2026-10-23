import { describe, expect, it } from "vitest";
import { getHierarchyCandidates, type HierarchyTask } from "./task-hierarchy";

const task = (
  id: string,
  parent?: string,
  status = "to-do",
  projectId = "p",
): HierarchyTask => ({
  id,
  title: id,
  number: 1,
  projectId,
  status,
  parentTask: parent ? { id: parent } : null,
});

describe("hierarchy candidates", () => {
  it("excludes self, descendants and archived or foreign tasks when picking a parent", () => {
    const tasks = [
      task("current"),
      task("child", "current"),
      task("grandchild", "child"),
      task("free"),
      task("planned", undefined, "planned"),
      task("archived", undefined, "archived"),
      task("foreign", undefined, "to-do", "other"),
    ];
    expect(
      getHierarchyCandidates(tasks, "current", "p", "parent").map((t) => t.id),
    ).toEqual(["free", "planned"]);
  });
  it("excludes children with parents and ancestors that would create a cycle", () => {
    const tasks = [
      task("root"),
      task("current", "root"),
      task("child", "current"),
      task("elsewhere", "root"),
      task("free"),
    ];
    expect(
      getHierarchyCandidates(tasks, "current", "p", "child").map((t) => t.id),
    ).toEqual(["free"]);
  });
  it("does not offer a second parent and safely handles corrupted cycles", () => {
    expect(
      getHierarchyCandidates(
        [task("current", "parent"), task("parent")],
        "current",
        "p",
        "parent",
      ),
    ).toEqual([]);
    expect(
      getHierarchyCandidates(
        [task("current"), task("a", "b"), task("b", "a")],
        "current",
        "p",
        "parent",
      ),
    ).toEqual([]);
  });
});
