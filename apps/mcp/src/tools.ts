import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { type ApiClient, ApiError } from "./api-client";

const WEEKDAY_CODES = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

// Os conjuntos fechados da API (packages/contracts/src/tasks/task-types.ts). O
// MCP nao depende do pacote de contratos; a API valida de novo e o erro volta ao modelo.
const HUMAN_KINDS = ["common", "meal", "sleep", "training"] as const;
const REQUEST_KINDS = ["request", "search_request", "build_request", "inquiry_request", "review_request", "cron"] as const;
const HUMAN_STATUSES = ["todo", "toDefine", "doing", "inHold", "done", "cancel", "missed"] as const;
// Nenhum status de agente e igual a um de pessoa: o filtro aceita os dois conjuntos.
const AGENT_STATUSES = [
  "preparing", "queued", "starting", "running", "waiting", "awaiting_transcription", "completed", "interrupted", "failed", "cancelled", "rolled_back",
] as const;
const PRIORITIES = ["urgent", "high", "medium", "low"] as const;
/**
 * Os tipos de texto livre (`FREE_TEXT_ARTIFACT_TYPES` do contrato): o mesmo dado da nota, um texto em markdown.
 * Sao os que o agente cria e reescreve por aqui.
 */
const FREE_TEXT_ARTIFACT_TYPES = ["text", "news", "email_summary", "youtube_transcript"] as const;
/** Os tipos de artefato que o dono cria e edita; os de configuracao do agente ficam de fora. */
const ARTIFACT_TYPES = [...FREE_TEXT_ARTIFACT_TYPES, "food", "sleep", "training"] as const;

const idempotencyKey = z
  .string()
  .regex(/^[A-Za-z0-9._:-]{1,128}$/)
  .describe(
    "Stable key for this exact creation, e.g. 'resumo-diario:2026-11-03'. Calling again with the same key and the same arguments returns the entity already created instead of creating another. Use a new key only for a genuinely new entity.",
  );
const instant = z.string().datetime({ offset: true }).describe("ISO-8601 date-time with offset, e.g. 2026-11-03T07:00:00-03:00");
const tags = z.array(z.string().min(1)).max(20).optional();
const actor = z.enum(["human", "agent"]).optional().describe("Who carries the task out. Omit for both.");

const humanKind = z.enum(HUMAN_KINDS).optional().describe("Omit for a common task.");
const humanStatus = z.enum(HUMAN_STATUSES);
const priority = z.enum(PRIORITIES).optional().describe("Omit for medium.");

const taskShape = {
  name: z.string().min(1),
  description: z.string().optional(),
  location: z
    .string()
    .max(300)
    .optional()
    .describe(
      "Where the task happens. When the owner names a venue or an address, call search_places first and pass the 'label' of the matching place, so the address is one that exists. Never make up a street, number or city: with no match, pass the place as the owner said it. An empty string on update removes the location.",
    ),
  kind: humanKind,
  status: humanStatus
    .optional()
    .describe(
      "Omit for a plain agenda task that only marks a time. Set it (usually 'todo') for something to be done: the task is then tracked and shows up in list_tracked_tasks.",
    ),
  priority,
  startedAt: instant.optional().describe("Planned start. Omit on a plain agenda task for now."),
  estimatedFinishAt: instant.optional().describe("Planned end, or the deadline of a long-running task."),
  finishedAt: instant.optional().describe("When it was actually finished."),
  longRunning: z
    .boolean()
    .optional()
    .describe("Long-running task: stays out of the agenda, always has a status and never repeats."),
  tags,
};

