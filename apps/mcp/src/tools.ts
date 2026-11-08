import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { type ApiClient, ApiError } from "./api-client";

const WEEKDAY_CODES = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

const idempotencyKey = z
  .string()
  .regex(/^[A-Za-z0-9._:-]{1,128}$/)
  .describe(
    "Stable key for this exact creation, e.g. 'resumo-diario:2026-11-03'. Calling again with the same key and the same arguments returns the entity already created instead of creating another. Use a new key only for a genuinely new entity.",
  );
const instant = z.string().datetime({ offset: true }).describe("ISO-8601 date-time with offset, e.g. 2026-11-03T07:00:00-03:00");
const tags = z.array(z.string().min(1)).max(20).optional();

const eventShape = {
  name: z.string().min(1),
  description: z.string().optional(),
  startedAt: instant.optional().describe("When the event starts. Omit for now."),
  finishedAt: instant.optional(),
  tags,
  priority: z.enum(["urgent", "normal", "flexible"]).optional(),
  kind: z.enum(["routine", "meal", "sleep", "training"]).optional().describe("Omit for a routine event."),
};

const taskStatus = z.enum(["todo", "scheduled", "toDefine", "inHold", "done", "cancel"]);
const taskPriority = z.enum(["urgent", "high", "medium", "low"]);

const taskShape = {
  name: z.string().min(1),
  description: z.string().optional(),
  status: taskStatus.optional(),
  priority: taskPriority.optional(),
  startedAt: instant.optional(),
  estimatedFinishAt: instant.optional(),
  tags,
};

const ruleShape = {
  frequency: z.enum(["daily", "weekly", "monthly", "yearly"]),
  interval: z.number().int().min(1).optional().describe("Every N days/weeks/months/years. Omit for 1 when creating."),
  weekdays: z.array(z.enum(WEEKDAY_CODES)).min(1).optional().describe("Required for weekly, forbidden otherwise."),
  monthDay: z.number().int().min(1).max(31).optional().describe("Required for monthly and yearly, forbidden otherwise."),
  month: z.number().int().min(1).max(12).optional().describe("Required for yearly, forbidden otherwise."),
  timeOfDay: z.string().regex(/^\d{2}:\d{2}$/).describe("HH:MM in the given time zone."),
  durationMinutes: z.number().int().min(1).optional(),
  timeZone: z.string().min(1).describe("IANA name, e.g. America/Sao_Paulo."),
  startsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("First day, YYYY-MM-DD."),
  endsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
};

const recurrenceShape = {
  target: z.enum(["event", "task"]),
  name: z.string().min(1),
  description: z.string().optional(),
  tags,
  priority: z.string().optional().describe("Events: urgent|normal|flexible. Tasks: urgent|high|medium|low."),
  ...ruleShape,
};

const revision = z
  .number()
  .int()
  .min(1)
  .describe("The 'revision' returned by the matching get_* tool. The edit is refused if the entity changed since.");

const READ_ONLY = { readOnlyHint: true, openWorldHint: false } as const;
const EDIT = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false } as const;
const CREATE_ONLY = { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const;

function ok(value: unknown): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(value) }] };
}

/** O erro da API volta ao modelo como resultado da ferramenta, para ele corrigir os argumentos. */
async function guarded(run: () => Promise<unknown>): Promise<CallToolResult> {
  try {
    return ok(await run());
  } catch (error) {
    const message = error instanceof ApiError ? error.message : "Request to the API failed";
    return { isError: true, content: [{ type: "text", text: message }] };
  }
}

function weekdayMask(weekdays: readonly (typeof WEEKDAY_CODES)[number][]): number {
  return weekdays.reduce((mask, code) => mask | (1 << WEEKDAY_CODES.indexOf(code)), 0);
}

