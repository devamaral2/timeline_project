import { Module } from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";
import { CancelRequestModule } from "./features/cancel-request/cancel-request.controller";
import { DeliverTranscriptionModule } from "./features/deliver-transcription/deliver-transcription.controller";
import { FormatTranscriptionModule } from "./features/format-transcription/format-transcription.module";
import { GetModelOptionsModule } from "./features/get-model-options/get-model-options.controller";
import { GetRequestModule } from "./features/get-request/get-request.controller";
import { ListAgentFileBackupsModule } from "./features/list-agent-file-backups/list-agent-file-backups.module";
import { ListAgentFilesModule } from "./features/list-agent-files/list-agent-files.module";
import { ListRequestsModule } from "./features/list-requests/list-requests.controller";
import { ReadAgentFileModule } from "./features/read-agent-file/read-agent-file.module";
import { RenewTranscriptionLeaseModule } from "./features/renew-transcription-lease/renew-transcription-lease.controller";
import { RequestAgentFileEditModule } from "./features/request-agent-file-edit/request-agent-file-edit.controller";
import { RequestTranscriptionModule } from "./features/request-transcription/request-transcription.controller";
import { ReserveTranscriptionModule } from "./features/reserve-transcription/reserve-transcription.controller";
import { RestoreAgentFileModule } from "./features/restore-agent-file/restore-agent-file.module";
import { SaveDailyReadingModule } from "./features/save-daily-reading/save-daily-reading.controller";
import { SearchPlacesModule } from "./features/search-places/search-places.controller";
import { StartEditRequestModule } from "./features/start-edit-request/start-edit-request.controller";
import { StartHermesRequestModule } from "./features/start-hermes-request/start-hermes-request.controller";
import { StartModelRequestModule } from "./features/start-model-request/start-model-request.controller";
import { StartRequestModule } from "./features/start-request/start-request.controller";
import { StartVoiceRequestModule } from "./features/start-voice-request/start-voice-request.controller";
import { SuggestTagsModule } from "./features/suggest-tags/suggest-tags.controller";
import { IdempotencyInterceptor } from "./http/idempotency/idempotency.interceptor";
import { ApiCoreModule } from "./nest/api-core.module";
import { PersistenceModule } from "./nest/persistence.module";

@Module({
  imports: [
    ApiCoreModule.forRoot(),
    PersistenceModule,
    // Rotas estaticas devem ser registradas antes das rotas parametrizadas.
    SaveDailyReadingModule,
    RequestTranscriptionModule,
    ReserveTranscriptionModule,
    RenewTranscriptionLeaseModule,
    DeliverTranscriptionModule,
    FormatTranscriptionModule,
    SuggestTagsModule,
    SearchPlacesModule,
    ListAgentFilesModule,
    ReadAgentFileModule,
    RequestAgentFileEditModule,
    ListAgentFileBackupsModule,
    RestoreAgentFileModule,
    StartRequestModule,
    StartEditRequestModule,
    StartHermesRequestModule,
    StartModelRequestModule,
    GetModelOptionsModule,
    StartVoiceRequestModule,
    ListRequestsModule,
    GetRequestModule,
    CancelRequestModule,
  ],
  providers: [{ provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor }],
})
export class AppModule {}
