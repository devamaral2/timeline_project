import { Module } from "@nestjs/common";
import { ApiCoreModule } from "./api-core/api-core.module";
import { AgentChatModule } from "./http/websocket/agent-chat/agent-chat.module";
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
import { RunAgentModule } from "./features/run-agent/run-agent.controller";
import { IssueAgentChatTicketModule } from "./features/issue-agent-chat-ticket/issue-agent-chat-ticket.controller";
import { ListAgentConversationsModule } from "./features/list-agent-conversations/list-agent-conversations.controller";
import { ListAgentChatMessagesModule } from "./features/list-agent-chat-messages/list-agent-chat-messages.controller";
import { RenameAgentConversationModule } from "./features/rename-agent-conversation/rename-agent-conversation.controller";
import { DeleteAgentConversationModule } from "./features/delete-agent-conversation/delete-agent-conversation.controller";
import { SubmitAiJobModule } from "./features/submit-ai-job/submit-ai-job.controller";
import { ListAiJobsModule } from "./features/list-ai-jobs/list-ai-jobs.controller";
import { GetAiJobModule } from "./features/get-ai-job/get-ai-job.controller";
import { CancelAiJobModule } from "./features/cancel-ai-job/cancel-ai-job.controller";
import { SubmitTranscriptJobModule } from "./features/submit-transcript-job/submit-transcript-job.controller";

@Module({
  imports: [
    ApiCoreModule.forRoot(),
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
    RunAgentModule,
    SubmitAiJobModule,
    ListAiJobsModule,
    GetAiJobModule,
    CancelAiJobModule,
    IssueAgentChatTicketModule,
    ListAgentConversationsModule,
    ListAgentChatMessagesModule,
    RenameAgentConversationModule,
    DeleteAgentConversationModule,
    AgentChatModule,
  ],
})
export class AppModule {}
