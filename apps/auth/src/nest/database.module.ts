import { Module } from "@nestjs/common";
import { createAuthDatabase } from "../db/client";
import type { RuntimeEnv } from "../config/env";
import { AUTH_DATABASE } from "../db/tokens";

/** Adaptador temporario: a conexao e `db/client.ts` continuam sem Nest. */
@Module({})
export class DatabaseModule {
  static providers(envToken: symbol) {
    return [
      {
        provide: AUTH_DATABASE,
        inject: [envToken],
        useFactory: (env: RuntimeEnv) => createAuthDatabase({ connectionString: env.databaseUrl }),
      },
    ];
  }
}
