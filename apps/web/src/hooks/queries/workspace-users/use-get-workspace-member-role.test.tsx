import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authClient } from "@/lib/auth-client";
import useGetWorkspaceMemberRole from "./use-get-workspace-member-role";

vi.mock("@/components/providers/auth-provider/hooks/use-auth", () => ({
  default: () => ({ user: { id: "current-user" } }),
}));

vi.mock("@/lib/auth-client", () => ({
  authClient: { organization: { getActiveMemberRole: vi.fn() } },
}));

function renderRole(workspaceId: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return renderHook(() => useGetWorkspaceMemberRole(workspaceId), {
    wrapper: ({ children }: PropsWithChildren) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  });
}

describe("useGetWorkspaceMemberRole", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(cleanup);

  it.each([
    "admin",
    "owner",
    "member",
  ])("reads the current user's %s role in the requested workspace", async (role) => {
    vi.mocked(authClient.organization.getActiveMemberRole).mockResolvedValue({
      data: { role },
      error: null,
    });
    const { result } = renderRole("target-workspace");
    await waitFor(() => expect(result.current.data).toBe(role));
    expect(authClient.organization.getActiveMemberRole).toHaveBeenCalledWith({
      query: { organizationId: "target-workspace" },
    });
  });

  it("does not expose a role when permission lookup fails", async () => {
    vi.mocked(authClient.organization.getActiveMemberRole).mockResolvedValue({
      data: null,
      error: { message: "Forbidden", status: 403, statusText: "Forbidden" },
    });
    const { result } = renderRole("target-workspace");
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
  });
});
