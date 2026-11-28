import { c, defineTable, type RowOf } from "@repo/sqlite";
import {
  ACTORS,
  ARTIFACT_ARTIFACT_RELATIONS,
  ARTIFACT_TYPES,
  ENTRY_KINDS,
  ENTRY_ROLES,
  JOB_STATUSES,
  PRIORITIES,
  RECURRENCE_FREQS,
  SITUATIONS,
  TASK_ARTIFACT_RELATIONS,
  TASK_KINDS,
  TASK_STATUSES,
  TASK_TASK_RELATIONS,
} from "../../../domain/sets";

/**
 * As tabelas da API como o codigo as le e grava. O DDL mora nas migrations (`apps/api/migrations`); aqui fica so a
 * forma de cada linha: a chave do dominio (o nome da coluna e o `snake_case` dela) e o codec do tipo.
 */

export const projects = defineTable("projects", {
  id: c.text,
  userId: c.text,
  name: c.text,
  personal: c.boolean,
  createdAt: c.timestamp,
  updatedAt: c.timestamp,
});

export const recurrences = defineTable("recurrences", {
  id: c.text,
  revision: c.integer,
  userId: c.text,
  projectId: c.text,
  freq: c.oneOf(RECURRENCE_FREQS),
  intervalCount: c.integer,
  byWeekday: c.integer.nullable().named("byweekday"),
  byMonthDay: c.integer.nullable().named("bymonthday"),
  byMonth: c.integer.nullable().named("bymonth"),
  timeOfDay: c.timeOfDay,
  durationMinutes: c.integer.nullable(),
  timeZone: c.text,
  startsOn: c.day,
  endsOn: c.day.nullable(),
  template: c.json<unknown>(),
  materializedThrough: c.day.nullable(),
  createdAt: c.timestamp,
  updatedAt: c.timestamp,
});

export const recurrenceExceptions = defineTable("recurrence_exceptions", {
  recurrenceId: c.text,
  occurrenceOn: c.day,
  createdAt: c.timestamp,
});

export const tasks = defineTable("tasks", {
  id: c.text,
  revision: c.integer,
  userId: c.text,
  projectId: c.text,
  actor: c.oneOf(ACTORS),
  kind: c.oneOf(TASK_KINDS),
  status: c.oneOf(TASK_STATUSES).nullable(),
  situation: c.oneOf(SITUATIONS).nullable(),
  priority: c.oneOf(PRIORITIES),
  name: c.text,
  description: c.text,
  location: c.text.nullable(),
  startedAt: c.timestamp.nullable(),
  estimatedFinishAt: c.timestamp.nullable(),
  finishedAt: c.timestamp.nullable(),
  notifyOffsetsMinutes: c.json<number[]>(),
  recurrenceId: c.text.nullable(),
  occurrenceOn: c.day.nullable(),
  recurrenceDetached: c.boolean,
  longRunning: c.boolean,
  data: c.json<unknown>(),
  createdAt: c.timestamp,
  updatedAt: c.timestamp,
  deletedAt: c.timestamp.nullable(),
});

export const taskEntries = defineTable("task_entries", {
  id: c.text,
  taskId: c.text,
  userId: c.text,
  kind: c.oneOf(ENTRY_KINDS),
  role: c.oneOf(ENTRY_ROLES).nullable(),
  content: c.text.nullable(),
  data: c.json<Record<string, unknown>>(),
  createdAt: c.timestamp,
});

export const artifacts = defineTable("artifacts", {
  id: c.text,
  revision: c.integer,
  userId: c.text.nullable(),
  type: c.oneOf(ARTIFACT_TYPES),
  schemaVersion: c.integer,
  name: c.text,
  data: c.json<unknown>(),
  derived: c.boolean,
  createdAt: c.timestamp,
  updatedAt: c.timestamp,
  deletedAt: c.timestamp.nullable(),
});

export const tags = defineTable("tags", {
  id: c.text,
  userId: c.text,
  name: c.text,
  createdAt: c.timestamp,
  updatedAt: c.timestamp,
});

export const taskTags = defineTable("task_tags", {
  taskId: c.text,
  tagId: c.text,
});

export const artifactTags = defineTable("artifact_tags", {
  artifactId: c.text,
  tagId: c.text,
});

export const taskTaskRelation = defineTable("task_task_relation", {
  fromTaskId: c.text,
  toTaskId: c.text,
  relation: c.oneOf(TASK_TASK_RELATIONS),
  createdAt: c.timestamp,
});

export const taskArtifactRelation = defineTable("task_artifact_relation", {
  taskId: c.text,
  artifactId: c.text,
  relation: c.oneOf(TASK_ARTIFACT_RELATIONS),
  position: c.integer.nullable(),
  fromRecurrence: c.boolean,
  createdAt: c.timestamp,
});

export const artifactArtifactRelation = defineTable("artifact_artifact_relation", {
  fromArtifactId: c.text,
  toArtifactId: c.text,
  relation: c.oneOf(ARTIFACT_ARTIFACT_RELATIONS),
  createdAt: c.timestamp,
});

export const jobs = defineTable("jobs", {
  id: c.text,
  kind: c.text,
  userId: c.text,
  actorId: c.text,
  taskId: c.text.nullable(),
  payload: c.json<unknown>(),
  dedupeKey: c.text.nullable(),
  concurrencyKey: c.text.nullable(),
  status: c.oneOf(JOB_STATUSES),
  progress: c.json<unknown>().nullable(),
  error: c.text.nullable(),
  attempts: c.integer,
  leaseToken: c.text.nullable(),
  leaseUntil: c.timestamp.nullable(),
  availableAt: c.timestamp,
  createdAt: c.timestamp,
  updatedAt: c.timestamp,
});

export const idempotencyKeys = defineTable("idempotency_keys", {
  userId: c.text,
  scope: c.text,
  key: c.text,
  requestHash: c.text,
  response: c.json<unknown>().nullable(),
  createdAt: c.timestamp,
});

export type ProjectRow = RowOf<typeof projects.columns>;
export type RecurrenceRow = RowOf<typeof recurrences.columns>;
export type TaskRow = RowOf<typeof tasks.columns>;
export type TaskEntryRow = RowOf<typeof taskEntries.columns>;
export type ArtifactRow = RowOf<typeof artifacts.columns>;
export type JobRow = RowOf<typeof jobs.columns>;

/** O nome do projeto pessoal de cada usuario (o CHECK `projects_personal_name` tem o mesmo). */
export const PERSONAL_PROJECT_NAME = "diario";
