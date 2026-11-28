import { Module, type DynamicModule } from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";
import { DeliverTranscriptionModule } from "./features/deliver-transcription/deliver-transcription.controller";
import { RenewTranscriptionLeaseModule } from "./features/renew-transcription-lease/renew-transcription-lease.controller";
import { RequestTranscriptionModule } from "./features/request-transcription/request-transcription.controller";
import { ReserveTranscriptionModule } from "./features/reserve-transcription/reserve-transcription.controller";
import { SaveDailyReadingModule } from "./features/save-daily-reading/save-daily-reading.controller";
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
        // Rotas estaticas devem ser registradas antes das rotas parametrizadas.
        SaveDailyReadingModule,
        RequestTranscriptionModule,
        ReserveTranscriptionModule,
        RenewTranscriptionLeaseModule,
        DeliverTranscriptionModule,
        SuggestTagsModule,
        SearchPlacesModule,
      ],
      providers: [{ provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor }],
    };
  }
}
