import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import getInviteCandidates from "@/fetchers/workspace-user/get-invite-candidates";
import { authClient } from "@/lib/auth-client";
import { toast } from "@/lib/toast";
import InviteTeamMemberModal from "./invite-team-member-modal";

vi.mock("@/fetchers/workspace-user/get-invite-candidates", () => ({
  default: vi.fn(),
}));

vi.mock("@/lib/auth-client", () => ({
  authClient: { organization: { inviteMember: vi.fn() } },
}));

vi.mock("@/lib/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/lib/i18n", () => ({
  i18n: { t: (key: string) => key },
}));

vi.mock(
  "@/routes/_layout/_authenticated/dashboard/workspace/$workspaceId/members",
  () => ({ Route: { useParams: () => ({ workspaceId: "workspace-1" }) } }),
);

const candidates = [
  { id: "alice", name: "Alice", email: "alice@example.com", image: null },
  { id: "bob", name: "Bob", email: "bob@example.com", image: null },
];
const queryKey = ["workspace-invite-candidates", "workspace-1"];

function renderModal(open = true) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  const onClose = vi.fn();
  const element = (isOpen: boolean) => (
    <QueryClientProvider client={queryClient}>
      <InviteTeamMemberModal open={isOpen} onClose={onClose} />
    </QueryClientProvider>
  );
  const result = render(element(open));
  return {
    queryClient,
    onClose,
    rerender: (isOpen: boolean) => result.rerender(element(isOpen)),
  };
}

function emailInput() {
  return screen.getByRole("textbox", { name: "team:inviteModal.emailLabel" });
}

function submitButton() {
  return screen.getByRole("button", {
    name: /^team:inviteModal.sendInvitation/,
  });
}

