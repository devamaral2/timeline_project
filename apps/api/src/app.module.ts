import { Module } from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";
import { ApiCoreModule } from "./api-core/api-core.module";
import { IdempotencyInterceptor } from "./http/idempotency/idempotency.interceptor";
import { PersistenceModule } from "./infrastructure/persistence";
import { CreateEventModule } from "./features/create-event/create-event.module";
import { GetDailyOverviewModule } from "./features/get-daily-overview/get-daily-overview.module";
import { GetEventModule } from "./features/get-event/get-event.module";
import { ListAgendaEventsModule } from "./features/list-agenda-events/list-agenda-events.module";
import { ListTrackedEventsModule } from "./features/list-tracked-events/list-tracked-events.module";
import { ListSubtasksModule } from "./features/list-subtasks/list-subtasks.controller";
import { UpdateEventModule } from "./features/update-event/update-event.controller";
import { DeleteEventModule } from "./features/delete-event/delete-event.controller";
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
import { StartVoiceRequestModule } from "./features/start-voice-request/start-voice-request.controller";
import { ListRequestsModule } from "./features/list-requests/list-requests.controller";
import { GetRequestModule } from "./features/get-request/get-request.controller";
import { CancelRequestModule } from "./features/cancel-request/cancel-request.controller";
import { ListAgentFilesModule } from "./features/list-agent-files/list-agent-files.module";
import { ReadAgentFileModule } from "./features/read-agent-file/read-agent-file.module";
import { ListAgentFileBackupsModule } from "./features/list-agent-file-backups/list-agent-file-backups.module";
import { RestoreAgentFileModule } from "./features/restore-agent-file/restore-agent-file.module";
import { ReloadAgentFilesModule } from "./features/reload-agent-files/reload-agent-files.module";
import { RequestAgentFileEditModule } from "./features/request-agent-file-edit/request-agent-file-edit.controller";

@Module({
  imports: [
    ApiCoreModule.forRoot(),
    PersistenceModule,
    // Rotas estaticas devem ser registradas antes das rotas parametrizadas.
    GetDailyOverviewModule,
    ListTrackedEventsModule,
    ListAgendaEventsModule,
    CreateEventModule,
    ListSubtasksModule,
    GetEventModule,
    UpdateEventModule,
    DeleteEventModule,
    SuggestTagsModule,
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
    ReloadAgentFilesModule,
    StartRequestModule,
    StartEditRequestModule,
    StartHermesRequestModule,
    StartVoiceRequestModule,
    ListRequestsModule,
    GetRequestModule,
    CancelRequestModule,
  ],
  providers: [{ provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor }],
})
export class AppModule {}
