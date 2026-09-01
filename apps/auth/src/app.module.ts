import { Module, type DynamicModule } from "@nestjs/common";
import { Clock, SystemClock } from "./common/clock";
import { CryptoSecretGenerator, SecretGenerator } from "./common/secret-generator";
import type { RuntimeEnv } from "./config/env";
import { HealthController } from "./http/health.controller";

export const RUNTIME_ENV = Symbol("RUNTIME_ENV");

@Module({})
export class AppModule {
  static forRoot(env: RuntimeEnv): DynamicModule {
    return {
      module: AppModule,
      controllers: [HealthController],
      providers: [
        { provide: RUNTIME_ENV, useValue: env },
        { provide: Clock, useClass: SystemClock },
        { provide: SecretGenerator, useClass: CryptoSecretGenerator },
      ],
      exports: [RUNTIME_ENV, Clock, SecretGenerator],
    };
  }
}
