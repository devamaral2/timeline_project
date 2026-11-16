import { BadRequestException } from "@nestjs/common";
import { createTaskInputSchema, updateTaskInputSchema } from "@repo/contracts/schemas";
import { HUMAN_KINDS, HUMAN_STATUSES, PRIORITIES, isNotificationOffsetMinutes } from "../domain";
import { decodeAgendaCursor } from "../infrastructure/persistence";

/** Os tipos de artefato que o usuario cria e edita. Os demais sao do servidor. */
const EDITABLE_ARTIFACT_TYPES = ["text", "food", "sleep", "training"];

/** Os campos que cada corpo conhece: os dos esquemas do contrato. Qualquer outro, inclusive nome antigo, e recusado. */
const CREATE_TASK_FIELDS = new Set(Object.keys(createTaskInputSchema.shape));
const UPDATE_TASK_FIELDS = new Set(Object.keys(updateTaskInputSchema.shape));
const CREATE_ARTIFACT_FIELDS = new Set(["type", "data", "name", "tags", "taskIds"]);
const UPDATE_ARTIFACT_FIELDS = new Set([...CREATE_ARTIFACT_FIELDS, "expectedRevision", "schemaVersion"]);

function assertKnownFields(body: unknown, known: ReadonlySet<string>): void {
  if (typeof body !== "object" || body === null) return;
  for (const key of Object.keys(body)) {
    if (!known.has(key)) throw new BadRequestException(`Invalid field ${key}`);
  }
}

function isStringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isOneOf(values: readonly string[], value: unknown): boolean {
  return typeof value === "string" && values.includes(value);
}

function assertInstant(value: unknown, field: string, nullable: boolean): void {
  if (value === undefined || (nullable && value === null)) return;
  if (typeof value !== "string" || Number.isNaN(new Date(value).getTime())) {
    throw new BadRequestException(`Invalid ${field}`);
  }
}

/**
 * O que a rota de tarefas confere antes do dominio: a forma do corpo. As
 * regras (o que cada executor aceita, tarefa longa, janela) sao do dominio. Na
 * edicao, `null` apaga o status e as datas.
 */
export function assertTaskFields(body: Record<string, unknown>, editing: boolean): void {
  assertKnownFields(body, editing ? UPDATE_TASK_FIELDS : CREATE_TASK_FIELDS);
  if (body?.kind !== undefined && !isOneOf(HUMAN_KINDS, body.kind)) throw new BadRequestException("Invalid kind");
  if (body?.status !== undefined && !(editing && body.status === null) && !isOneOf(HUMAN_STATUSES, body.status)) {
    throw new BadRequestException("Invalid status");
  }
  if (body?.priority !== undefined && !isOneOf(PRIORITIES, body.priority)) {
    throw new BadRequestException("Invalid priority");
  }
  if (
    body?.notifyOffsetsMinutes !== undefined &&
    !(Array.isArray(body.notifyOffsetsMinutes) && body.notifyOffsetsMinutes.every(isNotificationOffsetMinutes))
  ) {
    throw new BadRequestException("Invalid notifyOffsetsMinutes");
  }
  if (body?.location !== undefined && (typeof body.location !== "string" || body.location.length > 300)) {
    throw new BadRequestException("Invalid location");
  }
  const point = body?.coordinates as { latitude?: unknown; longitude?: unknown } | undefined;
  if (
    point !== undefined &&
    !(
      typeof point === "object" && point !== null &&
      typeof point.latitude === "number" && point.latitude >= -90 && point.latitude <= 90 &&
      typeof point.longitude === "number" && point.longitude >= -180 && point.longitude <= 180
    )
  ) {
    throw new BadRequestException("Invalid coordinates");
  }
  if (body?.longRunning !== undefined && typeof body.longRunning !== "boolean") {
    throw new BadRequestException("Invalid longRunning");
  }
  for (const field of ["tags", "previousTaskIds", "nextTaskIds", "artifactIds"]) {
    if (body?.[field] !== undefined && !isStringList(body[field])) throw new BadRequestException(`Invalid ${field}`);
  }
  if (body?.artifacts !== undefined && !Array.isArray(body.artifacts)) throw new BadRequestException("Invalid artifacts");
  for (const field of ["startedAt", "estimatedFinishAt", "finishedAt"]) assertInstant(body?.[field], field, editing);
}

export function assertExpectedRevision(body: { expectedRevision?: unknown }): void {
  if (!Number.isInteger(body?.expectedRevision) || (body.expectedRevision as number) < 1) {
    throw new BadRequestException("Invalid expectedRevision");
  }
}

export function assertAgendaCursor(cursor: string): void {
  try {
    decodeAgendaCursor(cursor);
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

/**
 * O que a rota de artefatos confere antes do dominio: a forma do corpo. Quem
 * valida o `data` de cada tipo e o registro de tipos do artefato. Na criacao,
 * `type` ausente e texto livre; na edicao, `data` so vem com `type`.
 */
export function assertArtifactRequest(
  body: { type?: unknown; data?: unknown; name?: unknown; tags?: unknown; taskIds?: unknown },
  creating: boolean,
): void {
  assertKnownFields(body, creating ? CREATE_ARTIFACT_FIELDS : UPDATE_ARTIFACT_FIELDS);
  if (body?.type !== undefined && !EDITABLE_ARTIFACT_TYPES.includes(body.type as string)) {
    throw new BadRequestException("Invalid type");
  }
  if (creating ? body?.data === undefined && (body?.type === undefined || body?.type === "text") : (body?.type === undefined) !== (body?.data === undefined)) {
    throw new BadRequestException("Invalid data");
  }
  if (body?.data !== undefined && (typeof body.data !== "object" || body.data === null || Array.isArray(body.data))) {
    throw new BadRequestException("Invalid data");
  }
  if (body?.name !== undefined && typeof body.name !== "string") throw new BadRequestException("Invalid name");
  if (body?.tags !== undefined && !isStringList(body.tags)) throw new BadRequestException("Invalid tags");
  if (body?.taskIds !== undefined && !isStringList(body.taskIds)) throw new BadRequestException("Invalid taskIds");
}

export function assertRecurrenceTemplate(template: unknown, required: boolean): void {
  if (template === undefined && !required) return;
  if (typeof template !== "object" || template === null || Array.isArray(template)) {
    throw new BadRequestException("Invalid template");
  }
}
