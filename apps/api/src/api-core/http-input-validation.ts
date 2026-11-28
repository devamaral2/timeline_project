import { BadRequestError } from "../common/http-errors";
import {
  createArtifactRequestSchema,
  createProjectInputSchema,
  createTaskInputSchema,
  setTaskSituationInputSchema,
  updateArtifactRequestSchema,
  updateTaskInputSchema,
} from "@repo/contracts/schemas";
import { FREE_TEXT_ARTIFACT_TYPES, isFreeTextArtifactType } from "@repo/contracts/artifact-types";
import type { ZodType } from "zod";
import { HUMAN_KINDS, HUMAN_STATUSES, PRIORITIES, SITUATIONS, isNotificationOffsetMinutes } from "../domain";
import { decodeAgendaCursor } from "../infrastructure/persistence";

/** Os tipos de artefato que o usuario cria e edita. Os demais sao do servidor. */
const EDITABLE_ARTIFACT_TYPES: readonly string[] = [...FREE_TEXT_ARTIFACT_TYPES, "food", "sleep", "training"];

/**
 * Os campos de um esquema do contrato: as chaves do objeto ou, numa uniao de
 * objetos (artefato com `type`), a uniao das chaves de cada variante.
 */
export function bodyFieldsOf(schema: ZodType): Set<string> {
  const { shape, options } = schema as unknown as { shape?: Record<string, unknown>; options?: ZodType[] };
  if (shape) return new Set(Object.keys(shape));
  if (options) return new Set(options.flatMap((option) => [...bodyFieldsOf(option)]));
  throw new Error("A body schema must be an object or a union of objects");
}

/** Os campos que cada corpo conhece: os dos esquemas do contrato. Qualquer outro, inclusive nome antigo, e recusado. */
const CREATE_TASK_FIELDS = bodyFieldsOf(createTaskInputSchema);
const UPDATE_TASK_FIELDS = bodyFieldsOf(updateTaskInputSchema);
const CREATE_PROJECT_FIELDS = bodyFieldsOf(createProjectInputSchema);
const SET_SITUATION_FIELDS = bodyFieldsOf(setTaskSituationInputSchema);
const CREATE_ARTIFACT_FIELDS = bodyFieldsOf(createArtifactRequestSchema);
const UPDATE_ARTIFACT_FIELDS = bodyFieldsOf(updateArtifactRequestSchema);

function assertKnownFields(body: unknown, known: ReadonlySet<string>): void {
  if (typeof body !== "object" || body === null) return;
  for (const key of Object.keys(body)) {
    if (!known.has(key)) throw new BadRequestError(`Invalid field ${key}`);
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
    throw new BadRequestError(`Invalid ${field}`);
  }
}

/**
 * O que a rota de tarefas confere antes do dominio: a forma do corpo. As
 * regras (o que cada executor aceita, tarefa longa, janela) sao do dominio. Na
 * edicao, `null` apaga o status e as datas.
 */
