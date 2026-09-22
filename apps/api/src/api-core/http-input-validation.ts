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
