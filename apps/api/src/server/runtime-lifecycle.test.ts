import { expect, test, vi } from "vitest";
import { createRuntimeLifecycle } from "./runtime-lifecycle";

/** Um grafo falso que registra a ordem em que cada etapa do lifecycle e chamada. */
function setup(options: { shutdown?: () => Promise<void> } = {}) {
  const calls: string[] = [];
  const resources = {
    registerHandlers: vi.fn(() => calls.push("handlers")),
    agentFiles: {
      start: vi.fn(async () => void calls.push("agent-files:start")),
      stop: vi.fn(() => void calls.push("agent-files:stop")),
    },
    fastify: {
      ready: vi.fn(async () => void calls.push("fastify:ready")),
      close: vi.fn(async () => void calls.push("fastify:close")),
    },
    jobs: {
      start: vi.fn(() => void calls.push("jobs:start")),
      shutdown: vi.fn(async () => {
        calls.push("jobs:shutdown");
        await options.shutdown?.();
      }),
    },
    database: { close: vi.fn(async () => void calls.push("database:close")) },
  };
  return { calls, resources, lifecycle: createRuntimeLifecycle(resources) };
}

test("o startup registra os handlers, inicia os arquivos, prepara o servidor e so entao comeca o polling", async () => {
  const { calls, lifecycle } = setup();

  await lifecycle.start();

  expect(calls).toEqual(["handlers", "agent-files:start", "fastify:ready", "jobs:start"]);
});

test("o shutdown para o trabalho, espera os jobs ativos e fecha tudo na ordem inversa", async () => {
  let release!: () => void;
  const activeJob = new Promise<void>((resolve) => {
    release = resolve;
  });
  const { calls, lifecycle } = setup({ shutdown: () => activeJob });

  await lifecycle.start();
  const closing = lifecycle.close();

  // O banco so fecha depois de o trabalho ativo terminar.
  await Promise.resolve();
  expect(calls).toEqual(["handlers", "agent-files:start", "fastify:ready", "jobs:start", "jobs:shutdown"]);

  release();
  await closing;

  expect(calls.slice(4)).toEqual([
    "jobs:shutdown",
    "agent-files:stop",
    "fastify:close",
    "database:close",
  ]);
});

test("fechar duas vezes nao repete o shutdown nem fecha o banco de novo", async () => {
  const { resources, lifecycle } = setup();
  await lifecycle.start();

  await Promise.all([lifecycle.close(), lifecycle.close()]);
  await lifecycle.close();

  expect(resources.jobs.shutdown).toHaveBeenCalledTimes(1);
  expect(resources.database.close).toHaveBeenCalledTimes(1);
  expect(resources.fastify.close).toHaveBeenCalledTimes(1);
});

test("a falha de uma etapa nao impede o shutdown das seguintes", async () => {
  const { resources, lifecycle } = setup();
  await lifecycle.start();
  resources.agentFiles.stop.mockImplementation(() => {
    throw new Error("watcher quebrado");
  });

  await expect(lifecycle.close()).rejects.toThrow("watcher quebrado");

  expect(resources.fastify.close).toHaveBeenCalledTimes(1);
  expect(resources.database.close).toHaveBeenCalledTimes(1);
});