/** Na edicao, `null` apaga o campo: sem status a tarefa volta a so marcar um horario. */
const taskPatchShape = {
  ...partial(taskShape),
  status: humanStatus.nullable().optional().describe("null removes the status: the task goes back to only marking a time."),
  startedAt: instant.nullable().optional().describe("Planned start; null clears it."),
  estimatedFinishAt: instant.nullable().optional().describe("Planned end or deadline; null clears it."),
  finishedAt: instant.nullable().optional().describe("Actual finish; null clears it."),
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

/** O que cada ocorrencia copia. Uma serie so gera tarefas de pessoa, e nunca uma tarefa longa. */
const templateShape = {
  name: z.string().min(1),
  description: z.string().optional(),
  kind: humanKind,
  status: humanStatus
    .optional()
    .describe("Omit for plain agenda occurrences. Set it (usually 'todo') so every occurrence is a tracked task."),
  tags,
  priority,
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
    "create_task",
    {
      description:
        "Create a task for the owner. Without 'status' it is a plain agenda task; with 'status' it is something to be done (a to-do), tracked until it is finished.",
      inputSchema: { ...taskShape, idempotencyKey },
      annotations: CREATE_ONLY,
    },
    ({ idempotencyKey: key, ...task }) => guarded(() => api.post("/api/tasks", task, key)),
  );

  server.registerTool(
    "create_artifact",
    {
      description:
        "Create a free-text artifact: a markdown text the owner reads and edits like a note, optionally appearing in existing tasks (use list_agenda_tasks / list_tracked_tasks for ids). Pick the type that says what the text is.",
      inputSchema: {
        name: z.string().min(1).optional(),
        type: z
          .enum(FREE_TEXT_ARTIFACT_TYPES)
          .optional()
          .describe(
            "What the text is. 'text': a plain note (the default when omitted). 'news': a round-up of news. 'email_summary': the summary of an e-mail inbox. 'youtube_transcript': the transcript of a YouTube video.",
          ),
        body: z.string().min(1),
        tags,
        taskIds: z.array(z.string()).optional().describe("Tasks in which the artifact appears from the start."),
        idempotencyKey,
      },
      annotations: CREATE_ONLY,
    },
    ({ idempotencyKey: key, body, type, ...artifact }) =>
      guarded(() => api.post("/api/artifacts", { ...artifact, type: type ?? "text", data: { body } }, key)),
  );

  server.registerTool(
    "create_recurrence",
    {
      description:
        "Create a recurring series of tasks. Each occurrence copies the name, description, kind, status, tags and priority.",
      inputSchema: { ...templateShape, ...ruleShape, idempotencyKey },
      annotations: CREATE_ONLY,
    },
    ({ idempotencyKey: key, name, description, kind, status, tags: templateTags, priority: templatePriority, weekdays, monthDay, month, ...rule }) =>
      guarded(() =>
        api.post(
          "/api/recurrences",
          {
            ...rule,
            interval: rule.interval ?? 1,
            ...(weekdays ? { byWeekday: weekdayMask(weekdays) } : {}),
            ...(monthDay === undefined ? {} : { byMonthDay: monthDay }),
            ...(month === undefined ? {} : { byMonth: month }),
            template: { name, description, kind, status, tags: templateTags, priority: templatePriority },
          },
          key,
        ),
      ),
  );

  server.registerTool(
    "list_agenda_tasks",
    {
      description:
        "List the owner's agenda: tasks with a start in a time window, newest first, without the long-running ones. Use it to check what already exists before creating. When the result has 'nextCursor', pass it as 'cursor' to get the following page.",
      inputSchema: {
        from: instant.optional(),
        to: instant.optional(),
        actor,
        kind: z.enum([...HUMAN_KINDS, ...REQUEST_KINDS]).optional().describe("Only tasks of this kind."),
        tag: z.string().optional(),
        cursor: z.string().optional().describe("The 'nextCursor' returned by the previous page."),
        limit: z.number().int().min(1).max(100).default(20),
      },
      annotations: READ_ONLY,
    },
    (query) => guarded(() => api.get("/api/tasks", query)),
  );

  server.registerTool(
    "search_places",
    {
      description:
        "Search the map for venues and addresses matching a text (e.g. 'Hospital Mater Dei Belo Horizonte'). Each result's 'label' is the full address to store in a task's 'location'. Add the city or neighbourhood to the text when the owner said it. An empty list means the map does not know the place.",
      inputSchema: {
        query: z.string().min(3).max(200).describe("Name of the venue or the address, as the owner said it."),
        limit: z.number().int().min(1).max(10).default(6),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    (query) => guarded(() => api.get("/api/places", query)),
  );

  server.registerTool(
    "list_tracked_tasks",
    {
      description:
        "List the owner's tracked tasks: the ones with a status (to-dos and requests to the agent), long-running ones included; a recurring series appears once, by its next open occurrence. All of them unless filtered; filters combine with AND. 'from'/'to' compare against the planned start, or the planned end when there is no start; tasks with neither date never match a window.",
      inputSchema: {
        status: z.array(z.enum([...HUMAN_STATUSES, ...AGENT_STATUSES])).min(1).optional().describe("Match any of these statuses."),
        priority: z.array(z.enum(PRIORITIES)).min(1).optional().describe("Match any of these priorities."),
        actor,
        tag: z.string().optional().describe("Exact tag, ignoring case."),
        q: z.string().optional().describe("Text to find in the task name, ignoring case."),
        from: instant.optional(),
        to: instant.optional(),
        longRunning: z.boolean().optional().describe("true for only the long-running tasks, false for only the others."),
        limit: z.number().int().min(1).max(100).optional(),
      },
      annotations: READ_ONLY,
    },
    ({ status, priority: priorities, longRunning, ...query }) =>
      guarded(() =>
        api.get("/api/tasks/tracked", {
          ...query,
          status: status?.join(","),
          priority: priorities?.join(","),
          longRunning: longRunning === undefined ? undefined : String(longRunning),
        }),
      ),
  );

  server.registerTool(
    "list_artifacts",
    {
      description:
        "List the owner's artifacts (notes, news, e-mail summaries, YouTube transcripts, food, sleep, training), all of them unless filtered. Filters combine with AND. Use taskId to find the artifacts of one task.",
      inputSchema: {
        type: z.enum(ARTIFACT_TYPES).optional().describe("Only artifacts of this type. Omit for all."),
        tag: z.string().optional().describe("Exact tag, ignoring case."),
        q: z.string().optional().describe("Text to find in the artifact name or, for free text, its body, ignoring case."),
        taskId: z.string().min(1).optional().describe("Only artifacts that appear in this task."),
        limit: z.number().int().min(1).max(100).optional(),
      },
      annotations: READ_ONLY,
    },
    (query) => guarded(() => api.get("/api/artifacts", query)),
  );

  server.registerTool(
    "list_recurrences",
    {
      description: "List the owner's recurring series, each with its rule and the template every occurrence copies.",
      inputSchema: {},
      annotations: READ_ONLY,
    },
    () => guarded(() => api.get("/api/recurrences")),
  );

  registerReadAndEditTools(server, api);
}

const id = (what: string) => z.string().min(1).describe(`Id of the ${what}.`);

/** Ler uma entidade devolve a `revision` que a edicao exige; sem exclusao em nenhuma ferramenta. */
function registerReadAndEditTools(server: McpServer, api: ApiClient): void {
  const getters = [
    ["get_task", "task", "tasks"],
    ["get_artifact", "artifact", "artifacts"],
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
    "update_task",
    {
      description:
        "Edit fields of a task. Send only the fields to change. Its artifacts and its subtasks (its main task and its subtasks) are left untouched.",
      inputSchema: { taskId: id("task"), expectedRevision: revision, ...taskPatchShape },
      annotations: EDIT,
    },
    ({ taskId, ...patch }) => guarded(() => api.patch(`/api/tasks/${encodeURIComponent(taskId)}`, patch)),
  );

  server.registerTool(
    "update_artifact",
    {
      description:
        "Edit a free-text artifact (note, news, e-mail summary or YouTube transcript). Send only what changes; 'body' replaces the whole text and the artifact keeps its type. The tasks it appears in are left untouched.",
      inputSchema: {
        artifactId: id("artifact"),
        expectedRevision: revision,
        name: z.string().min(1).optional(),
        body: z.string().min(1).optional(),
        tags,
      },
      annotations: EDIT,
    },
    ({ artifactId, body, ...patch }) =>
      guarded(async () => {
        const path = `/api/artifacts/${encodeURIComponent(artifactId)}`;
        if (body === undefined) return api.patch(path, patch);
        // O corpo novo vai com o tipo do proprio artefato: reescrever um resumo de e-mail nao o transforma em nota.
        const { type } = await api.get<{ type: string }>(path);
        if (!(FREE_TEXT_ARTIFACT_TYPES as readonly string[]).includes(type)) {
          throw new ApiError(400, `Only free-text artifacts (${FREE_TEXT_ARTIFACT_TYPES.join(", ")}) take a new body; this one is '${type}'.`);
        }
        return api.patch(path, { ...patch, type, data: { body } });
      }),
  );

  server.registerTool(
    "update_recurrence",
    {
      description:
        "Edit a recurring series from today on. Send only the rule fields to change. 'template', when sent, REPLACES the whole template (read it first with get_recurrence).",
      inputSchema: {
        recurrenceId: id("recurrence"),
        expectedRevision: revision,
        ...partial(ruleShape),
        template: z.object(partial(templateShape)).optional(),
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
