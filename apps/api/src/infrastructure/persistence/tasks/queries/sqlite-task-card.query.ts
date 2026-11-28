import { MAX_TASK_BLOCK_DAYS, OFF_AGENDA_KINDS, type Recurrence } from "../../../../domain/index";
import type {
  AgendaPage,
  AgendaQueryParams,
  TaskCard,
  TaskCardQuery,
  TrackedQueryParams,
} from "../../../../domain/ports";
import { recurrences as recurrencesTable, tasks as tasksTable } from "../../database/tables";
import { sqlList } from "../../database/schema/sets";
import { c, rowDecoder, sql, type SqlFragment } from "@repo/sqlite";
import { ARTIFACT_TYPES } from "../../../../domain/sets";
import { mapRecurrenceRow } from "../../recurrences/mappers/recurrence-row.mapper";
import type { Db } from "../../shared/tx";
import type { TaskRow } from "../mappers/task-row.mapper";
import { projectsByIds } from "../../projects/sqlite-project.query";
import { hydrateTasks } from "../repositories/sqlite-task.repository";
import { decodeAgendaCursor, encodeAgendaCursor } from "./agenda-cursor";

const DAY_MS = 24 * 60 * 60 * 1000;

const artifactTypeRow = rowDecoder({ taskId: c.text, type: c.oneOf(ARTIFACT_TYPES) });
const agendaRow = rowDecoder({ id: c.text, startedAt: c.timestamp });

/** Os status de pessoa em que a tarefa ainda esta em aberto. */
const OPEN_STATUSES = ["todo", "toDefine", "doing", "inHold"] as const;

