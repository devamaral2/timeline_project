import { createApiRuntime, type ApiRuntime } from "../server/composition-root";

export interface ApiTestApp {
  url: string;
  runtime: ApiRuntime;
  close(): Promise<void>;
}

export type ApiTestEnv = Record<string, string>;

/**
 * Sobe a API como o `main.ts` sobe: o runtime do composition root e o mesmo
 * Fastify, com o parser de corpo, o error handler, a documentacao e o CORS
 * decididos pelo ambiente. A unica diferenca e a porta efemera no loopback.
 */
export async function createApiTestApp(env: ApiTestEnv): Promise<ApiTestApp> {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(env)) {
    previous.set(key, process.env[key]);
    process.env[key] = value;
  }

  const restoreEnv = (): void => {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };

  let runtime: ApiRuntime | undefined;
  try {
    runtime = await createApiRuntime({
      databasePath: env.API_DATABASE_PATH,
      authInternalServiceKey: env.AUTH_INTERNAL_SERVICE_KEY,
      logger: { warn() {}, error() {} },
    });
    await runtime.start();
    const url = await runtime.fastify.listen({ port: 0, host: "127.0.0.1" });

    return {
      url,
      runtime,
      close: async () => {
        await runtime?.close();
        restoreEnv();
      },
    };
  } catch (error) {
    await runtime?.close();
    restoreEnv();
    throw error;
  }
}
