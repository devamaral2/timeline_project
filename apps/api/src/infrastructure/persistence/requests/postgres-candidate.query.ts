import { dayKeyOf } from "@repo/timeline";
import { describeRecurrenceRule } from "../../../api-core/recurrences/describe-recurrence-rule";
import type { CandidateQuery, EditCandidate } from "../../../api-core/requests/request-candidates";
import type { CandidateKind } from "../../../api-core/requests/request-steps";
import type { PostgresDatabase } from "../database/postgres-database";

const DAY_MS = 24 * 60 * 60 * 1000;
/** America/Sao_Paulo, UTC-03:00 sem horario de verao desde 2019 (o mesmo fuso do resto da rota). */
const LOCAL_OFFSET = "-03:00";
const TEXT_PREVIEW_CHARS = 120;

export const CANDIDATE_LIMITS = { scheduled: 20, tracked: 20, artifacts: 15, series: 15 } as const;

type Row = Record<string, unknown>;

const iso = (value: unknown): string | undefined =>
  value === null || value === undefined ? undefined : new Date(value as string | Date).toISOString();

/**
 * A lista curta do que um pedido de escrita pode estar alterando: tarefas de pessoa de ontem, hoje e amanha, os
 * acompanhados em aberto mais recentes, os artefatos mais recentes e as series. O agente de escrita a recebe inteira
 * e escolhe dentro dela; o que ficar de fora ele ainda pode buscar por uma consulta. Pedidos e passos do agente
 * nunca entram.
 */
export class PostgresCandidateQuery implements CandidateQuery {
  constructor(private readonly database: PostgresDatabase) {}

  async shortlist(input: { userId: string; now: Date; kinds: readonly CandidateKind[] }): Promise<EditCandidate[]> {
    const wanted = new Set(input.kinds);
    const found: EditCandidate[][] = await Promise.all([
      wanted.has("task") ? this.tasks(input.userId, input.now) : [],
      wanted.has("artifact") ? this.artifacts(input.userId) : [],
      wanted.has("recurrence") ? this.series(input.userId) : [],
    ]);
    return found.flat();
  }

  private async tasks(userId: string, now: Date): Promise<EditCandidate[]> {
    const today = dayKeyOf(now);
    const dayStart = (offsetDays: number) =>
      new Date(`${dayKeyOf(new Date(new Date(`${today}T00:00:00${LOCAL_OFFSET}`).getTime() + offsetDays * DAY_MS))}T00:00:00${LOCAL_OFFSET}`);
    const columns = "id, name, kind, status, started_at, estimated_finish_at";
    // `tasks_user_live_idx`: as tarefas vivas de pessoa do usuario.
    const live = "user_id = $1 AND actor = 'human' AND deleted_at IS NULL";
    const [scheduled, tracked] = await Promise.all([
      this.database.pool.query<Row>(
        `SELECT ${columns} FROM tasks
         WHERE ${live} AND NOT long_running AND started_at < $3 AND COALESCE(estimated_finish_at, started_at) >= $2
         ORDER BY started_at LIMIT $4`, [userId, dayStart(-1), dayStart(2), CANDIDATE_LIMITS.scheduled]),
      this.database.pool.query<Row>(
        `SELECT ${columns} FROM tasks
         WHERE ${live} AND status IS NOT NULL AND status NOT IN ('done', 'cancel', 'missed')
         ORDER BY updated_at DESC LIMIT $2`, [userId, CANDIDATE_LIMITS.tracked]),
    ]);
    const byId = new Map<string, EditCandidate>();
    for (const row of [...scheduled.rows, ...tracked.rows]) {
      const id = String(row.id).trim();
      if (byId.has(id)) continue;
      byId.set(id, {
        kind: "task", id, name: String(row.name), taskKind: String(row.kind),
        ...(row.status ? { status: String(row.status) } : {}),
        ...(row.started_at ? { startedAt: iso(row.started_at) } : {}),
        ...(row.estimated_finish_at ? { estimatedFinishAt: iso(row.estimated_finish_at) } : {}),
      });
    }
    return [...byId.values()];
  }

  private async series(userId: string): Promise<EditCandidate[]> {
    const { rows } = await this.database.pool.query<Row>(
      `SELECT id, freq, interval_count, byweekday, bymonthday, bymonth, time_of_day, duration_minutes, time_zone,
         starts_on::text AS starts_on, ends_on::text AS ends_on, template->>'name' AS name
       FROM recurrences WHERE user_id = $1 ORDER BY updated_at DESC LIMIT $2`, [userId, CANDIDATE_LIMITS.series]);
    return rows.map((row) => ({
      kind: "recurrence" as const, id: String(row.id).trim(), name: String(row.name ?? ""),
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

  /** So o conteudo do usuario: os arquivos do agente, os exercicios globais e as copias feitas para uma tarefa ficam de fora. */
  private async artifacts(userId: string): Promise<EditCandidate[]> {
    const { rows } = await this.database.pool.query<Row>(
      `SELECT id, name, type, left(COALESCE(data->>'body', data->>'description', ''), $3) AS preview
       FROM artifacts
       WHERE user_id = $1 AND deleted_at IS NULL AND NOT derived AND type IN ('text', 'food', 'sleep', 'training')
       ORDER BY updated_at DESC, id DESC LIMIT $2`, [userId, CANDIDATE_LIMITS.artifacts, TEXT_PREVIEW_CHARS]);
    return rows.map((row) => ({
      kind: "artifact" as const, id: String(row.id).trim(), name: String(row.name), artifactType: String(row.type),
      ...(row.preview ? { text: String(row.preview) } : {}),
    }));
  }
}
