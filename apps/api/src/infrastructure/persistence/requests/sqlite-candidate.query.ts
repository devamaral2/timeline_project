import { dayKeyOf } from "@repo/timeline";
import { describeRecurrenceRule } from "../../../api-core/recurrences/describe-recurrence-rule";
import type { CandidateQuery, EditCandidate } from "../../../api-core/requests/request-candidates";
import type { CandidateKind } from "../../../api-core/requests/request-steps";
import { artifacts, recurrences, tasks } from "../database/tables";
import { c, rowDecoder } from "../sqlite/columns";
import type { Db } from "../sqlite/database";
import { sql } from "../sqlite/sql";

const DAY_MS = 24 * 60 * 60 * 1000;
/** America/Sao_Paulo, UTC-03:00 sem horario de verao desde 2019 (o mesmo fuso do resto da rota). */
const LOCAL_OFFSET = "-03:00";
const TEXT_PREVIEW_CHARS = 120;

export const CANDIDATE_LIMITS = { scheduled: 20, tracked: 20, artifacts: 15, series: 15 } as const;

const iso = (value: Date | null): string | undefined => (value === null ? undefined : value.toISOString());

const taskRow = rowDecoder({
  id: tasks.columns.id,
  name: tasks.columns.name,
  kind: tasks.columns.kind,
  status: tasks.columns.status,
  startedAt: tasks.columns.startedAt,
  estimatedFinishAt: tasks.columns.estimatedFinishAt,
});
const seriesRow = rowDecoder({
  id: recurrences.columns.id,
  freq: recurrences.columns.freq,
  intervalCount: recurrences.columns.intervalCount,
  byWeekday: recurrences.columns.byWeekday,
  byMonthDay: recurrences.columns.byMonthDay,
  byMonth: recurrences.columns.byMonth,
  timeOfDay: recurrences.columns.timeOfDay,
  durationMinutes: recurrences.columns.durationMinutes,
  timeZone: recurrences.columns.timeZone,
  startsOn: recurrences.columns.startsOn,
  endsOn: recurrences.columns.endsOn,
  name: c.text.nullable(),
});
const artifactRow = rowDecoder({
  id: artifacts.columns.id,
  name: artifacts.columns.name,
  type: artifacts.columns.type,
  preview: c.text,
});

/**
 * A lista curta do que um pedido de escrita pode estar alterando: tarefas de pessoa de ontem, hoje e amanha, os
 * acompanhados em aberto mais recentes, os artefatos mais recentes e as series. O agente de escrita a recebe inteira
 * e escolhe dentro dela; o que ficar de fora ele ainda pode buscar por uma consulta. Pedidos e passos do agente
 * nunca entram.
 */
export class SqliteCandidateQuery implements CandidateQuery {
  constructor(private readonly database: Db) {}

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
    const columns = sql.raw("id, name, kind, status, started_at AS \"startedAt\", estimated_finish_at AS \"estimatedFinishAt\"");
    // `tasks_user_live_idx`: as tarefas vivas de pessoa do usuario.
    const live = sql`user_id = ${userId} AND actor = 'human' AND deleted_at IS NULL`;
    const [scheduled, tracked] = await Promise.all([
      this.database.all(sql`
        SELECT ${columns} FROM tasks
        WHERE ${live} AND NOT long_running AND started_at < ${dayStart(2)}
          AND COALESCE(estimated_finish_at, started_at) >= ${dayStart(-1)}
        ORDER BY started_at LIMIT ${CANDIDATE_LIMITS.scheduled}`, taskRow),
      this.database.all(sql`
        SELECT ${columns} FROM tasks
        WHERE ${live} AND status IS NOT NULL AND status NOT IN ('done', 'cancel', 'missed')
        ORDER BY updated_at DESC LIMIT ${CANDIDATE_LIMITS.tracked}`, taskRow),
    ]);
    const byId = new Map<string, EditCandidate>();
    for (const row of [...scheduled, ...tracked]) {
      const id = row.id.trim();
      if (byId.has(id)) continue;
      byId.set(id, {
        kind: "task", id, name: row.name, taskKind: row.kind,
        ...(row.status ? { status: row.status } : {}),
        ...(row.startedAt ? { startedAt: iso(row.startedAt) } : {}),
        ...(row.estimatedFinishAt ? { estimatedFinishAt: iso(row.estimatedFinishAt) } : {}),
      });
    }
    return [...byId.values()];
  }

  private async series(userId: string): Promise<EditCandidate[]> {
    const rows = await this.database.all(sql`
      SELECT id, freq, interval_count AS "intervalCount", byweekday AS "byWeekday", bymonthday AS "byMonthDay",
        bymonth AS "byMonth", time_of_day AS "timeOfDay", duration_minutes AS "durationMinutes",
        time_zone AS "timeZone", starts_on AS "startsOn", ends_on AS "endsOn", template->>'name' AS name
      FROM recurrences WHERE user_id = ${userId} ORDER BY updated_at DESC LIMIT ${CANDIDATE_LIMITS.series}`, seriesRow);
    return rows.map((row) => ({
      kind: "recurrence" as const, id: row.id.trim(), name: row.name ?? "",
      cadence: describeRecurrenceRule({
        frequency: row.freq, interval: row.intervalCount,
        byWeekday: row.byWeekday ?? undefined,
        byMonthDay: row.byMonthDay ?? undefined,
        byMonth: row.byMonth ?? undefined,
        timeOfDay: row.timeOfDay.slice(0, 5),
        durationMinutes: row.durationMinutes ?? undefined,
        timeZone: row.timeZone, startsOn: row.startsOn,
        endsOn: row.endsOn ?? undefined,
      }),
    }));
  }

  /** So o conteudo do usuario: os arquivos do agente, os exercicios globais e as copias feitas para uma tarefa ficam de fora. */
  private async artifacts(userId: string): Promise<EditCandidate[]> {
    const rows = await this.database.all(sql`
      SELECT id, name, type, substr(COALESCE(data->>'body', data->>'description', ''), 1, ${TEXT_PREVIEW_CHARS}) AS preview
      FROM artifacts
      WHERE user_id = ${userId} AND deleted_at IS NULL AND NOT derived AND type IN ('text', 'food', 'sleep', 'training')
      ORDER BY updated_at DESC, id DESC LIMIT ${CANDIDATE_LIMITS.artifacts}`, artifactRow);
    return rows.map((row) => ({
      kind: "artifact" as const, id: row.id.trim(), name: row.name, artifactType: row.type,
      ...(row.preview ? { text: row.preview } : {}),
    }));
  }
}
