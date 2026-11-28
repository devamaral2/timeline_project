import { Module, type DynamicModule, type Type } from '@nestjs/common';
import type { RuntimeEnv } from './config/env';
import type { AuthCore } from './composition-root';
import { AuthCoreModule } from './auth-core/auth-core.module';
import { ApiProxyModule } from './http/api-proxy/api-proxy.module';

export interface AppModuleOptions {
  /** Controllers só de teste, montados junto com o Nest temporário. */
  readonly controllers?: readonly Type<unknown>[];
}

/**
 * O que ainda vive no Nest: o proxy Auth -> API e a chave de dispositivo. As
 * sessões, convites e a administração já são servidos pelo Fastify.
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
      imports: [AuthCoreModule.forRoot(env, core), ApiProxyModule],
      ...(options.controllers?.length ? { controllers: [...options.controllers] } : {}),
    };
  }
}
