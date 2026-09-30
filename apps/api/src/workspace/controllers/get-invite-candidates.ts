import { and, asc, eq, exists, ne, notExists, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import {
  invitationTable,
  userTable,
  workspaceUserTable,
} from "../../database/schema";

async function getInviteCandidates(workspaceId: string, userId: string) {
  const [membership] = await db
    .select({ role: workspaceUserTable.role })
    .from(workspaceUserTable)
    .where(
      and(
        eq(workspaceUserTable.workspaceId, workspaceId),
        eq(workspaceUserTable.userId, userId),
      ),
    )
    .limit(1);

  if (!membership || !["admin", "owner"].includes(membership.role)) {
    throw new HTTPException(403, {
      message: "You don't have permission to invite workspace members",
    });
  }

  return db
    .select({
      id: userTable.id,
      name: userTable.name,
      email: userTable.email,
      image: userTable.image,
    })
    .from(userTable)
    .where(
      and(
        exists(
          db
            .select({ id: workspaceUserTable.id })
            .from(workspaceUserTable)
            .where(
              and(
                eq(workspaceUserTable.userId, userTable.id),
                ne(workspaceUserTable.workspaceId, workspaceId),
              ),
            ),
        ),
        notExists(
          db
            .select({ id: workspaceUserTable.id })
            .from(workspaceUserTable)
            .where(
              and(
                eq(workspaceUserTable.userId, userTable.id),
                eq(workspaceUserTable.workspaceId, workspaceId),
              ),
            ),
        ),
        notExists(
          db
            .select({ id: invitationTable.id })
            .from(invitationTable)
            .where(
              and(
                eq(invitationTable.workspaceId, workspaceId),
                eq(invitationTable.status, "pending"),
                sql`lower(${invitationTable.email}) = lower(${userTable.email})`,
              ),
            ),
        ),
      ),
    )
    .orderBy(asc(userTable.name), asc(userTable.email));
}

export default getInviteCandidates;
