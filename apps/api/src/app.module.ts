import { Module } from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";
import { ApiCoreModule } from "./nest/api-core.module";
import { IdempotencyInterceptor } from "./http/idempotency/idempotency.interceptor";
import { PersistenceModule } from "./nest/persistence.module";
import { SaveDailyReadingModule } from "./features/save-daily-reading/save-daily-reading.controller";
import { RequestTranscriptionModule } from "./features/request-transcription/request-transcription.controller";
import { ReserveTranscriptionModule } from "./features/reserve-transcription/reserve-transcription.controller";
import { RenewTranscriptionLeaseModule } from "./features/renew-transcription-lease/renew-transcription-lease.controller";
import { DeliverTranscriptionModule } from "./features/deliver-transcription/deliver-transcription.controller";
import { FormatTranscriptionModule } from "./features/format-transcription/format-transcription.module";
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
import { StartRequestModule } from "./features/start-request/start-request.controller";
import { StartEditRequestModule } from "./features/start-edit-request/start-edit-request.controller";
import { StartHermesRequestModule } from "./features/start-hermes-request/start-hermes-request.controller";
import { StartModelRequestModule } from "./features/start-model-request/start-model-request.controller";
import { GetModelOptionsModule } from "./features/get-model-options/get-model-options.controller";
import { StartVoiceRequestModule } from "./features/start-voice-request/start-voice-request.controller";
import { ListRequestsModule } from "./features/list-requests/list-requests.controller";
import { GetRequestModule } from "./features/get-request/get-request.controller";
import { CancelRequestModule } from "./features/cancel-request/cancel-request.controller";
import { ListAgentFilesModule } from "./features/list-agent-files/list-agent-files.module";
import { ReadAgentFileModule } from "./features/read-agent-file/read-agent-file.module";
import { ListAgentFileBackupsModule } from "./features/list-agent-file-backups/list-agent-file-backups.module";
import { RestoreAgentFileModule } from "./features/restore-agent-file/restore-agent-file.module";
import { RequestAgentFileEditModule } from "./features/request-agent-file-edit/request-agent-file-edit.controller";

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
