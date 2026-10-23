import { and, eq, inArray, or } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { taskRelationTable, taskTable } from "../../database/schema";
import { publishEvent } from "../../events";
import { lockTaskHierarchy } from "../hierarchy";

async function createTaskRelation({
  sourceTaskId,
  targetTaskId,
  relationType,
  userId,
}: {
  sourceTaskId: string;
  targetTaskId: string;
  relationType: string;
  userId: string;
}) {
  if (sourceTaskId === targetTaskId) {
    throw new HTTPException(400, {
      message: "Cannot create a relation between a task and itself",
    });
  }
  const sourceTask = await db.query.taskTable.findFirst({
    where: eq(taskTable.id, sourceTaskId),
  });
  if (!sourceTask)
    throw new HTTPException(404, { message: "Source task not found" });

  const relation = await db.transaction(async (tx) => {
    if (relationType === "subtask")
      await lockTaskHierarchy(tx, sourceTask.projectId);
    const tasks = await tx
      .select({ id: taskTable.id, projectId: taskTable.projectId })
      .from(taskTable)
      .where(inArray(taskTable.id, [sourceTaskId, targetTaskId]));
    const source = tasks.find((task) => task.id === sourceTaskId);
    const target = tasks.find((task) => task.id === targetTaskId);
    if (!source)
      throw new HTTPException(404, { message: "Source task not found" });
    if (!target)
      throw new HTTPException(404, { message: "Target task not found" });
    if (relationType === "subtask") {
      if (source.projectId !== sourceTask.projectId) {
        throw new HTTPException(409, {
          message: "Task changed project; reload before linking it",
        });
      }
      if (source.projectId !== target.projectId) {
        throw new HTTPException(400, {
          message: "Parent and child tasks must belong to the same project",
        });
      }
      const hierarchy = await tx
        .select({
          sourceTaskId: taskRelationTable.sourceTaskId,
          targetTaskId: taskRelationTable.targetTaskId,
        })
        .from(taskRelationTable)
        .innerJoin(taskTable, eq(taskRelationTable.sourceTaskId, taskTable.id))
        .where(
          and(
            eq(taskRelationTable.relationType, "subtask"),
            eq(taskTable.projectId, source.projectId),
          ),
        );
      if (hierarchy.some((link) => link.targetTaskId === targetTaskId)) {
        throw new HTTPException(409, {
          message:
            "This task already has a parent; detach it before selecting another parent",
        });
      }
      const parents = new Map(
        hierarchy.map((link) => [link.targetTaskId, link.sourceTaskId]),
      );
      const visited = new Set<string>();
      let ancestor: string | undefined = sourceTaskId;
      while (ancestor) {
        if (ancestor === targetTaskId || visited.has(ancestor)) {
          throw new HTTPException(409, {
            message: "This relation would create a cycle in the task hierarchy",
          });
        }
        visited.add(ancestor);
        ancestor = parents.get(ancestor);
      }
    }
    const [existing] = await tx
      .select({ id: taskRelationTable.id })
      .from(taskRelationTable)
      .where(
        and(
          eq(taskRelationTable.relationType, relationType),
          or(
            and(
              eq(taskRelationTable.sourceTaskId, sourceTaskId),
              eq(taskRelationTable.targetTaskId, targetTaskId),
            ),
            and(
              eq(taskRelationTable.sourceTaskId, targetTaskId),
              eq(taskRelationTable.targetTaskId, sourceTaskId),
            ),
          ),
        ),
      )
      .limit(1);
    if (existing)
      throw new HTTPException(409, { message: "This relation already exists" });
    const [created] = await tx
      .insert(taskRelationTable)
      .values({ sourceTaskId, targetTaskId, relationType })
      .returning();
    if (!created)
      throw new HTTPException(500, {
        message: "Failed to create task relation",
      });
    return created;
  });

  await publishEvent("task-relation.created", {
    ...relation,
    taskId: sourceTaskId,
    projectId: sourceTask.projectId,
    userId,
  });
  return relation;
}

export default createTaskRelation;
