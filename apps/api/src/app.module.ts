import { Module, type DynamicModule } from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";
import { ApiCoreModule } from "./nest/api-core.module";
import { IdempotencyInterceptor } from "./http/idempotency/idempotency.interceptor";
import { ApiRuntimeModule } from "./nest/api-runtime.module";
import type { ApiRuntime } from "./server/composition-root";
import { SaveDailyReadingModule } from "./features/save-daily-reading/save-daily-reading.controller";
import { RequestTranscriptionModule } from "./features/request-transcription/request-transcription.controller";
import { ReserveTranscriptionModule } from "./features/reserve-transcription/reserve-transcription.controller";
import { RenewTranscriptionLeaseModule } from "./features/renew-transcription-lease/renew-transcription-lease.controller";
import { DeliverTranscriptionModule } from "./features/deliver-transcription/deliver-transcription.controller";
import { SearchPlacesModule } from "./features/search-places/search-places.controller";
import { SuggestTagsModule } from "./features/suggest-tags/suggest-tags.controller";
import { ListArtifactsModule } from "./features/list-artifacts/list-artifacts.controller";
import { CreateArtifactModule } from "./features/create-artifact/create-artifact.controller";
import { GetArtifactModule } from "./features/get-artifact/get-artifact.controller";
import { UpdateArtifactModule } from "./features/update-artifact/update-artifact.controller";
import { DeleteArtifactModule } from "./features/delete-artifact/delete-artifact.controller";
import { ListRecurrencesModule } from "./features/list-recurrences/list-recurrences.module";
import { CreateRecurrenceModule } from "./features/create-recurrence/create-recurrence.controller";
import { GetRecurrenceModule } from "./features/get-recurrence/get-recurrence.module";
import { UpdateRecurrenceModule } from "./features/update-recurrence/update-recurrence.controller";
import { DeleteRecurrenceModule } from "./features/delete-recurrence/delete-recurrence.controller";
import { ListAgentFilesModule } from "./features/list-agent-files/list-agent-files.module";
import { ReadAgentFileModule } from "./features/read-agent-file/read-agent-file.module";
import { ListAgentFileBackupsModule } from "./features/list-agent-file-backups/list-agent-file-backups.module";
import { RestoreAgentFileModule } from "./features/restore-agent-file/restore-agent-file.module";
import { RequestAgentFileEditModule } from "./features/request-agent-file-edit/request-agent-file-edit.controller";

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
        ListArtifactsModule,
        CreateArtifactModule,
        GetArtifactModule,
        UpdateArtifactModule,
        DeleteArtifactModule,
        ListRecurrencesModule,
        CreateRecurrenceModule,
        GetRecurrenceModule,
        UpdateRecurrenceModule,
        DeleteRecurrenceModule,
        ListAgentFilesModule,
        ReadAgentFileModule,
        RequestAgentFileEditModule,
        ListAgentFileBackupsModule,
        RestoreAgentFileModule,
      ],
      providers: [{ provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor }],
    };
  }
}
