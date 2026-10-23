import { afterEach, describe, expect, it, vi } from "vitest";
import { registerMcpTools } from "../../../apps/api/src/mcp/tools";

type RegisteredTool = {
  config: { inputSchema: { parse: (args: unknown) => unknown } };
  handler: (args: Record<string, unknown>) => Promise<{
    content: Array<{ type: string; text: string }>;
    isError?: boolean;
  }>;
};

function setup() {
  const tools = new Map<string, RegisteredTool>();
  const server = {
    registerTool(
      name: string,
      config: RegisteredTool["config"],
      handler: RegisteredTool["handler"],
    ) {
      tools.set(name, { config, handler });
    },
  };
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  registerMcpTools(server as never, "https://kaneo.example", "test-token");
  return { tools, fetchMock };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("HTTP MCP task relation tools", () => {
  it("retrieves relation details using the authenticated API client", async () => {
    const { tools, fetchMock } = setup();
    const relations = [
      {
        id: "relation-1",
        sourceTaskId: "parent-1",
        targetTaskId: "child-1",
        relationType: "subtask",
        sourceTask: { id: "parent-1", title: "Parent" },
        targetTask: { id: "child-1", title: "Child" },
      },
    ];
    fetchMock.mockResolvedValue(Response.json(relations));

    const result = await tools.get("get_task_relations")?.handler({
      taskId: "task /1",
    });

    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
      "https://kaneo.example/api/task-relation/task%20%2F1",
      expect.objectContaining({ method: "GET" }),
    );
    const headers = fetchMock.mock.calls[0]?.[1].headers as Headers;
    expect(headers.get("Authorization")).toBe("Bearer test-token");
    expect(result?.isError).toBe(false);
    expect(JSON.parse(result?.content[0]?.text ?? "null")).toEqual(relations);
  });

  it.each([
    "subtask",
    "blocks",
    "related",
  ])("creates a %s relation through the existing API route", async (relationType) => {
    const { tools, fetchMock } = setup();
    const input = {
      sourceTaskId: "parent-1",
      targetTaskId: "child-1",
      relationType,
    };
    const relation = { id: "relation-1", ...input };
    fetchMock.mockResolvedValue(Response.json(relation));
    const tool = tools.get("create_task_relation");
    expect(tool?.config.inputSchema.parse(input)).toEqual(input);

    const result = await tool?.handler(input);

    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
      "https://kaneo.example/api/task-relation",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify(input),
      }),
    );
    const headers = fetchMock.mock.calls[0]?.[1].headers as Headers;
    expect(headers.get("Authorization")).toBe("Bearer test-token");
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(result?.isError).toBe(false);
    expect(JSON.parse(result?.content[0]?.text ?? "null")).toEqual(relation);
  });

  it("deletes the relation without requesting task deletion", async () => {
    const { tools, fetchMock } = setup();
    fetchMock.mockResolvedValue(Response.json({ id: "relation /1" }));

    const result = await tools.get("delete_task_relation")?.handler({
      relationId: "relation /1",
    });

    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
      "https://kaneo.example/api/task-relation/relation%20%2F1",
      expect.objectContaining({ method: "DELETE" }),
    );
    expect(result?.isError).toBe(false);
  });

  it.each([
    ["get_task_relations", { taskId: " " }],
    ["delete_task_relation", { relationId: " " }],
    [
      "create_task_relation",
      { sourceTaskId: " ", targetTaskId: "child-1", relationType: "subtask" },
    ],
    [
      "create_task_relation",
      { sourceTaskId: "parent-1", targetTaskId: " ", relationType: "subtask" },
    ],
    [
      "create_task_relation",
      {
        sourceTaskId: "parent-1",
        targetTaskId: "child-1",
        relationType: "parent",
      },
    ],
  ])("rejects invalid input for %s", (name, input) => {
    const { tools, fetchMock } = setup();
    const schema = tools.get(name)?.config.inputSchema;
    expect(schema).toBeDefined();
    expect(() => schema?.parse(input)).toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    [
      "get_task_relations",
      { taskId: "task-1" },
      403,
      "Workspace access denied",
    ],
    [
      "delete_task_relation",
      { relationId: "relation-1" },
      404,
      "Relation not found",
    ],
    [
      "create_task_relation",
      {
        sourceTaskId: "parent-1",
        targetTaskId: "child-1",
        relationType: "subtask",
      },
      409,
      "This relation already exists",
    ],
  ])("returns API failures as MCP errors for %s", async (name, input, status, message) => {
    const { tools, fetchMock } = setup();
    fetchMock.mockResolvedValue(Response.json({ message }, { status }));

    const result = await tools.get(name)?.handler(input);

    expect(result?.isError).toBe(true);
    expect(JSON.parse(result?.content[0]?.text ?? "null")).toEqual({
      error: expect.stringContaining(message),
    });
  });
});
