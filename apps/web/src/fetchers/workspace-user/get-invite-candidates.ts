import { client } from "@kaneo/libs";
import type { InferRequestType } from "hono/client";

type GetInviteCandidatesRequest = InferRequestType<
  (typeof client.workspace)[":workspaceId"]["invite-candidates"]["$get"]
>["param"];

async function getInviteCandidates({
  workspaceId,
}: GetInviteCandidatesRequest) {
  const response = await client.workspace[":workspaceId"][
    "invite-candidates"
  ].$get({ param: { workspaceId } });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json();
}

export type InviteCandidate = Awaited<
  ReturnType<typeof getInviteCandidates>
>[number];

export default getInviteCandidates;
