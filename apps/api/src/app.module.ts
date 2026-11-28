import { Module, type DynamicModule } from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";
import { SearchPlacesModule } from "./features/search-places/search-places.controller";
import { SuggestTagsModule } from "./features/suggest-tags/suggest-tags.controller";
import { IdempotencyInterceptor } from "./http/idempotency/idempotency.interceptor";
import { ApiCoreModule } from "./nest/api-core.module";
import { ApiRuntimeModule } from "./nest/api-runtime.module";
import type { ApiRuntime } from "./server/composition-root";

/**
 * O Nest continua hospedando as rotas que ainda nao migraram, em coexistencia
 * com o Fastify. Ele nao cria nem inicia o worker: recebe do composition root,
 * pelo `ApiRuntimeModule`, o mesmo worker, o mesmo registro de handlers e o
 * mesmo servico de arquivos do runtime.
 */
@Module({})
export class AppModule {
  static forRoot(runtime: Pick<ApiRuntime, "jobs" | "requestOperations" | "agentFiles" | "agentFilesBootstrap">): DynamicModule {
    return {
      module: AppModule,
      imports: [
        ApiRuntimeModule.forRoot(runtime),
        ApiCoreModule.forRoot(),
        SuggestTagsModule,
        SearchPlacesModule,
      ],
      providers: [{ provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor }],
    };
  }
}