export function registerTools(server: McpServer, api: ApiClient): void {
  server.registerTool(
    "create_event",
    {
      description: "Create an event in the owner's timeline.",
      inputSchema: { ...eventShape, idempotencyKey },
      annotations: CREATE_ONLY,
    },
    ({ idempotencyKey: key, ...event }) => guarded(() => api.post("/api/events", event, key)),
  );

  server.registerTool(
    "create_task",
    {
      description: "Create a task in the owner's list.",
      inputSchema: { ...taskShape, idempotencyKey },
      annotations: CREATE_ONLY,
    },
    ({ idempotencyKey: key, ...task }) => guarded(() => api.post("/api/tasks", task, key)),
  );

  server.registerTool(
    "create_note",
    {
      description:
        "Create a free-text note, optionally attached to existing events or tasks (use list_timeline_events / list_tasks for ids).",
      inputSchema: {
        name: z.string().min(1).optional(),
        body: z.string().min(1),
        tags,
        eventIds: z.array(z.string()).optional(),
        taskIds: z.array(z.string()).optional(),
        idempotencyKey,
      },
      annotations: CREATE_ONLY,
    },
    ({ idempotencyKey: key, body, ...note }) =>
      guarded(() => api.post("/api/notes", { ...note, type: "text", data: { body } }, key)),
  );

  server.registerTool(
    "create_recurrence",
    {
      description: "Create a recurring series of events or tasks. Each occurrence copies the name, description, tags and priority.",
      inputSchema: { ...recurrenceShape, idempotencyKey },
      annotations: CREATE_ONLY,
    },
    ({ idempotencyKey: key, target, name, description, tags: templateTags, priority, weekdays, monthDay, month, ...rule }) =>
      guarded(() =>
        api.post(
          "/api/recurrences",
          {
            ...rule,
            interval: rule.interval ?? 1,
            ...(weekdays ? { byWeekday: weekdayMask(weekdays) } : {}),
            ...(monthDay === undefined ? {} : { byMonthDay: monthDay }),
            ...(month === undefined ? {} : { byMonth: month }),
            target,
            template: { name, description, tags: templateTags, priority },
          },
          key,
        ),
      ),
  );

  server.registerTool(
    "list_timeline_events",
    {
      description:
        "List the owner's events in a time window, newest first. Use it to check what already exists before creating. When the result has a next cursor, pass it as 'cursor' to get the following page.",
      inputSchema: {
        from: instant.optional(),
        to: instant.optional(),
        kind: z.enum(["routine", "meal", "sleep", "training"]).optional().describe("Only events of this kind."),
        tag: z.string().optional(),
        cursor: z.string().optional().describe("The cursor returned by the previous page."),
        limit: z.number().int().min(1).max(100).default(20),
      },
      annotations: READ_ONLY,
    },
    ({ kind, ...query }) => guarded(() => api.get("/api/events", { ...query, type: kind })),
  );

  server.registerTool(
    "list_tasks",
    {
      description:
        "List the owner's tasks, all of them unless filtered. Filters combine with AND. 'from'/'to' compare against the task's start, or its estimated finish when it has no start; tasks with neither date never match a window.",
      inputSchema: {
        status: z.array(taskStatus).min(1).optional().describe("Match any of these statuses."),
        priority: z.array(taskPriority).min(1).optional().describe("Match any of these priorities."),
        tag: z.string().optional().describe("Exact tag, ignoring case."),
        q: z.string().optional().describe("Text to find in the task name, ignoring case."),
        from: instant.optional(),
        to: instant.optional(),
        limit: z.number().int().min(1).max(100).optional(),
      },
      annotations: READ_ONLY,
    },
    ({ status, priority, ...query }) =>
      guarded(() => api.get("/api/tasks", { ...query, status: status?.join(","), priority: priority?.join(",") })),
  );

  server.registerTool(
    "list_notes",
    {
      description:
        "List the owner's notes, all of them unless filtered. Filters combine with AND. Use eventId/taskId to find the notes attached to one event or task.",
      inputSchema: {
        type: z.enum(["text", "meal", "sleep", "training"]).optional(),
        tag: z.string().optional().describe("Exact tag, ignoring case."),
        q: z.string().optional().describe("Text to find in the note name or, for text notes, its body, ignoring case."),
        eventId: z.string().min(1).optional().describe("Only notes attached to this event."),
        taskId: z.string().min(1).optional().describe("Only notes attached to this task."),
        limit: z.number().int().min(1).max(100).optional(),
      },
      annotations: READ_ONLY,
    },
    (query) => guarded(() => api.get("/api/notes", query)),
  );

  server.registerTool(
    "list_recurrences",
    {
      description: "List the owner's recurring series, optionally only those that generate events or only tasks.",
      inputSchema: { target: z.enum(["event", "task"]).optional() },
      annotations: READ_ONLY,
    },
    (query) => guarded(() => api.get("/api/recurrences", query)),
  );

  registerReadAndEditTools(server, api);
}

