import type { CreateRecurrenceInput, RecurrenceDto, UpdateRecurrenceInput } from "@repo/contracts";
import { apiRequest, newIdempotencyKey } from "./client-request";

/** Edição: a rota leva o `recurrenceId`, então o corpo não o repete. `expectedRevision` vem da série lida. */
export type EditRecurrenceInput = Omit<UpdateRecurrenceInput, "recurrenceId">;

export function listRecurrences(): Promise<RecurrenceDto[]> {
  return apiRequest<RecurrenceDto[]>("GET", "/api/recurrences");
}

export function getRecurrence(recurrenceId: string): Promise<RecurrenceDto> {
  return apiRequest<RecurrenceDto>("GET", `/api/recurrences/${encodeURIComponent(recurrenceId)}`);
}

/** Devolve o id da série criada. Quem cria passa a chave de `newIdempotencyKey`, estável no formulário. */
export async function createRecurrence(
  input: CreateRecurrenceInput,
  options: { idempotencyKey: string },
): Promise<string> {
  const created = await apiRequest<{ recurrenceId: string }>("POST", "/api/recurrences", {
    body: input,
    idempotencyKey: options.idempotencyKey,
  });
  return created.recurrenceId;
}

export function editRecurrence(recurrenceId: string, input: EditRecurrenceInput): Promise<void> {
  return apiRequest<void>("PATCH", `/api/recurrences/${encodeURIComponent(recurrenceId)}`, { body: input });
}

export function deleteRecurrence(recurrenceId: string): Promise<void> {
  return apiRequest<void>("DELETE", `/api/recurrences/${encodeURIComponent(recurrenceId)}`);
}

export { newIdempotencyKey };