describe("InviteTeamMemberModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getInviteCandidates).mockResolvedValue(candidates);
    vi.mocked(authClient.organization.inviteMember).mockResolvedValue({
      data: null,
      error: null,
    });
  });

  afterEach(cleanup);

  it("filters by name and email without case sensitivity, and selects without sending", async () => {
    renderModal();
    const alice = await screen.findByRole("button", {
      name: "Alice (alice@example.com)",
    });
    expect(
      screen.getByRole("button", { name: "Bob (bob@example.com)" }),
    ).toBeVisible();

    fireEvent.change(emailInput(), { target: { value: "ALIC" } });
    expect(alice).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Bob (bob@example.com)" }),
    ).toBeNull();
    fireEvent.change(emailInput(), { target: { value: "BOB@EXAMPLE" } });
    expect(
      screen.getByRole("button", { name: "Bob (bob@example.com)" }),
    ).toBeVisible();
    fireEvent.change(emailInput(), { target: { value: "" } });

    const selection = screen.getByRole("button", {
      name: "Alice (alice@example.com)",
    });
    selection.focus();
    expect(selection).toHaveFocus();
    expect(selection.tagName).toBe("BUTTON");
    expect(selection).toHaveAttribute("type", "button");
    fireEvent.click(selection);
    expect(emailInput()).toHaveValue("alice@example.com");
    expect(emailInput()).toHaveFocus();
    expect(authClient.organization.inviteMember).not.toHaveBeenCalled();
  });

  it("keeps the modal open, removes the invited person and resets focus after success", async () => {
    const { onClose, queryClient } = renderModal();
    fireEvent.click(
      await screen.findByRole("button", { name: "Alice (alice@example.com)" }),
    );
    vi.mocked(getInviteCandidates).mockResolvedValue([candidates[1]]);
    const invalidation = vi.spyOn(queryClient, "invalidateQueries");
    fireEvent.click(submitButton());

    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    expect(authClient.organization.inviteMember).toHaveBeenCalledWith({
      email: "alice@example.com",
      organizationId: "workspace-1",
      role: "member",
      resend: undefined,
    });
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeVisible();
    expect(emailInput()).toHaveValue("");
    expect(emailInput()).toHaveFocus();
    expect(
      screen.queryByRole("button", { name: "Alice (alice@example.com)" }),
    ).toBeNull();
    expect(
      await screen.findByRole("button", { name: "Bob (bob@example.com)" }),
    ).toBeVisible();
    for (const key of [
      queryKey,
      ["workspace-invites", "workspace-1"],
      ["workspace", "full", "workspace-1"],
      ["workspace-users", "workspace-1"],
    ]) {
      expect(invalidation).toHaveBeenCalledWith({ queryKey: key });
    }
  });

  it("allows manual invitations when suggestions fail", async () => {
    vi.mocked(getInviteCandidates).mockRejectedValue(new Error("Unavailable"));
    renderModal();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "team:inviteModal.suggestionsError",
    );
    fireEvent.change(emailInput(), { target: { value: "new@example.com" } });
    fireEvent.click(submitButton());
    await waitFor(() =>
      expect(authClient.organization.inviteMember).toHaveBeenCalledWith(
        expect.objectContaining({ email: "new@example.com", role: "member" }),
      ),
    );
  });

  it("can retry loading suggestions after a failure", async () => {
    vi.mocked(getInviteCandidates).mockRejectedValueOnce(
      new Error("Unavailable"),
    );
    renderModal();
    await screen.findByRole("alert");
    fireEvent.click(
      screen.getByRole("button", { name: "team:inviteModal.retrySuggestions" }),
    );
    expect(
      await screen.findByRole("button", { name: "Alice (alice@example.com)" }),
    ).toBeVisible();
  });

  it("keeps the entered address and suggestions when sending fails", async () => {
    vi.mocked(authClient.organization.inviteMember).mockResolvedValueOnce({
      data: null,
      error: {
        message: "Invitation failed",
        status: 400,
        statusText: "Bad Request",
      },
    });
    const { onClose } = renderModal();
    fireEvent.click(
      await screen.findByRole("button", { name: "Alice (alice@example.com)" }),
    );
    fireEvent.click(submitButton());
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Invitation failed"),
    );
    expect(emailInput()).toHaveValue("alice@example.com");
    expect(
      screen.getByRole("button", { name: "Alice (alice@example.com)" }),
    ).toBeVisible();
    expect(onClose).not.toHaveBeenCalled();
    expect(submitButton()).toBeEnabled();
  });

  it("blocks duplicate submits while an invitation is in flight", async () => {
    let finish: (() => void) | undefined;
    vi.mocked(authClient.organization.inviteMember).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = () => resolve({ data: null, error: null });
        }),
    );
    renderModal();
    fireEvent.click(
      await screen.findByRole("button", { name: "Alice (alice@example.com)" }),
    );
    const form = emailInput().closest("form");
    if (!form) throw new Error("Invitation form is missing");
    fireEvent.submit(form);
    fireEvent.submit(form);
    await waitFor(() =>
      expect(authClient.organization.inviteMember).toHaveBeenCalledTimes(1),
    );
    expect(submitButton()).toBeDisabled();
    expect(emailInput()).toHaveAttribute("readonly");
    await act(async () => finish?.());
  });

  it("loads only while open and refreshes suggestions when reopened", async () => {
    const { rerender } = renderModal(false);
    expect(getInviteCandidates).not.toHaveBeenCalled();
    rerender(true);
    await screen.findByRole("button", { name: "Alice (alice@example.com)" });
    rerender(false);
    vi.mocked(getInviteCandidates).mockResolvedValue([candidates[1]]);
    rerender(true);
    await waitFor(() => expect(getInviteCandidates).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Alice (alice@example.com)" }),
      ).toBeNull(),
    );
  });

  it("shows a loading state while suggestions are being fetched", async () => {
    let finish: (() => void) | undefined;
    vi.mocked(getInviteCandidates).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = () => resolve(candidates);
        }),
    );
    renderModal();
    expect(screen.getByRole("status")).toHaveTextContent(
      "team:inviteModal.loadingSuggestions",
    );
    expect(emailInput()).toBeEnabled();
    await act(async () => finish?.());
  });

  it("distinguishes an empty list from a search with no matches", async () => {
    const { queryClient } = renderModal();
    await screen.findByRole("button", { name: "Alice (alice@example.com)" });
    fireEvent.change(emailInput(), { target: { value: "nobody" } });
    expect(screen.getByRole("status")).toHaveTextContent(
      "team:inviteModal.noMatchingSuggestions",
    );
    await act(async () => queryClient.setQueryData(queryKey, []));
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "team:inviteModal.noSuggestions",
      ),
    );
  });
});
