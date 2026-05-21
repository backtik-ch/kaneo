import { client } from "@kaneo/libs";
import type { TaskToImport } from "./import-tasks";

export type ImportTasksFromTextResponse = {
  workspaceId: string;
  workspaceName: string;
  projectId: string;
  projectName: string;
  projectSlug: string;
  tasks: TaskToImport[];
};

async function importTasksFromText(notes: string) {
  const response = await client.task.ai["import-from-text"].$post({
    json: { notes },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error);
  }

  return (await response.json()) as ImportTasksFromTextResponse;
}

export default importTasksFromText;
