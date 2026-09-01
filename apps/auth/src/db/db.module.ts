import { Module } from "@nestjs/common";
import { createAuthDatabase } from "./client";
import type { RuntimeEnv } from "../config/env";
import { AUTH_DATABASE } from "./tokens";

@Module({})
export class DbModule {
  static providers(envToken: symbol) {
    return [{ provide: AUTH_DATABASE, inject: [envToken], useFactory: (env: RuntimeEnv) => createAuthDatabase({ connectionString: env.databaseUrl }) }];
  }
}
