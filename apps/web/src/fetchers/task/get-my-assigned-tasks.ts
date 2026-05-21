import { client } from "@kaneo/libs";

export type MyAssignedTask = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string | null;
  number: number | null;
  projectId: string;
  columnId: string | null;
  dueDate: string | null;
  createdAt: string;
  updatedAt: string;
  workspaceId: string;
  workspaceName: string;
  projectName: string;
  projectSlug: string;
  columnName: string | null;
  columnSlug: string | null;
  columnIsFinal: boolean | null;
};

async function getMyAssignedTasks() {
  const response = await client.task.assigned.me.$get();

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error);
  }

  const json = await response.json();
  return json.data as MyAssignedTask[];
}

export default getMyAssignedTasks;
