import { dayKeyOf } from "@repo/timeline";
import type { CandidateQuery, EditCandidate } from "../../../api-core/process/process-candidates";
import { describeRecurrenceRule } from "../../../api-core/recurrences/describe-recurrence-rule";
import type { CandidateKind } from "../../../api-core/process/process-steps";
import type { PostgresDatabase } from "../database/postgres-database";

const DAY_MS = 24 * 60 * 60 * 1000;
/** America/Sao_Paulo, UTC-03:00 sem horario de verao desde 2019 (o mesmo fuso do resto da rota). */
const LOCAL_OFFSET = "-03:00";
const TEXT_PREVIEW_CHARS = 120;

export const CANDIDATE_LIMITS = { events: 20, tasks: 20, notes: 15, series: 15 } as const;

type Row = Record<string, unknown>;

const iso = (value: unknown): string | undefined =>
  value === null || value === undefined ? undefined : new Date(value as string | Date).toISOString();

/**
 * A lista curta do que um pedido de edicao pode estar alterando: eventos de ontem, hoje e amanha, tarefas
 * em aberto mais recentes e notas mais recentes. O JEV escolhe dentro dela; o que ficar de fora o agente
 * de edicao ainda pode buscar por uma consulta.
 */
export class PostgresProcessCandidateQuery implements CandidateQuery {
  constructor(private readonly database: PostgresDatabase) {}

  async shortlist(input: { userId: string; now: Date; kinds: readonly CandidateKind[] }): Promise<EditCandidate[]> {
    const wanted = new Set(input.kinds);
    const found: EditCandidate[][] = await Promise.all([
      wanted.has("event") ? this.events(input.userId, input.now) : [],
      wanted.has("task") ? this.tasks(input.userId) : [],
      wanted.has("note") ? this.notes(input.userId) : [],
      wanted.has("recurrence") ? this.series(input.userId) : [],
    ]);
    return found.flat();
  }

  private async events(userId: string, now: Date): Promise<EditCandidate[]> {
    const today = dayKeyOf(now);
    const dayStart = (offsetDays: number) =>
      new Date(`${dayKeyOf(new Date(new Date(`${today}T00:00:00${LOCAL_OFFSET}`).getTime() + offsetDays * DAY_MS))}T00:00:00${LOCAL_OFFSET}`);
    const from = dayStart(-1);
    const to = dayStart(2);
    const { rows } = await this.database.pool.query<Row>(
      `SELECT id,name,kind,started_at,finished_at FROM events
       WHERE user_id=$1 AND deleted_at IS NULL AND started_at < $3 AND COALESCE(finished_at,started_at) >= $2
       ORDER BY started_at LIMIT $4`, [userId, from, to, CANDIDATE_LIMITS.events]);
    return rows.map((row) => ({
      kind: "event" as const, id: String(row.id).trim(), name: String(row.name), eventKind: String(row.kind),
      startedAt: iso(row.started_at), finishedAt: iso(row.finished_at),
    }));
  }

  private async tasks(userId: string): Promise<EditCandidate[]> {
    const { rows } = await this.database.pool.query<Row>(
      `SELECT id,name,status FROM tasks
       WHERE user_id=$1 AND deleted_at IS NULL AND status NOT IN ('done','cancel')
       ORDER BY updated_at DESC LIMIT $2`, [userId, CANDIDATE_LIMITS.tasks]);
    return rows.map((row) => ({
      kind: "task" as const, id: String(row.id).trim(), name: String(row.name), status: String(row.status),
    }));
  }

  private async series(userId: string): Promise<EditCandidate[]> {
    const { rows } = await this.database.pool.query<Row>(
      `SELECT id,target_kind,freq,interval_count,byweekday,bymonthday,bymonth,time_of_day,duration_minutes,time_zone,
         starts_on::text AS starts_on,ends_on::text AS ends_on,template->>'name' AS name
       FROM recurrences WHERE user_id=$1 ORDER BY updated_at DESC LIMIT $2`, [userId, CANDIDATE_LIMITS.series]);
    return rows.map((row) => ({
      kind: "recurrence" as const, id: String(row.id).trim(), name: String(row.name ?? ""),
      target: row.target_kind as "event" | "task",
      cadence: describeRecurrenceRule({
        frequency: row.freq as "daily" | "weekly" | "monthly" | "yearly", interval: Number(row.interval_count),
        byWeekday: row.byweekday === null ? undefined : Number(row.byweekday),
        byMonthDay: row.bymonthday === null ? undefined : Number(row.bymonthday),
        byMonth: row.bymonth === null ? undefined : Number(row.bymonth),
        timeOfDay: String(row.time_of_day).slice(0, 5),
        durationMinutes: row.duration_minutes === null ? undefined : Number(row.duration_minutes),
        timeZone: String(row.time_zone), startsOn: String(row.starts_on),
        endsOn: row.ends_on === null ? undefined : String(row.ends_on),
      }),
    }));
  }

  private async notes(userId: string): Promise<EditCandidate[]> {
    const { rows } = await this.database.pool.query<Row>(
      `SELECT id,name,type,left(COALESCE(data->>'body',data->>'inputText',data->>'description',''),$3) AS preview
       FROM notes WHERE user_id=$1 AND deleted_at IS NULL
       ORDER BY updated_at DESC LIMIT $2`, [userId, CANDIDATE_LIMITS.notes, TEXT_PREVIEW_CHARS]);
    return rows.map((row) => ({
      kind: "note" as const, id: String(row.id).trim(), name: String(row.name), noteType: String(row.type),
      ...(row.preview ? { text: String(row.preview) } : {}),
    }));
  }
}
