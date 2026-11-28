import { Module, type DynamicModule, type Type } from '@nestjs/common';
import type { RuntimeEnv } from './config/env';
import type { AuthCore } from './composition-root';
import { AuthCoreModule } from './auth-core/auth-core.module';

export interface AppModuleOptions {
  /** Controllers só de teste, montados junto com o Nest temporário. */
  readonly controllers?: readonly Type<unknown>[];
}

/**
 * O que ainda vive no Nest: só o núcleo compartilhado e os controllers de teste
 * que as sondas de contrato montam. Sessões, convites, administração e o proxy
 * Auth -> API já são servidos pelo Fastify.
 */
@Module({})
export class AppModule {
  static forRoot(
    env: RuntimeEnv,
    core: AuthCore,
    options: AppModuleOptions = {},
  ): DynamicModule {
    return {
      module: AppModule,
      imports: [AuthCoreModule.forRoot(env, core)],
      ...(options.controllers?.length ? { controllers: [...options.controllers] } : {}),
    };
  }
}
