import { Module } from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";
import { ApiCoreModule } from "./api-core/api-core.module";
import { IdempotencyInterceptor } from "./http/idempotency/idempotency.interceptor";
import { PersistenceModule } from "./infrastructure/persistence";
import { CreateEventModule } from "./features/create-event/create-event.module";
import { CreateEventFromTranscriptModule } from "./features/create-event-from-transcript/create-event-from-transcript.controller";
import { GetDailyOverviewModule } from "./features/get-daily-overview/get-daily-overview.module";
import { GetEventModule } from "./features/get-event/get-event.module";
import { ListTimelineEventsModule } from "./features/list-timeline-events/list-timeline-events.module";
import { UpdateEventModule } from "./features/update-event/update-event.controller";
import { DeleteEventModule } from "./features/delete-event/delete-event.controller";
import { SuggestTagsModule } from "./features/suggest-tags/suggest-tags.controller";
import { ListTasksModule } from "./features/list-tasks/list-tasks.module";
import { CreateTaskModule } from "./features/create-task/create-task.controller";
import { GetTaskModule } from "./features/get-task/get-task.module";
import { ListSubtasksModule } from "./features/list-subtasks/list-subtasks.controller";
import { UpdateTaskModule } from "./features/update-task/update-task.controller";
import { DeleteTaskModule } from "./features/delete-task/delete-task.controller";
import { ListNotesModule } from "./features/list-notes/list-notes.module";
import { CreateNoteModule } from "./features/create-note/create-note.controller";
import { GetNoteModule } from "./features/get-note/get-note.module";
import { UpdateNoteModule } from "./features/update-note/update-note.controller";
import { DeleteNoteModule } from "./features/delete-note/delete-note.controller";
import { ListRecurrencesModule } from "./features/list-recurrences/list-recurrences.module";
import { CreateRecurrenceModule } from "./features/create-recurrence/create-recurrence.controller";
import { GetRecurrenceModule } from "./features/get-recurrence/get-recurrence.module";
import { UpdateRecurrenceModule } from "./features/update-recurrence/update-recurrence.controller";
import { DeleteRecurrenceModule } from "./features/delete-recurrence/delete-recurrence.controller";
import { AttachNotesToRecurrenceModule } from "./features/attach-notes-to-recurrence/attach-notes-to-recurrence.controller";
import { StartProcessModule } from "./features/start-process/start-process.controller";
import { GetProcessModule } from "./features/get-process/get-process.controller";
import { StartHermesTurnModule } from "./features/start-hermes-turn/start-hermes-turn.controller";
import { ListAiJobsModule } from "./features/list-ai-jobs/list-ai-jobs.controller";
import { GetAiJobModule } from "./features/get-ai-job/get-ai-job.controller";
import { CancelAiJobModule } from "./features/cancel-ai-job/cancel-ai-job.controller";
import { SubmitTranscriptJobModule } from "./features/submit-transcript-job/submit-transcript-job.controller";
import { ListAgentFilesModule } from "./features/list-agent-files/list-agent-files.module";
import { ReadAgentFileModule } from "./features/read-agent-file/read-agent-file.module";
import { RequestAgentFileEditModule } from "./features/request-agent-file-edit/request-agent-file-edit.controller";
import { ListAgentFileBackupsModule } from "./features/list-agent-file-backups/list-agent-file-backups.module";
import { RestoreAgentFileModule } from "./features/restore-agent-file/restore-agent-file.module";
import { ReloadAgentFilesModule } from "./features/reload-agent-files/reload-agent-files.module";

@Module({
  imports: [
    ApiCoreModule.forRoot(),
    PersistenceModule,
    // Rotas estaticas devem ser registradas antes das rotas parametrizadas.
    GetDailyOverviewModule,
    SubmitTranscriptJobModule,
    CreateEventFromTranscriptModule,
    ListTimelineEventsModule,
    CreateEventModule,
    GetEventModule,
    UpdateEventModule,
    DeleteEventModule,
    SuggestTagsModule,
    ListSubtasksModule,
    ListTasksModule,
    CreateTaskModule,
    GetTaskModule,
    UpdateTaskModule,
    DeleteTaskModule,
    ListNotesModule,
    CreateNoteModule,
    GetNoteModule,
    UpdateNoteModule,
    DeleteNoteModule,
    ListRecurrencesModule,
    CreateRecurrenceModule,
    GetRecurrenceModule,
    UpdateRecurrenceModule,
    DeleteRecurrenceModule,
    AttachNotesToRecurrenceModule,
    ListAgentFilesModule,
    ReadAgentFileModule,
    RequestAgentFileEditModule,
    ListAgentFileBackupsModule,
    RestoreAgentFileModule,
    ReloadAgentFilesModule,
    StartProcessModule,
    GetProcessModule,
    StartHermesTurnModule,
    ListAiJobsModule,
    GetAiJobModule,
    CancelAiJobModule,
  ],
  providers: [{ provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor }],
})
export class AppModule {}
