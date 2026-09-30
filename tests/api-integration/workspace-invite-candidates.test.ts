import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import db, { schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import { mockAnonymousSession, mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import { createWorkspaceMember } from "./helpers/fixtures";

describe("API integration: workspace invite candidates", () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  it("lists distinct people across the app, excluding current members and pending invitations", async () => {
    const target = await createWorkspaceMember({ role: "admin" });
    const other = await createWorkspaceMember({ userName: "Zulu" });
    const third = await createWorkspaceMember({ userName: "Alpha" });

    await db
      .update(schema.userTable)
      .set({ email: "alpha-b@example.com" })
      .where(eq(schema.userTable.id, third.user.id));

    const people = [
      { id: "alpha-a", name: "Alpha", email: "alpha-a@example.com" },
      { id: "current", name: "Current", email: "current@example.com" },
      { id: "pending", name: "Pending", email: "pending@example.com" },
      { id: "expired", name: "Expired", email: "expired@example.com" },
      { id: "cancelled", name: "Cancelled", email: "cancelled@example.com" },
      { id: "rejected", name: "Rejected", email: "rejected@example.com" },
      { id: "no-workspace", name: "No workspace", email: "none@example.com" },
    ];
    await db.insert(schema.userTable).values(people);
    await db.insert(schema.workspaceUserTable).values([
      ...people
        .filter((person) => person.id !== "no-workspace")
        .map((person) => ({
          userId: person.id,
          workspaceId: other.workspace.id,
          role: "member",
          joinedAt: new Date(),
        })),
      {
        userId: "alpha-a",
        workspaceId: third.workspace.id,
        role: "member",
        joinedAt: new Date(),
      },
      {
        userId: "current",
        workspaceId: target.workspace.id,
        role: "member",
        joinedAt: new Date(),
      },
    ]);
    await db.insert(schema.invitationTable).values([
      {
        workspaceId: target.workspace.id,
        email: "PENDING@EXAMPLE.COM",
        status: "pending",
        expiresAt: new Date(Date.now() + 60_000),
        inviterId: target.user.id,
      },
      {
        workspaceId: target.workspace.id,
        email: "expired@example.com",
        status: "pending",
        expiresAt: new Date(Date.now() - 60_000),
        inviterId: target.user.id,
      },
      ...["cancelled", "rejected"].map((id) => ({
        workspaceId: target.workspace.id,
        email: `${id}@example.com`,
        status: id === "cancelled" ? "canceled" : "rejected",
        expiresAt: new Date(Date.now() + 60_000),
        inviterId: target.user.id,
      })),
      {
        workspaceId: other.workspace.id,
        email: "alpha-a@example.com",
        status: "pending",
        expiresAt: new Date(Date.now() + 60_000),
        inviterId: other.user.id,
      },
    ]);

    mockAuthenticatedSession(target.user);
    const { app } = createApp();
    const response = await app.request(
      `/api/workspace/${target.workspace.id}/invite-candidates`,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([
      {
        id: "alpha-a",
        name: "Alpha",
        email: "alpha-a@example.com",
        image: null,
      },
      {
        id: third.user.id,
        name: "Alpha",
        email: "alpha-b@example.com",
        image: null,
      },
      {
        id: "cancelled",
        name: "Cancelled",
        email: "cancelled@example.com",
        image: null,
      },
      {
        id: "rejected",
        name: "Rejected",
        email: "rejected@example.com",
        image: null,
      },
      {
        id: other.user.id,
        name: "Zulu",
        email: other.user.email,
        image: null,
      },
    ]);
  });

  it.each([
    "admin",
    "owner",
  ])("allows %s to fetch an empty list", async (role) => {
    const target = await createWorkspaceMember({ role });
    mockAuthenticatedSession(target.user);
    const { app } = createApp();
    const response = await app.request(
      `/api/workspace/${target.workspace.id}/invite-candidates`,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([]);
  });

  it("rejects unauthenticated requests", async () => {
    mockAnonymousSession();
    const { app } = createApp();
    const response = await app.request(
      "/api/workspace/missing/invite-candidates",
    );
    expect(response.status).toBe(401);
  });

  it("rejects ordinary workspace members", async () => {
    const target = await createWorkspaceMember({ role: "member" });
    mockAuthenticatedSession(target.user);
    const { app } = createApp();
    const response = await app.request(
      `/api/workspace/${target.workspace.id}/invite-candidates`,
    );
    expect(response.status).toBe(403);
  });

  it("rejects admins of other workspaces who are not members of the target", async () => {
    const target = await createWorkspaceMember({ role: "owner" });
    const outsider = await createWorkspaceMember({ role: "admin" });
    mockAuthenticatedSession(outsider.user);
    const { app } = createApp();
    const response = await app.request(
      `/api/workspace/${target.workspace.id}/invite-candidates`,
    );
    expect(response.status).toBe(403);
  });
});