export function assertTaskFields(body: Record<string, unknown>, editing: boolean): void {
  assertKnownFields(body, editing ? UPDATE_TASK_FIELDS : CREATE_TASK_FIELDS);
  if (body?.kind !== undefined && !isOneOf(HUMAN_KINDS, body.kind)) throw new BadRequestError("Invalid kind");
  if (body?.status !== undefined && !(editing && body.status === null) && !isOneOf(HUMAN_STATUSES, body.status)) {
    throw new BadRequestError("Invalid status");
  }
  if (body?.priority !== undefined && !isOneOf(PRIORITIES, body.priority)) {
    throw new BadRequestError("Invalid priority");
  }
  if (
    body?.notifyOffsetsMinutes !== undefined &&
    !(Array.isArray(body.notifyOffsetsMinutes) && body.notifyOffsetsMinutes.every(isNotificationOffsetMinutes))
  ) {
    throw new BadRequestError("Invalid notifyOffsetsMinutes");
  }
  // Na edicao, `null` (ou vazio) tira o local; ausente, nao muda.
  if (
    body?.location !== undefined && !(editing && body.location === null) &&
    (typeof body.location !== "string" || body.location.length > 300)
  ) {
    throw new BadRequestError("Invalid location");
  }
  if (body?.longRunning !== undefined && typeof body.longRunning !== "boolean") {
    throw new BadRequestError("Invalid longRunning");
  }
  for (const field of ["tags", "subtaskIds", "artifactIds"]) {
    if (body?.[field] !== undefined && !isStringList(body[field])) throw new BadRequestError(`Invalid ${field}`);
  }
  if (body?.parentTaskId !== undefined && body.parentTaskId !== null && typeof body.parentTaskId !== "string") {
    throw new BadRequestError("Invalid parentTaskId");
  }
  if (body?.artifacts !== undefined && !Array.isArray(body.artifacts)) throw new BadRequestError("Invalid artifacts");
  // Na edicao, `null` devolve a tarefa a `diario`; ausente nao muda.
  if (body?.projectId !== undefined && !(editing && body.projectId === null) && typeof body.projectId !== "string") {
    throw new BadRequestError("Invalid projectId");
  }
  for (const field of ["startedAt", "estimatedFinishAt", "finishedAt"]) assertInstant(body?.[field], field, editing);
}

/** O que a rota de projetos confere antes do dominio: o corpo e um objeto so com os campos do contrato. O nome e do dominio. */
export function assertProjectFields(body: Record<string, unknown>): void {
  if (typeof body !== "object" || body === null || Array.isArray(body)) throw new BadRequestError("Invalid body");
  assertKnownFields(body, CREATE_PROJECT_FIELDS);
}

/** O que a rota da situacao confere: o corpo tem so `situation`, e um dos tres valores. Se a tarefa aceita e do dominio. */
export function assertSituationBody(body: Record<string, unknown>): void {
  if (typeof body !== "object" || body === null || Array.isArray(body)) throw new BadRequestError("Invalid body");
  assertKnownFields(body, SET_SITUATION_FIELDS);
  if (!isOneOf(SITUATIONS, body.situation)) throw new BadRequestError("Invalid situation");
}

export function assertExpectedRevision(body: { expectedRevision?: unknown }): void {
  if (!Number.isInteger(body?.expectedRevision) || (body.expectedRevision as number) < 1) {
    throw new BadRequestError("Invalid expectedRevision");
  }
}

export function assertAgendaCursor(cursor: string): void {
  try {
    decodeAgendaCursor(cursor);
  } catch {
    throw new BadRequestError("Invalid cursor");
  }
}

export function parseLimit(raw?: string): number | undefined {
  if (raw === undefined) return undefined;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > 100) {
    throw new BadRequestError("Invalid limit");
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
    throw new BadRequestError("Invalid type");
  }
  if (creating ? body?.data === undefined && (body?.type === undefined || isFreeTextArtifactType(body.type)) : (body?.type === undefined) !== (body?.data === undefined)) {
    throw new BadRequestError("Invalid data");
  }
  if (body?.data !== undefined && (typeof body.data !== "object" || body.data === null || Array.isArray(body.data))) {
    throw new BadRequestError("Invalid data");
  }
  if (body?.name !== undefined && typeof body.name !== "string") throw new BadRequestError("Invalid name");
  if (body?.tags !== undefined && !isStringList(body.tags)) throw new BadRequestError("Invalid tags");
  if (body?.taskIds !== undefined && !isStringList(body.taskIds)) throw new BadRequestError("Invalid taskIds");
}

export function assertRecurrenceTemplate(template: unknown, required: boolean): void {
  if (template === undefined && !required) return;
  if (typeof template !== "object" || template === null || Array.isArray(template)) {
    throw new BadRequestError("Invalid template");
  }
}
