import { Module, type DynamicModule } from "@nestjs/common";
import { Clock, SystemClock } from "./common/clock";
import { CryptoSecretGenerator, SecretGenerator } from "./common/secret-generator";
import type { RuntimeEnv } from "./config/env";
import { HealthController } from "./http/health.controller";
import { DbModule } from "./db/db.module";

export const RUNTIME_ENV = Symbol("RUNTIME_ENV");

@Module({})
export class AppModule {
  static forRoot(env: RuntimeEnv): DynamicModule {
    return {
      module: AppModule,
      imports: [DbModule],
      controllers: [HealthController],
      providers: [
        { provide: RUNTIME_ENV, useValue: env },
        ...DbModule.providers(RUNTIME_ENV),
        { provide: Clock, useClass: SystemClock },
        { provide: SecretGenerator, useClass: CryptoSecretGenerator },
      ],
      exports: [RUNTIME_ENV, Clock, SecretGenerator],
    };
  }
}
