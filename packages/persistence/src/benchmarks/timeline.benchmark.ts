import { performance } from "node:perf_hooks";
import { ulid } from "ulid";
import { drizzle } from "drizzle-orm/node-postgres";
import type { Logger } from "drizzle-orm/logger";
import { createPostgresTestContext, type PostgresTestContext } from "../testing/postgres-test-context";
import { PostgresTimelineEventQuery } from "../events/queries/postgres-timeline-event.query";
import { PostgresDailyOverviewQuery } from "../events/queries/postgres-daily-overview.query";
import * as schema from "../database/schema";

if (process.env.RUN_POSTGRES_INTEGRATION !== "1") {
  console.error(
    "bench:postgres exige RUN_POSTGRES_INTEGRATION=1 e Docker em execucao (sobe um Postgres via Testcontainers). Rode via `npm run bench:postgres`.",
  );
  process.exit(1);
}

const USERS = ["user-a", "user-b"] as const;
const PAGE_LIMIT = 50;
const DATASET_SIZES = [20, 100, 1000] as const;

interface CapturedQuery {
  sql: string;
  params: unknown[];
}

function captureQueries(ctx: PostgresTestContext): {
  queries: CapturedQuery[];
  db: ReturnType<typeof drizzle<typeof schema>>;
} {
  const queries: CapturedQuery[] = [];
  const logger: Logger = {
    logQuery(sql, params) {
      queries.push({ sql, params });
    },
  };
  return { queries, db: drizzle(ctx.pool, { schema, logger }) };
}

async function seedEvents(ctx: PostgresTestContext, count: number): Promise<void> {
  const baseTime = Date.UTC(2026, 0, 1, 0, 0, 0);
  const ids: string[] = [];
  const userIds: string[] = [];
  const names: string[] = [];
  const startedAts: string[] = [];
  const itemIds: string[] = [];

  for (let i = 0; i < count; i++) {
    ids.push(ulid());
    userIds.push(USERS[i % USERS.length]);
    names.push(`Evento ${i}`);
    startedAts.push(new Date(baseTime + i * 60_000).toISOString());
    itemIds.push(ulid());
  }

  const CHUNK = 1000;
  for (let offset = 0; offset < count; offset += CHUNK) {
    const end = Math.min(offset + CHUNK, count);
    await ctx.pool.query(
      `INSERT INTO events (id, user_id, name, started_at)
       SELECT * FROM UNNEST($1::char(26)[], $2::text[], $3::text[], $4::timestamptz[])`,
      [
        ids.slice(offset, end),
        userIds.slice(offset, end),
        names.slice(offset, end),
        startedAts.slice(offset, end),
      ],
    );
    await ctx.pool.query(
      `INSERT INTO event_items (id, event_id, position, type, schema_version, is_primary, data)
       SELECT id, event_id, 0, 'routine', 1, true, '{}'::jsonb
       FROM UNNEST($1::char(26)[], $2::char(26)[]) AS t(id, event_id)`,
      [itemIds.slice(offset, end), ids.slice(offset, end)],
    );
  }
}

interface ScenarioResult {
  datasetSize: number;
  timelineMs: number;
  timelineRoundTrips: number;
  timelineBytes: number;
  overviewMs: number;
  overviewRoundTrips: number;
  overviewBytes: number;
}

async function measure(ctx: PostgresTestContext, datasetSize: number): Promise<ScenarioResult> {
  await ctx.reset();
  await seedEvents(ctx, datasetSize);
  await ctx.pool.query("ANALYZE events, event_items");

  const { queries: timelineQueries, db: timelineDb } = captureQueries(ctx);
  const timelineStart = performance.now();
  const timelinePage = await new PostgresTimelineEventQuery(timelineDb).list({
    userId: "user-a",
    limit: PAGE_LIMIT,
  });
  const timelineMs = performance.now() - timelineStart;

  const {
    rows: [{ started_on: representativeDate }],
  } = await ctx.pool.query<{ started_on: string }>(
    `SELECT started_on::text AS started_on FROM events WHERE user_id = $1 ORDER BY started_on LIMIT 1`,
    ["user-a"],
  );

  const { queries: overviewQueries, db: overviewDb } = captureQueries(ctx);
  const overviewStart = performance.now();
  const overview = await new PostgresDailyOverviewQuery(overviewDb).get({
    userId: "user-a",
    date: representativeDate,
    timeZone: "America/Sao_Paulo",
  });
  const overviewMs = performance.now() - overviewStart;

  return {
    datasetSize,
    timelineMs,
    timelineRoundTrips: timelineQueries.length,
    timelineBytes: Buffer.byteLength(JSON.stringify(timelinePage)),
    overviewMs,
    overviewRoundTrips: overviewQueries.length,
    overviewBytes: Buffer.byteLength(JSON.stringify(overview)),
  };
}

async function main(): Promise<void> {
  console.log("Subindo PostgreSQL via Testcontainers para o benchmark de timeline...");
  const ctx = await createPostgresTestContext();

  try {
    const results: ScenarioResult[] = [];
    for (const size of DATASET_SIZES) {
      console.log(`Medindo com ${size} eventos...`);
      results.push(await measure(ctx, size));
    }

    console.log(
      `\nResultados (pagina de ${PAGE_LIMIT} eventos). Tempos nao sao comparaveis entre maquinas; use-os so para comparar estrategias no mesmo ambiente.\n`,
    );
    console.table(
      results.map((result) => ({
        eventos: result.datasetSize,
        "timeline (ms)": result.timelineMs.toFixed(2),
        "timeline round trips": result.timelineRoundTrips,
        "timeline bytes": result.timelineBytes,
        "overview (ms)": result.overviewMs.toFixed(2),
        "overview round trips": result.overviewRoundTrips,
        "overview bytes": result.overviewBytes,
      })),
    );
  } finally {
    await ctx.stop();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
