import { Module } from "@nestjs/common";
import { openAuthDatabase } from "./client";
import type { RuntimeEnv } from "../config/env";
import { AUTH_DATABASE } from "./tokens";

@Module({})
export class DbModule {
  static providers(envToken: symbol) {
    return [{ provide: AUTH_DATABASE, inject: [envToken], useFactory: (env: RuntimeEnv) => openAuthDatabase(env.databasePath) }];
  }
}
