import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import type { SqliteDatabase } from "../persistence/sqlite/database";
import type { JobsEnv } from "../../config/env";
import { SqliteTaskRepository } from "../persistence/tasks/repositories/sqlite-task.repository";
import { SqliteJobStore, type Job } from "../persistence/jobs/sqlite-job.store";
import { OTHER_USER, USER, agentTask, countRows, selectRows } from "../persistence/testing/fixtures";
import { createSqliteTestContext, type SqliteTestContext } from "../persistence/testing/sqlite-test-context";
import { NOW, sql } from "../persistence/sqlite/sql";
import { completeCurrentJob, getCurrentJob, type EnqueueJobInput } from "./job-context";
import { JobsService, RetryableJobError, type JobHandlerContext } from "./jobs.service";

const ENV: JobsEnv = { AI_JOBS_CONCURRENCY: 4, AI_JOBS_LEASE_MS: 3000, AI_JOBS_MAX_ATTEMPTS: 3, AI_JOBS_POLL_MS: 50 };

interface JobRow extends Record<string, unknown> {
  status: Job["status"];
  attempts: number;
  error: string | null;
  progress: unknown;
  lease_token: string | null;
  lease_until: Date | null;
  /** Quanto falta, em segundos, para o job poder ser pego de novo. */
  wait_seconds: number;
}

