import { authedFetch } from "@/lib/api/authed-fetch";
import type { CreateTaskRequest, UpdateTaskRequest } from "@/lib/api/contracts";

const JSON_HEADERS = { "Content-Type": "application/json" };

/** `POST /api/tasks`: devolve o id da tarefa criada. */
export async function createTask(body: CreateTaskRequest): Promise<string> {
  const { taskId } = await authedFetch<{ taskId: string }>("/api/tasks", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  });
  return taskId;
}

/** `PATCH /api/tasks/:taskId`: responde 204. */
export function updateTask(taskId: string, body: UpdateTaskRequest): Promise<void> {
  return authedFetch<void>(`/api/tasks/${taskId}`, {
    method: "PATCH",
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  });
}

export function deleteTask(taskId: string): Promise<void> {
  return authedFetch<void>(`/api/tasks/${taskId}`, { method: "DELETE" });
}
