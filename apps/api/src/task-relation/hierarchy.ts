import { and, eq, or, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import type db from "../database";
import { taskRelationTable, taskTable } from "../database/schema";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function lockTaskHierarchy(tx: Transaction, projectId: string) {
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(hashtextextended(${`task-hierarchy:${projectId}`}, 0))`,
  );
}

export async function lockTaskInProject(
  tx: Transaction,
  taskId: string,
  projectId: string,
) {
  await lockTaskHierarchy(tx, projectId);
  const [task] = await tx
    .select({ projectId: taskTable.projectId })
    .from(taskTable)
    .where(eq(taskTable.id, taskId));
  if (!task || task.projectId !== projectId) {
    throw new HTTPException(409, {
      message: "Task changed project; reload before moving it",
    });
  }
}

export async function assertTaskCanLeaveProject(
  tx: Transaction,
  taskId: string,
  projectId: string,
) {
  await lockTaskInProject(tx, taskId, projectId);
  const [relation] = await tx
    .select({ id: taskRelationTable.id })
    .from(taskRelationTable)
    .where(
      and(
        eq(taskRelationTable.relationType, "subtask"),
        or(
          eq(taskRelationTable.sourceTaskId, taskId),
          eq(taskRelationTable.targetTaskId, taskId),
        ),
      ),
    )
    .limit(1);
  if (relation) {
    throw new HTTPException(409, {
      message:
        "Detach the parent and subtasks before moving this task to another project",
    });
  }
}