const id = (what: string) => z.string().min(1).describe(`Id of the ${what}.`);

/** Ler uma entidade devolve a `revision` que a edicao exige; sem exclusao em nenhuma ferramenta. */
function registerReadAndEditTools(server: McpServer, api: ApiClient): void {
  const getters = [
    ["get_event", "event", "events"],
    ["get_task", "task", "tasks"],
    ["get_note", "note", "notes"],
    ["get_recurrence", "recurrence", "recurrences"],
  ] as const;
  for (const [name, what, collection] of getters) {
    server.registerTool(
      name,
      {
        description: `Read one ${what} in full, including its 'revision' (needed to edit it).`,
        inputSchema: { id: id(what) },
        annotations: READ_ONLY,
      },
      ({ id: entityId }) => guarded(() => api.get(`/api/${collection}/${encodeURIComponent(entityId)}`)),
    );
  }

  server.registerTool(
    "update_event",
    {
      description:
        "Edit fields of an event. Send only the fields to change. Notes, interruptions and linked tasks are left untouched.",
      inputSchema: { eventId: id("event"), expectedRevision: revision, ...partial(eventShape) },
      annotations: EDIT,
    },
    ({ eventId, ...patch }) => guarded(() => api.patch(`/api/events/${encodeURIComponent(eventId)}`, patch)),
  );

  server.registerTool(
    "update_task",
    {
      description: "Edit fields of a task. Send only the fields to change.",
      inputSchema: {
        taskId: id("task"),
        expectedRevision: revision,
        ...partial(taskShape),
        finishedAt: instant.optional(),
      },
      annotations: EDIT,
    },
    ({ taskId, ...patch }) => guarded(() => api.patch(`/api/tasks/${encodeURIComponent(taskId)}`, patch)),
  );

  server.registerTool(
    "update_note",
    {
      description:
        "Edit a text note. Send only what changes; 'body' replaces the whole text. Links to events and tasks are left untouched.",
      inputSchema: {
        noteId: id("note"),
        expectedRevision: revision,
        name: z.string().min(1).optional(),
        body: z.string().min(1).optional(),
        tags,
      },
      annotations: EDIT,
    },
    ({ noteId, body, ...patch }) =>
      guarded(() =>
        api.patch(`/api/notes/${encodeURIComponent(noteId)}`, body === undefined ? patch : { ...patch, type: "text", data: { body } }),
      ),
  );

  server.registerTool(
    "update_recurrence",
    {
      description:
        "Edit a recurring series from today on. Send only the rule fields to change. 'template', when sent, REPLACES the whole template (read it first with get_recurrence). The target (event/task) cannot change.",
      inputSchema: {
        recurrenceId: id("recurrence"),
        expectedRevision: revision,
        ...partial(ruleShape),
        template: z
          .object({
            name: z.string().min(1).optional(),
            description: z.string().optional(),
            tags,
            priority: z.string().optional(),
          })
          .optional(),
      },
      annotations: EDIT,
    },
    ({ recurrenceId, weekdays, monthDay, month, ...patch }) =>
      guarded(() =>
        api.patch(`/api/recurrences/${encodeURIComponent(recurrenceId)}`, {
          ...patch,
          ...(weekdays ? { byWeekday: weekdayMask(weekdays) } : {}),
          ...(monthDay === undefined ? {} : { byMonthDay: monthDay }),
          ...(month === undefined ? {} : { byMonth: month }),
        }),
      ),
  );
}

/** Todos os campos opcionais: numa edicao, so o que veio muda. */
function partial<T extends Record<string, z.ZodType>>(shape: T): { [K in keyof T]: z.ZodOptional<T[K]> } {
  return Object.fromEntries(Object.entries(shape).map(([key, schema]) => [key, z.optional(schema)])) as {
    [K in keyof T]: z.ZodOptional<T[K]>;
  };
}