describe("fila de jobs", () => {
  let ctx: SqliteTestContext;
  let database: SqliteDatabase;
  let store: SqliteJobStore;
  let tasks: SqliteTaskRepository;

  beforeAll(async () => {
    ctx = await createSqliteTestContext();
    database = ctx.database;
    store = new SqliteJobStore(database, ENV.AI_JOBS_LEASE_MS, ENV.AI_JOBS_MAX_ATTEMPTS);
    tasks = new SqliteTaskRepository(ctx.db);
    // O efeito de dominio que um handler grava na mesma transacao em que encerra o job.
    database.handle.exec("CREATE TABLE job_effects (job_id TEXT PRIMARY KEY)");
  }, 60000);

  beforeEach(async () => {
    await ctx.reset();
    database.handle.exec("DELETE FROM job_effects");
  });

  afterAll(async () => {
    await ctx?.stop();
  });

  /** Um worker novo por teste: os handlers sao registrados uma vez por tipo. */
  function worker(overrides: Partial<JobsEnv> = {}): JobsService {
    const env = { ...ENV, ...overrides };
    return new JobsService(new SqliteJobStore(database, env.AI_JOBS_LEASE_MS, env.AI_JOBS_MAX_ATTEMPTS), env);
  }

  const enqueue = (overrides: Partial<EnqueueJobInput> = {}) =>
    store.enqueue({ kind: "work", userId: USER, actorId: USER, payload: {}, ...overrides });

  /** SQL de escrita dos testes, com `$1`, `$2`... no lugar dos valores. */
  const exec = (text: string, params: unknown[] = []) => ctx.db.execute(sql.unsafe(text, params));
  const hoursFromNow = (hours: number) => new Date(Date.now() + hours * 3_600_000);

  async function rowOf(jobId: string): Promise<JobRow> {
    const [row] = await selectRows(
      ctx.db,
      `SELECT status, attempts, error, progress, lease_token, lease_until,
              (julianday(available_at) - julianday('now')) * 86400.0 AS wait_seconds
       FROM jobs WHERE id = $1`,
      [jobId],
    );
    return {
      ...row,
      progress: row.progress === null ? null : JSON.parse(String(row.progress)),
      lease_until: row.lease_until === null ? null : new Date(String(row.lease_until)),
    } as JobRow;
  }

  const statusOf = async (jobId: string) => (await rowOf(jobId)).status;
  const makeAvailable = (jobId: string) => exec("UPDATE jobs SET available_at = $2 WHERE id = $1", [jobId, new Date()]);
  const expireLease = (jobId: string) =>
    exec("UPDATE jobs SET lease_until = $2 WHERE id = $1", [jobId, new Date(Date.now() - 1000)]);

  /** Uma passada pela fila, ate os jobs que ela pegou terminarem. */
  async function drain(service: JobsService): Promise<void> {
    await service.tick();
    await service.idle();
  }

  async function requestTask(name: string): Promise<string> {
    const task = agentTask(USER, name);
    await tasks.save(task);
    return task.id;
  }

  describe("enfileirar", () => {
    test("o mesmo usuario, tipo e chave devolvem o mesmo job", async () => {
      const first = await enqueue({ dedupeKey: "artefato-1", payload: { n: 1 } });

      expect(await enqueue({ dedupeKey: "artefato-1", payload: { n: 2 } })).toBe(first);
      expect(await enqueue({ dedupeKey: "artefato-2" })).not.toBe(first);
      expect(await enqueue({ dedupeKey: "artefato-1", kind: "other" })).not.toBe(first);
      expect(await enqueue({ dedupeKey: "artefato-1", userId: OTHER_USER, actorId: OTHER_USER })).not.toBe(first);
      // O job repetido nao troca o payload do que ja estava na fila.
      expect(await store.get(first)).toMatchObject({ payload: { n: 1 }, status: "queued", attempts: 0 });
      expect(await countRows(ctx.db, "jobs")).toBe(4);
    });

    test("sem chave, cada chamada e um job novo", async () => {
      expect(await enqueue()).not.toBe(await enqueue());
      expect(await countRows(ctx.db, "jobs")).toBe(2);
    });

    test("job sem dono nao entra na fila", async () => {
      await expect(enqueue({ userId: "" })).rejects.toThrow(/authenticated ownership/);
      await expect(enqueue({ actorId: "" })).rejects.toThrow(/authenticated ownership/);
      expect(await countRows(ctx.db, "jobs")).toBe(0);
    });
  });

  describe("pegar", () => {
    test("so pega os tipos pedidos, ja disponiveis, ate o limite, e marca o lease", async () => {
      const [a, b] = [await enqueue(), await enqueue()];
      const other = await enqueue({ kind: "other" });
      const later = await enqueue();
      await exec("UPDATE jobs SET available_at = $2 WHERE id = $1", [later, hoursFromNow(1)]);

      expect(await store.claim([], 10)).toEqual([]);
      expect(await store.claim(["work"], 0)).toEqual([]);
      const [claimed] = await store.claim(["work"], 1);
      const rest = await store.claim(["work"], 10);

      expect([claimed.id, ...rest.map((job) => job.id)].sort()).toEqual([a, b].sort());
      expect(claimed).toMatchObject({ status: "running", attempts: 1, userId: USER, actorId: USER, kind: "work" });
      expect(claimed.leaseToken).toEqual(expect.any(String));
      expect((await rowOf(claimed.id)).lease_until).toBeInstanceOf(Date);
      expect(await statusOf(other)).toBe("queued");
      expect(await statusOf(later)).toBe("queued");
    });

    test("dois claim concorrentes no mesmo banco nunca pegam o mesmo job", async () => {
      // O escritor unico serializa cada claim (select e marca do lease numa escrita so).
      const [a, b] = [await enqueue(), await enqueue()];

      const [first, second] = await Promise.all([store.claim(["work"], 1), store.claim(["work"], 1)]);

      expect([...first, ...second].map((job) => job.id).sort()).toEqual([a, b].sort());
      expect(first).toHaveLength(1);
      expect(second).toHaveLength(1);
    });

    test("workers concorrentes nunca pegam o mesmo job", async () => {
      const ids: string[] = [];
      for (let index = 0; index < 12; index += 1) ids.push(await enqueue());
      const workers = [store, ...[1, 2, 3].map(() => new SqliteJobStore(database, 3000, 3))];

      const claimed: Job[] = [];
      for (let round = 0; round < 6 && claimed.length < ids.length; round += 1) {
        claimed.push(...(await Promise.all(workers.map((each) => each.claim(["work"], 3)))).flat());
      }

      expect(claimed.map((job) => job.id).sort()).toEqual([...ids].sort());
      expect(new Set(claimed.map((job) => job.leaseToken)).size).toBe(ids.length);
      expect(await countRows(ctx.db, "jobs", "attempts <> 1")).toBe(0);
    });

    test("jobs com a mesma chave de concorrencia saem um por vez, na ordem de criacao", async () => {
      const first = await enqueue({ concurrencyKey: "user-1:chat" });
      const second = await enqueue({ concurrencyKey: "user-1:chat" });
      const third = await enqueue({ concurrencyKey: "user-1:chat" });
      const otherKey = await enqueue({ concurrencyKey: "user-2:chat" });
      const noKey = await enqueue();

      const round = await store.claim(["work"], 10);
      expect(round.map((job) => job.id).sort()).toEqual([first, otherKey, noKey].sort());
      // Enquanto o primeiro roda, os seguintes esperam.
      expect(await store.claim(["work"], 10)).toEqual([]);

      const running = round.find((job) => job.id === first) as Job;
      expect(await store.succeed(first, running.leaseToken as string)).toBe(true);
      expect((await store.claim(["work"], 10)).map((job) => job.id)).toEqual([second]);
      expect(await statusOf(third)).toBe("queued");
    });

    test("o job mais antigo da chave segura os seguintes mesmo enquanto espera o retry", async () => {
      const first = await enqueue({ concurrencyKey: "user-1:chat" });
      const second = await enqueue({ concurrencyKey: "user-1:chat" });
      await exec("UPDATE jobs SET available_at = $2 WHERE id = $1", [first, hoursFromNow(1)]);

      expect(await store.claim(["work"], 10)).toEqual([]);

      // Terminado (aqui, cancelado), o primeiro libera a vez.
      await exec("UPDATE jobs SET status = 'cancelled' WHERE id = $1", [first]);
      expect((await store.claim(["work"], 10)).map((job) => job.id)).toEqual([second]);
    });
  });

  describe("lease e limpeza", () => {
    test("o heartbeat estende o lease enquanto o job e do worker", async () => {
      const id = await enqueue();
      const [job] = await store.claim(["work"], 1);
      const before = (await rowOf(id)).lease_until as Date;
      // O lease tem precisao de milissegundo: sem a espera, o novo valor poderia cair no mesmo instante.
      await new Promise((resolve) => setTimeout(resolve, 5));

      expect(await store.heartbeat(id, job.leaseToken as string)).toBe(true);
      expect(((await rowOf(id)).lease_until as Date).getTime()).toBeGreaterThan(before.getTime());
      expect(await store.heartbeat(id, "outro-token")).toBe(false);
    });

    test("recover devolve a fila o job de lease vencido, e o worker antigo perde o direito de encerra-lo", async () => {
      const [expired, alive] = [await enqueue(), await enqueue()];
      const claimed = await store.claim(["work"], 10);
      const dead = claimed.find((job) => job.id === expired) as Job;
      await exec("UPDATE jobs SET progress = '{\"stage\": \"pensando\"}' WHERE id = $1", [expired]);
      await expireLease(expired);

      const token = dead.leaseToken as string;
      expect(await store.heartbeat(expired, token)).toBe(false);
      expect(await store.succeed(expired, token)).toBe(false);
      await expect(store.progress(expired, token, { stage: "tarde demais" })).rejects.toThrow(/lease lost/);

      await store.recover();

      const row = await rowOf(expired);
      expect(row).toMatchObject({ status: "queued", error: "Worker lease expired", lease_until: null, attempts: 1 });
      expect(row.wait_seconds).toBeGreaterThan(1);
      expect(row.wait_seconds).toBeLessThanOrEqual(2.1);
      expect(await statusOf(alive)).toBe("running");

      // A tentativa seguinte ganha outro token; a antiga continua sem valer.
      await makeAvailable(expired);
      const [again] = await store.claim(["work"], 1);
      expect(again).toMatchObject({ id: expired, attempts: 2 });
      expect(again.leaseToken).not.toBe(token);
      expect(await store.succeed(expired, token)).toBe(false);
      expect(await store.succeed(expired, again.leaseToken as string)).toBe(true);
    });

    test("recover tira os jobs terminados que passaram do prazo de retencao", async () => {
      const age = async (status: Job["status"], days: number) => {
        const id = await enqueue();
        await exec(
          "UPDATE jobs SET status = $2, updated_at = $3, lease_until = $4 WHERE id = $1",
          [id, status, new Date(Date.now() - days * 86_400_000), hoursFromNow(1)],
        );
        return id;
      };
      await age("succeeded", 8);
      await age("failed", 8);
      await age("cancelled", 8);
      const recent = await age("succeeded", 6);
      const waiting = await age("queued", 30);
      const working = await age("running", 30);

      await store.recover();

      const left = await selectRows(ctx.db, "SELECT id FROM jobs ORDER BY id");
      expect(left.map((row) => row.id)).toEqual([recent, waiting, working].sort());
    });
  });

  describe("worker", () => {
    test("o handler recebe o payload e o contexto do job, e o job termina succeeded", async () => {
      const service = worker();
      const taskId = await requestTask("Pedido");
      const seen: Array<{ payload: unknown; context: JobHandlerContext; current: ReturnType<typeof getCurrentJob> }> = [];
      service.register("work", async (payload, context) => {
        seen.push({ payload, context, current: getCurrentJob() });
      });
      const id = await service.enqueue({ kind: "work", userId: USER, actorId: "admin-1", taskId, payload: { artifactId: "a-1" } });

      await drain(service);

      expect(seen).toHaveLength(1);
      expect(seen[0].payload).toEqual({ artifactId: "a-1" });
      expect(seen[0].context).toMatchObject({ jobId: id, userId: USER, actorId: "admin-1", taskId, attempt: 1 });
      expect(seen[0].context.signal.aborted).toBe(false);
      expect(seen[0].current).toMatchObject({ id, attempts: 1, token: expect.any(String) });
      expect(await rowOf(id)).toMatchObject({ status: "succeeded", error: null, lease_until: null, attempts: 1 });
      // Fora do handler nao ha job em curso, e um job terminado nao e pego de novo.
      expect(getCurrentJob()).toBeUndefined();
      await drain(service);
      expect(seen).toHaveLength(1);
    });

    test("so pega jobs dos tipos que tem handler", async () => {
      const service = worker();
      service.register("work", async () => {});
      const unknown = await enqueue({ kind: "other" });

      await drain(service);

      expect(await rowOf(unknown)).toMatchObject({ status: "queued", attempts: 0 });
      expect(() => service.register("work", async () => {})).toThrow(/already registered/);
    });

    test("erro passageiro volta para a fila com espera crescente e vira failed na ultima tentativa", async () => {
      const service = worker();
      const attempts: number[] = [];
      const failures: Array<{ attempt: number; error: unknown }> = [];
      service.register(
        "work",
        async (_payload, context) => {
          attempts.push(context.attempt);
          throw new RetryableJobError("provedor fora do ar: chave sk-segredo");
        },
        { onFailure: async (_payload, context, error) => void failures.push({ attempt: context.attempt, error }) },
      );
      const id = await enqueue();

      await drain(service);
      let row = await rowOf(id);
      // So o codigo seguro e gravado, nunca a mensagem do provedor.
      expect(row).toMatchObject({ status: "queued", attempts: 1, error: "unavailable", lease_until: null });
      expect(row.wait_seconds).toBeGreaterThan(1);
      expect(row.wait_seconds).toBeLessThanOrEqual(2.1);
      // Durante a espera o job nao e pego.
      await drain(service);
      expect(attempts).toEqual([1]);

      await makeAvailable(id);
      await drain(service);
      row = await rowOf(id);
      expect(row).toMatchObject({ status: "queued", attempts: 2 });
      expect(row.wait_seconds).toBeGreaterThan(3);
      expect(failures).toEqual([]);

      await makeAvailable(id);
      await drain(service);
      expect(await rowOf(id)).toMatchObject({ status: "failed", attempts: 3, error: "unavailable", lease_until: null });
      expect(failures).toHaveLength(1);
      expect(failures[0]).toMatchObject({ attempt: 3, error: expect.any(RetryableJobError) });

      await makeAvailable(id);
      await drain(service);
      expect(attempts).toEqual([1, 2, 3]);
    });

    test("erro definitivo vira failed na primeira tentativa, com o codigo do erro", async () => {
      const service = worker();
      const onFailure = vi.fn(async () => {});
      service.register(
        "work",
        async () => {
          throw Object.assign(new Error("o usuario mandou um texto invalido"), { code: "invalid_input" });
        },
        { onFailure },
      );
      const id = await enqueue();

      await drain(service);

      expect(await rowOf(id)).toMatchObject({ status: "failed", attempts: 1, error: "invalid_input" });
      expect(onFailure).toHaveBeenCalledTimes(1);
    });

    test("tentativas esgotadas por morte do worker encerram o job sem rodar o handler de novo", async () => {
      const service = worker();
      const handler = vi.fn(async () => {});
      const onFailure = vi.fn(async () => {});
      service.register("work", handler, { onFailure });
      const id = await enqueue();
      await exec("UPDATE jobs SET attempts = $2 WHERE id = $1", [id, ENV.AI_JOBS_MAX_ATTEMPTS]);

      await drain(service);

      expect(handler).not.toHaveBeenCalled();
      expect(onFailure).toHaveBeenCalledTimes(1);
      expect(await rowOf(id)).toMatchObject({ status: "failed", attempts: ENV.AI_JOBS_MAX_ATTEMPTS + 1 });
    });

    test("se a projecao da falha quebra, o job nao vira terminal: o lease vence e ela e tentada de novo", async () => {
      const service = worker();
      const onFailure = vi.fn(async () => {});
      onFailure.mockRejectedValueOnce(new Error("banco indisponivel"));
      service.register(
        "work",
        async () => {
          throw new Error("definitivo");
        },
        { onFailure },
      );
      const id = await enqueue();

      await drain(service);
      expect(await rowOf(id)).toMatchObject({ status: "running", attempts: 1 });

      await expireLease(id);
      await service.store.recover();
      await makeAvailable(id);
      await drain(service);

      expect(onFailure).toHaveBeenCalledTimes(2);
      expect(await rowOf(id)).toMatchObject({ status: "failed", attempts: 2 });
    });

    test("o handler que encerra o job na propria transacao nao e encerrado de novo pelo worker", async () => {
      const service = worker();
      const succeed = vi.spyOn(service.store, "succeed");
      service.register("work", async (_payload, context) => {
        await database.transaction(async (tx) => {
          await tx.execute(sql`INSERT INTO job_effects VALUES (${context.jobId})`);
          await completeCurrentJob(tx);
        });
      });
      service.register("plain", async () => {});
      const [domain, plain] = [await enqueue(), await enqueue({ kind: "plain" })];

      await drain(service);

      expect(await rowOf(domain)).toMatchObject({ status: "succeeded", lease_until: null });
      expect(await selectRows(ctx.db, "SELECT job_id FROM job_effects")).toEqual([{ job_id: domain }]);
      // So o job cujo handler nao fechou a propria transacao passa pelo encerramento do worker.
      expect(succeed.mock.calls.map(([jobId]) => jobId)).toEqual([plain]);
      expect(await statusOf(plain)).toBe("succeeded");
    });

    test("se o lease foi perdido, a transacao do handler volta e o efeito nao fica", async () => {
      const service = worker();
      service.register("work", async (_payload, context) => {
        // Outro worker assumiu o job no meio do caminho.
        await exec("UPDATE jobs SET lease_token = 'outro-worker' WHERE id = $1", [context.jobId]);
        await database.transaction(async (tx) => {
          await tx.execute(sql`INSERT INTO job_effects VALUES (${context.jobId})`);
          await completeCurrentJob(tx);
        });
      });
      const id = await enqueue();

      await drain(service);

      expect(await countRows(ctx.db, "job_effects")).toBe(0);
      // O job continua sendo do outro worker: este nao o marca como falha.
      expect(await rowOf(id)).toMatchObject({ status: "running", lease_token: "outro-worker", error: null });
    });

    test("o progresso aparece enquanto o job roda e some quando ele termina ou falha", async () => {
      const service = worker();
      const taskId = await requestTask("Pedido");
      let during: unknown;
      service.register("work", async (payload, context) => {
        await context.progress({ stage: "pensando" });
        during = await service.progressOfTask(taskId);
        if ((payload as { fail?: boolean }).fail) throw new RetryableJobError("tenta de novo");
      });

      const succeeded = await enqueue({ taskId });
      await drain(service);
      expect(during).toEqual({ stage: "pensando" });
      expect((await rowOf(succeeded)).progress).toBeNull();
      expect(await service.progressOfTask(taskId)).toBeUndefined();

      const retried = await enqueue({ taskId, payload: { fail: true } });
      await drain(service);
      expect(await rowOf(retried)).toMatchObject({ status: "queued", progress: null });
      // O job que espera o retry e o job vivo da tarefa, mas sem progresso.
      expect(await service.progressOfTask(taskId)).toBeUndefined();
    });

    test("cancelOfTasks cancela os jobs vivos das tarefas e aborta o handler em curso", async () => {
      const service = worker();
      const [runningTask, queuedTask, untouchedTask] = [
        await requestTask("Rodando"),
        await requestTask("Na fila"),
        await requestTask("Outro pedido"),
      ];
      const running = await enqueue({ taskId: runningTask });
      const queued = await enqueue({ taskId: queuedTask });
      const untouched = await enqueue({ taskId: untouchedTask });
      await exec("UPDATE jobs SET available_at = $3 WHERE id IN ($1, $2)", [queued, untouched, hoursFromNow(1)]);
      let started: () => void = () => {};
      const handlerStarted = new Promise<void>((resolve) => {
        started = resolve;
      });
      let abortedInHandler = false;
      service.register("work", async (_payload, context) => {
        await context.progress({ stage: "pensando" });
        started();
        await new Promise<void>((resolve) => context.signal.addEventListener("abort", () => resolve(), { once: true }));
        abortedInHandler = context.signal.aborted;
      });

      await service.tick();
      await handlerStarted;
      // Outro usuario nao cancela nada.
      await service.cancelOfTasks([runningTask, queuedTask], OTHER_USER);
      expect(await statusOf(running)).toBe("running");

      await service.cancelOfTasks([runningTask, queuedTask], USER);
      await service.idle();

      expect(abortedInHandler).toBe(true);
      expect(await rowOf(running)).toMatchObject({ status: "cancelled", lease_until: null, progress: null });
      expect(await statusOf(queued)).toBe("cancelled");
      expect(await statusOf(untouched)).toBe("queued");
      // Cancelado nao volta: nem para a fila, nem pelo recover.
      await exec("UPDATE jobs SET available_at = $3 WHERE id IN ($1, $2)", [running, queued, new Date()]);
      await service.store.recover();
      expect(await service.store.claim(["work"], 10)).toEqual([]);
    });

    test("nao passa das vagas do worker", async () => {
      const service = worker({ AI_JOBS_CONCURRENCY: 2 });
      let release: () => void = () => {};
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      let active = 0;
      let peak = 0;
      service.register("work", async () => {
        active += 1;
        peak = Math.max(peak, active);
        await gate;
        active -= 1;
      });
      for (let index = 0; index < 3; index += 1) await enqueue();

      await service.tick();
      // Com as vagas cheias, outra passada nao pega mais nada.
      await service.tick();
      expect(await countRows(ctx.db, "jobs", "status = 'running'")).toBe(2);
      expect(await countRows(ctx.db, "jobs", "status = 'queued'")).toBe(1);

      release();
      await service.idle();
      await drain(service);

      expect(peak).toBe(2);
      expect(await countRows(ctx.db, "jobs", "status = 'succeeded'")).toBe(3);
    });

    test("jobs com a mesma chave de concorrencia rodam um por vez, na ordem em que foram criados", async () => {
      const service = worker();
      const order: string[] = [];
      let active = 0;
      let peak = 0;
      service.register("work", async (_payload, context) => {
        active += 1;
        peak = Math.max(peak, active);
        await new Promise((resolve) => setTimeout(resolve, 20));
        order.push(context.jobId);
        active -= 1;
      });
      const ids: string[] = [];
      for (let index = 0; index < 3; index += 1) ids.push(await enqueue({ concurrencyKey: "user-1:chat" }));

      for (let round = 0; round < 3; round += 1) await drain(service);

      expect(order).toEqual(ids);
      expect(peak).toBe(1);
    });

    test("o laco de fundo consome a fila sozinho e para no desligamento", async () => {
      const service = worker();
      const handled: string[] = [];
      service.register("work", async (_payload, context) => void handled.push(context.jobId));
      const id = await enqueue();

      service.start();
      try {
        await vi.waitFor(async () => expect(await statusOf(id)).toBe("succeeded"), { timeout: 5000, interval: 25 });
      } finally {
        await service.shutdown();
      }

      const late = await enqueue();
      await drain(service);
      expect(handled).toEqual([id]);
      expect(await statusOf(late)).toBe("queued");
    });

    test("o desligamento aborta o handler em curso e nao marca o job como sucesso", async () => {
      const service = worker();
      let started: () => void = () => {};
      const handlerStarted = new Promise<void>((resolve) => {
        started = resolve;
      });
      service.register("work", async (_payload, context) => {
        started();
        await new Promise<void>((resolve) => context.signal.addEventListener("abort", () => resolve(), { once: true }));
      });
      const id = await enqueue();

      await service.tick();
      await handlerStarted;
      await service.shutdown();

      // Fica cercado pelo lease: quando vencer, outro worker o recupera.
      expect(await rowOf(id)).toMatchObject({ status: "running", attempts: 1 });
      await expireLease(id);
      await store.recover();
      expect(await statusOf(id)).toBe("queued");
    });
  });
});
