/**
 * A ordem do processo e parte do contrato operacional (spec #92).
 *
 * No startup: registrar os handlers, iniciar watchers e reconciliadores, deixar
 * o servidor pronto e so entao comecar a pegar jobs. No shutdown, a ordem
 * inversa: parar de aceitar trabalho e esperar o que ja roda antes de fechar o
 * servidor e o banco.
 */
export interface RuntimeResources {
  /** Registra os handlers da fila. Roda antes de o worker comecar a pegar jobs. */
  registerHandlers(): void;
  agentFiles: { start(): Promise<void>; stop(): void };
  fastify: { ready(): unknown; close(): Promise<void> };
  jobs: { start(): void; shutdown(): Promise<void> };
  database: { close(): Promise<void> };
}

export interface RuntimeLifecycle {
  start(): Promise<void>;
  close(): Promise<void>;
}

/**
 * Um lifecycle explicito, sem hooks de framework: cada etapa aparece na ordem
 * em que o processo precisa dela, e o `close` e idempotente para que a falha de
 * um passo nao tente fechar duas vezes o banco.
 */
export function createRuntimeLifecycle(resources: RuntimeResources): RuntimeLifecycle {
  let closing: Promise<void> | undefined;

  const close = (): Promise<void> => {
    closing ??= (async () => {
      try {
        // Para de aceitar trabalho, aborta o que roda e espera os jobs ativos.
        await resources.jobs.shutdown();
      } finally {
        try {
          // Para os watchers da pasta de agentes.
          resources.agentFiles.stop();
        } finally {
          try {
            await resources.fastify.close();
          } finally {
            await resources.database.close();
          }
        }
      }
    })();
    return closing;
  };

  return {
    async start(): Promise<void> {
      resources.registerHandlers();
      await resources.agentFiles.start();
      await resources.fastify.ready();
      resources.jobs.start();
    },
    close,
  };
}
