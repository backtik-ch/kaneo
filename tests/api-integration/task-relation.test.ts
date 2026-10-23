import { readFileSync } from "node:fs";
import { eq, inArray, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import db, { schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import moveTask from "../../apps/api/src/task/controllers/move-task";
import updateTask from "../../apps/api/src/task/controllers/update-task";
import { mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import {
  createProjectFixture,
  createWorkspaceMember,
} from "./helpers/fixtures";

async function setup() {
  const member = await createWorkspaceMember();
  const { project, columns } = await createProjectFixture({
    workspaceId: member.workspace.id,
  });
  const tasks = await db
    .insert(schema.taskTable)
    .values(
      ["A", "B", "C", "D"].map((title, number) => ({
        title,
        projectId: project.id,
        status: "to-do",
        columnId: columns.todo.id,
        number: number + 1,
        position: number,
      })),
    )
    .returning();
  mockAuthenticatedSession(member.user);
  const { app } = createApp();
  const link = (
    sourceTaskId: string,
    targetTaskId: string,
    relationType = "subtask",
  ) =>
    app.request("/api/task-relation", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sourceTaskId, targetTaskId, relationType }),
    });
  return { ...member, project, tasks, app, link };
}

beforeEach(resetTestDatabase);

describe("API integration: task hierarchy", () => {
  it("links existing tasks in both directions and detaches without deleting tasks", async () => {
    const {
      tasks: [parent, child],
      app,
      link,
    } = await setup();
    const response = await link(parent.id, child.id);
    expect(response.status).toBe(200);
    const relation = await response.json();
    for (const task of [parent, child]) {
      const result = await app.request(`/api/task-relation/${task.id}`);
      expect(result.status).toBe(200);
      expect(await result.json()).toEqual([
        expect.objectContaining({
          id: relation.id,
          sourceTaskId: parent.id,
          targetTaskId: child.id,
          sourceTask: expect.objectContaining({ id: parent.id }),
          targetTask: expect.objectContaining({ id: child.id }),
        }),
      ]);
    }
    const removed = await app.request(`/api/task-relation/${relation.id}`, {
      method: "DELETE",
    });
    expect(removed.status).toBe(200);
    expect(
      await db
        .select()
        .from(schema.taskTable)
        .where(inArray(schema.taskTable.id, [parent.id, child.id])),
    ).toHaveLength(2);
    expect(await db.select().from(schema.taskRelationTable)).toHaveLength(0);
  });

  it("rejects self-links, a second parent and indirect cycles", async () => {
    const {
      tasks: [a, b, c],
      link,
    } = await setup();
    expect((await link(a.id, a.id)).status).toBe(400);
    expect((await link(a.id, b.id)).status).toBe(200);
    expect((await link(c.id, b.id)).status).toBe(409);
    expect((await link(b.id, c.id)).status).toBe(200);
    const cycle = await link(c.id, a.id);
    expect(cycle.status).toBe(409);
    expect(await cycle.text()).toMatch(/cycle/i);
  });

  it("rejects a parent from another project in the same workspace", async () => {
    const {
      workspace,
      tasks: [child],
      link,
    } = await setup();
    const { project } = await createProjectFixture({
      workspaceId: workspace.id,
    });
    const [other] = await db
      .insert(schema.taskTable)
      .values({
        title: "Other project",
        projectId: project.id,
        status: "to-do",
      })
      .returning();
    expect((await link(other.id, child.id)).status).toBe(400);
  });

  it("checks access to the target workspace for every relation type", async () => {
    const {
      tasks: [source],
      link,
    } = await setup();
    const outsider = await createWorkspaceMember();
    const { project } = await createProjectFixture({
      workspaceId: outsider.workspace.id,
    });
    const [target] = await db
      .insert(schema.taskTable)
      .values({ title: "Private", projectId: project.id, status: "to-do" })
      .returning();
    for (const type of ["subtask", "related", "blocks"])
      expect((await link(source.id, target.id, type)).status).toBe(403);
  });

  it("allows related and blocking links alongside the parent-child link", async () => {
    const {
      tasks: [parent, child],
      link,
    } = await setup();
    for (const type of ["subtask", "related", "blocks"])
      expect((await link(parent.id, child.id, type)).status).toBe(200);
  });

  it("serializes competing assignments to the same child", async () => {
    const {
      tasks: [a, b, child],
      link,
    } = await setup();
    const results = await Promise.all([
      link(a.id, child.id),
      link(b.id, child.id),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual([200, 409]);
    expect(await db.select().from(schema.taskRelationTable)).toHaveLength(1);
  });

  it("rejects a cycle formed by concurrent requests", async () => {
    const {
      tasks: [a, b, c],
      link,
    } = await setup();
    const results = await Promise.all([
      link(a.id, b.id),
      link(b.id, c.id),
      link(c.id, a.id),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual([
      200, 200, 409,
    ]);
  });

  it("enforces parent uniqueness for direct database writes too", async () => {
    const {
      tasks: [a, b, child],
      link,
    } = await setup();
    expect((await link(a.id, child.id)).status).toBe(200);
    await expect(
      db.insert(schema.taskRelationTable).values({
        sourceTaskId: b.id,
        targetTaskId: child.id,
        relationType: "subtask",
      }),
    ).rejects.toThrow();
  });

  it("requires detaching hierarchy links before moving a task to another project", async () => {
    const {
      user,
      workspace,
      tasks: [parent, child],
      link,
    } = await setup();
    const { project } = await createProjectFixture({
      workspaceId: workspace.id,
    });
    expect((await link(parent.id, child.id)).status).toBe(200);
    await expect(
      moveTask({
        taskId: parent.id,
        destinationProjectId: project.id,
        currentUserId: user.id,
      }),
    ).rejects.toThrow(/Detach/);
    await expect(
      updateTask(
        child.id,
        child.title,
        "to-do",
        undefined,
        undefined,
        project.id,
        "",
        "low",
        1,
        undefined,
        user.id,
      ),
    ).rejects.toThrow(/Detach/);
    expect(
      (
        await db.query.taskTable.findFirst({
          where: eq(schema.taskTable.id, child.id),
        })
      )?.projectId,
    ).toBe(child.projectId);
  });
});

describe("task hierarchy migration preflight", () => {
  const migration = readFileSync(
    new URL("../../apps/api/drizzle/0031_task_hierarchy.sql", import.meta.url),
    "utf8",
  );
  it.each([
    "multiple parents",
    "cycle",
    "different projects",
  ])("rejects legacy %s without deleting links", async (scenario) => {
    const {
      workspace,
      tasks: [a, b, c],
    } = await setup();
    let otherId = c.id;
    if (scenario === "different projects") {
      const { project } = await createProjectFixture({
        workspaceId: workspace.id,
      });
      const [other] = await db
        .insert(schema.taskTable)
        .values({
          title: "Other project",
          projectId: project.id,
          status: "to-do",
        })
        .returning();
      otherId = other.id;
    }
    await expect(
      db.transaction(async (tx) => {
        await tx.execute(sql`DROP INDEX task_relation_single_parent_idx`);
        const pairs =
          scenario === "multiple parents"
            ? [
                [a.id, b.id],
                [c.id, b.id],
              ]
            : scenario === "cycle"
              ? [
                  [a.id, b.id],
                  [b.id, c.id],
                  [c.id, a.id],
                ]
              : [[a.id, otherId]];
        await tx.insert(schema.taskRelationTable).values(
          pairs.map(([sourceTaskId, targetTaskId]) => ({
            sourceTaskId,
            targetTaskId,
            relationType: "subtask",
          })),
        );
        await tx.execute(sql.raw(migration));
      }),
    ).rejects.toThrow(/Task hierarchy migration stopped/);
    expect(await db.select().from(schema.taskTable)).toHaveLength(
      scenario === "different projects" ? 5 : 4,
    );
  });
});
