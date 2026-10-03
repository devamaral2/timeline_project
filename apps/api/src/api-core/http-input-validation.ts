import { BadRequestException } from "@nestjs/common";
import { isEventPriority, isNotificationOffsetMinutes, isWorkItemPriority, isWorkItemStatus } from "../domain";
import { decodeTimelineCursor } from "../infrastructure/persistence";

export function assertEventMarks(body: {
  missed?: unknown;
  priority?: unknown;
  notifyOffsetsMinutes?: unknown;
}): void {
  if (body?.missed !== undefined && typeof body.missed !== "boolean") {
    throw new BadRequestException("Invalid missed flag");
  }
  if (body?.priority !== undefined && !isEventPriority(body.priority)) {
    throw new BadRequestException("Invalid event priority");
  }
  if (body?.notifyOffsetsMinutes !== undefined && !isNotificationOffsets(body.notifyOffsetsMinutes)) {
    throw new BadRequestException("Invalid notifyOffsetsMinutes");
  }
}

export function assertEventWindow(body: { startedAt?: unknown; finishedAt?: unknown }): void {
  assertInstant(body?.startedAt, "startedAt");
  assertInstant(body?.finishedAt, "finishedAt");
}

export function assertExpectedRevision(body: { expectedRevision?: unknown }): void {
  if (!Number.isInteger(body?.expectedRevision) || (body.expectedRevision as number) < 1) {
    throw new BadRequestException("Invalid expectedRevision");
  }
}

export function assertTimelineCursor(cursor: string): void {
  try {
    decodeTimelineCursor(cursor);
  } catch {
    throw new BadRequestException("Invalid cursor");
  }
}

export function parseLimit(raw?: string): number | undefined {
  if (raw === undefined) return undefined;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > 100) {
    throw new BadRequestException("Invalid limit");
  }
  return value;
}

export function assertTaskFields(body: {
  status?: unknown;
  priority?: unknown;
  notifyOffsetsMinutes?: unknown;
  dependsOnTaskIds?: unknown;
}): void {
  if (body?.status !== undefined && !isWorkItemStatus(body.status)) {
    throw new BadRequestException("Invalid status");
  }
  if (body?.priority !== undefined && !isWorkItemPriority(body.priority)) {
    throw new BadRequestException("Invalid priority");
  }
  if (body?.notifyOffsetsMinutes !== undefined && !isNotificationOffsets(body.notifyOffsetsMinutes)) {
    throw new BadRequestException("Invalid notifyOffsetsMinutes");
  }
  if (
    body?.dependsOnTaskIds !== undefined &&
    (!Array.isArray(body.dependsOnTaskIds) || body.dependsOnTaskIds.some((id) => typeof id !== "string"))
  ) {
    throw new BadRequestException("Invalid dependsOnTaskIds");
  }
}

export function assertParentTaskId(body: { parentTaskId?: unknown }): void {
  if (body?.parentTaskId !== undefined && body.parentTaskId !== null && typeof body.parentTaskId !== "string") {
    throw new BadRequestException("Invalid parentTaskId");
  }
}

const NOTE_TYPES = ["text", "meal", "sleep", "training"];

/**
 * O que a rota de notas confere antes do dominio: a forma do corpo. Quem valida
 * o `data` de cada tipo e o registro de tipos da note. Na criacao, `type` ausente
 * e texto livre; na edicao, `data` so vem com `type`.
 */
export function assertNoteRequest(
  body: { type?: unknown; data?: unknown; name?: unknown; tags?: unknown; eventIds?: unknown; taskIds?: unknown },
  creating: boolean,
): void {
  if (body?.type !== undefined && !NOTE_TYPES.includes(body.type as string)) {
    throw new BadRequestException("Invalid type");
  }
  if (creating ? body?.data === undefined && (body?.type === undefined || body?.type === "text") : (body?.type === undefined) !== (body?.data === undefined)) {
    throw new BadRequestException("Invalid data");
  }
  if (body?.data !== undefined && (typeof body.data !== "object" || body.data === null || Array.isArray(body.data))) {
    throw new BadRequestException("Invalid data");
  }
  if (body?.name !== undefined && typeof body.name !== "string") {
    throw new BadRequestException("Invalid name");
  }
  for (const field of ["eventIds", "taskIds"] as const) {
    const value = body?.[field];
    if (value !== undefined && (!Array.isArray(value) || value.some((id) => typeof id !== "string"))) {
      throw new BadRequestException(`Invalid ${field}`);
    }
  }
  if (body?.tags !== undefined && (!Array.isArray(body.tags) || body.tags.some((tag) => typeof tag !== "string"))) {
    throw new BadRequestException("Invalid tags");
  }
}

export function assertRecurrenceTemplate(template: unknown, required: boolean): void {
  if (template === undefined && !required) return;
  if (typeof template !== "object" || template === null || Array.isArray(template)) {
    throw new BadRequestException("Invalid template");
  }
}

function assertInstant(value: unknown, field: string): void {
  if (value === undefined) return;
  if (typeof value !== "string" || Number.isNaN(new Date(value).getTime())) {
    throw new BadRequestException(`Invalid ${field}`);
  }
}

function isNotificationOffsets(value: unknown): boolean {
  return Array.isArray(value) && value.every((entry) => isNotificationOffsetMinutes(entry));
}
