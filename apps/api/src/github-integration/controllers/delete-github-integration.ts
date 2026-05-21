import { and, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { integrationTable, projectTable } from "../../database/schema";

export async function deleteGithubIntegrationById(integrationId: string) {
  const existingIntegration = await db.query.integrationTable.findFirst({
    where: and(
      eq(integrationTable.id, integrationId),
      eq(integrationTable.type, "github"),
    ),
  });

  if (!existingIntegration) {
    throw new HTTPException(404, { message: "GitHub integration not found" });
  }

  await db
    .delete(integrationTable)
    .where(eq(integrationTable.id, integrationId));

  return { success: true, message: "GitHub integration deleted" };
}

async function deleteGithubIntegration(projectId: string) {
  const project = await db.query.projectTable.findFirst({
    where: eq(projectTable.id, projectId),
  });

  if (!project) {
    throw new HTTPException(404, { message: "Project not found" });
  }

  const existingIntegration = await db.query.integrationTable.findFirst({
    where: and(
      eq(integrationTable.workspaceId, project.workspaceId),
      eq(integrationTable.type, "github"),
    ),
    orderBy: (table, { asc }) => [asc(table.createdAt)],
  });

  if (!existingIntegration) {
    throw new HTTPException(404, { message: "GitHub integration not found" });
  }

  await db
    .delete(integrationTable)
    .where(eq(integrationTable.id, existingIntegration.id));

  return { success: true, message: "GitHub integration deleted" };
}

export default deleteGithubIntegration;