function hasTag(userId: string, tag: string): SqlFragment {
  return sql`EXISTS (
    SELECT 1 FROM task_tags et
    JOIN tags t ON t.id = et.tag_id
    WHERE et.task_id = e.id AND t.user_id = ${userId} AND t.name = ${tag}
  )`;
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

export class SqliteTaskCardQuery implements TaskCardQuery {
  constructor(private readonly db: Db) {}

  async agenda(params: AgendaQueryParams): Promise<AgendaPage> {
    // As mesmas condicoes do indice parcial `tasks_agenda_idx`, com os mesmos literais: com `?` no lugar da lista de
    // tipos o SQLite nao prova que o indice serve.
    const conditions: SqlFragment[] = [
      sql`e.user_id = ${params.userId}`,
      sql`e.started_at IS NOT NULL`,
      sql`NOT e.long_running`,
      sql`e.kind NOT IN (${sqlList(OFF_AGENDA_KINDS)})`,
      sql`e.deleted_at IS NULL`,
    ];
    if (params.to) conditions.push(sql`e.started_at <= ${params.to}`);
    if (params.from) {
      // Um bloco dura no maximo 31 dias: quem ainda toca a janela comecou no maximo isso antes dela.
      conditions.push(sql`e.started_at >= ${new Date(params.from.getTime() - MAX_TASK_BLOCK_DAYS * DAY_MS)}`);
      conditions.push(sql`coalesce(e.estimated_finish_at, e.finished_at, e.started_at) >= ${params.from}`);
    }
    if (params.actor) conditions.push(sql`e.actor = ${params.actor}`);
    if (params.kind) conditions.push(sql`e.kind = ${params.kind}`);
    if (params.tag) conditions.push(hasTag(params.userId, params.tag));
    if (params.cursor) {
      const cursor = decodeAgendaCursor(params.cursor);
      conditions.push(sql`(e.started_at, e.id) < (${cursor.startedAt}, ${cursor.id})`);
    }

    const page = await this.db.all(
      sql`
        SELECT e.id AS "id", e.started_at AS "startedAt"
        FROM tasks e
        WHERE ${sql.join(conditions, sql` AND `)}
        ORDER BY e.started_at DESC, e.id DESC
        LIMIT ${params.limit + 1}`,
      agendaRow,
    );
    const hasNextPage = page.length > params.limit;
    const rows = page.slice(0, params.limit);
    const last = rows.at(-1);

    return {
      items: await this.cardsOf(rows.map((row) => row.id)),
      nextCursor:
        hasNextPage && last ? encodeAgendaCursor({ startedAt: last.startedAt, id: last.id }) : undefined,
    };
  }

  async tracked(params: TrackedQueryParams): Promise<TaskCard[]> {
    // As mesmas condicoes do indice parcial `tasks_tracked_idx`.
    const conditions: SqlFragment[] = [
      sql`e.user_id = ${params.userId}`,
      sql`e.status IS NOT NULL`,
      sql`e.kind <> 'step'`,
      sql`e.deleted_at IS NULL`,
      // Uma serie aparece uma vez so: pela proxima ocorrencia em aberto. A ocorrencia que alguem
      // editou (concluir e editar) ja nao acompanha a serie e aparece por si.
      sql`(e.recurrence_id IS NULL OR e.recurrence_detached OR e.id = (
        SELECT o.id FROM tasks o
        WHERE o.recurrence_id = e.recurrence_id AND NOT o.recurrence_detached AND o.deleted_at IS NULL
          AND o.status IN ${sql.in(OPEN_STATUSES)}
        ORDER BY o.occurrence_on
        LIMIT 1
      ))`,
    ];
    if (params.actor) conditions.push(sql`e.actor = ${params.actor}`);
    if (params.status?.length) conditions.push(sql`e.status IN ${sql.in(params.status)}`);
    if (params.priority?.length) conditions.push(sql`e.priority IN ${sql.in(params.priority)}`);
    if (params.tag) conditions.push(hasTag(params.userId, params.tag));
    if (params.q) conditions.push(sql`lower(e.name) LIKE ${`%${escapeLike(params.q)}%`} ESCAPE '\\'`);
    if (params.from) conditions.push(sql`coalesce(e.started_at, e.estimated_finish_at) >= ${params.from}`);
    if (params.to) conditions.push(sql`coalesce(e.started_at, e.estimated_finish_at) <= ${params.to}`);
    if (params.longRunning !== undefined) {
      conditions.push(params.longRunning ? sql`e.long_running` : sql`NOT e.long_running`);
    }

    const result = await this.db.all<{ id: string }>(sql`
      SELECT e.id AS "id"
      FROM tasks e
      WHERE ${sql.join(conditions, sql` AND `)}
      ORDER BY coalesce(e.started_at, e.estimated_finish_at) NULLS LAST, e.id
      ${params.limit === undefined ? sql.empty : sql`LIMIT ${params.limit}`}
    `);
    return this.cardsOf(result.map((row) => row.id));
  }

  async cardsOf(taskIds: readonly string[]): Promise<TaskCard[]> {
    if (taskIds.length === 0) return [];
    const ids = [...taskIds];

    const rows: TaskRow[] = await this.db.all(
      sql`SELECT ${tasksTable.select()} FROM tasks WHERE id IN ${sql.in(ids)} AND deleted_at IS NULL`,
      tasksTable,
    );
    const tasks = await hydrateTasks(this.db, rows);

    const [typeRows, recurrences, projects] = await Promise.all([
      this.db.all(
        sql`
          SELECT r.task_id AS "taskId", a.type AS "type"
          FROM task_artifact_relation r JOIN artifacts a ON a.id = r.artifact_id
          WHERE r.task_id IN ${sql.in(ids)} AND a.deleted_at IS NULL
          ORDER BY r.position, r.created_at`,
        artifactTypeRow,
      ),
      this.recurrencesOf(rows),
      projectsByIds(this.db, [...new Set(rows.map((row) => row.projectId))]),
    ]);
    const typesByTask = new Map<string, string[]>();
    for (const row of typeRows) {
      typesByTask.set(row.taskId, [...(typesByTask.get(row.taskId) ?? []), row.type]);
    }

    const byId = new Map(tasks.map((task) => [task.id, task]));
    const projectOf = new Map(rows.map((row) => [row.id, projects.get(row.projectId)]));
    return ids.flatMap((id) => {
      const task = byId.get(id);
      const project = projectOf.get(id);
      if (!task || !project) return [];
      const recurrence = task.occurrence ? recurrences.get(task.occurrence.recurrenceId) : undefined;
      return [{ task, project, artifactTypes: typesByTask.get(id) ?? [], ...(recurrence ? { recurrence } : {}) }];
    });
  }

  private async recurrencesOf(rows: readonly TaskRow[]): Promise<Map<string, Recurrence>> {
    const recurrenceIds = [...new Set(rows.flatMap((row) => (row.recurrenceId ? [row.recurrenceId] : [])))];
    if (recurrenceIds.length === 0) return new Map();
    const found = await this.db.all(
      sql`SELECT ${recurrencesTable.select()} FROM recurrences WHERE id IN ${sql.in(recurrenceIds)}`,
      recurrencesTable,
    );
    return new Map(found.map((row) => [row.id, mapRecurrenceRow(row)]));
  }
}
