import { Module } from "@nestjs/common";
import { TranscribeAudioModule } from "./features/transcribe-audio/transcribe-audio.controller";
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
import { ListRecurrencesModule } from "./features/list-recurrences/list-recurrences.module";
import { CreateRecurrenceModule } from "./features/create-recurrence/create-recurrence.controller";
import { GetRecurrenceModule } from "./features/get-recurrence/get-recurrence.module";
import { UpdateRecurrenceModule } from "./features/update-recurrence/update-recurrence.controller";
import { DeleteRecurrenceModule } from "./features/delete-recurrence/delete-recurrence.controller";
import { RunAgentModule } from "./features/run-agent/run-agent.controller";
import { IssueAgentChatTicketModule } from "./features/issue-agent-chat-ticket/issue-agent-chat-ticket.controller";
import { ListAgentConversationsModule } from "./features/list-agent-conversations/list-agent-conversations.controller";
import { ListAgentChatMessagesModule } from "./features/list-agent-chat-messages/list-agent-chat-messages.controller";
import { RenameAgentConversationModule } from "./features/rename-agent-conversation/rename-agent-conversation.controller";
import { DeleteAgentConversationModule } from "./features/delete-agent-conversation/delete-agent-conversation.controller";

@Module({
  imports: [
    ApiCoreModule.forRoot(),
    TranscribeAudioModule,
    // Rotas estaticas devem ser registradas antes das rotas parametrizadas.
    GetDailyOverviewModule,
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
    ListRecurrencesModule,
    CreateRecurrenceModule,
    GetRecurrenceModule,
    UpdateRecurrenceModule,
    DeleteRecurrenceModule,
    RunAgentModule,
    IssueAgentChatTicketModule,
    ListAgentConversationsModule,
    ListAgentChatMessagesModule,
    RenameAgentConversationModule,
    DeleteAgentConversationModule,
    AgentChatModule,
  ],
})
export class AppModule {}
