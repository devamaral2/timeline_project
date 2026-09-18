import { Module } from "@nestjs/common";
import { HttpAdapterHost } from "@nestjs/core";
import {
  AGENT_CHAT_TICKET_STORE,
  AGENT_CONVERSATION_QUERY,
  AGENT_CONVERSATION_REPOSITORY,
  ENTITY_BATCH_WRITER,
  EVENT_REPOSITORY,
  NOTE_REPOSITORY,
  PersistenceModule,
  SCOPED_SQL_QUERY,
  TASK_REPOSITORY,
} from "@repo/persistence";
import type {
  AgentChatTicketStore,
  AgentConversationQuery,
  AgentConversationRepository,
  EntityBatchWriter,
  EventRepository,
  NoteRepository,
  ScopedSqlQuery,
  TaskRepository,
} from "@repo/entities/ports";
import { EventsModule } from "../events/events.module";
import { CreateEventUseCase } from "../events/usecases/create-event.usecase";
import { AgentChatServer } from "./chat/agent-chat.server";
import { OpenRouterAgentGateway } from "./gateways/openrouter-agent.gateway";
import { AgentChatController } from "./http/agent-chat.controller";
import { AgentConversationsController } from "./http/agent-conversations.controller";
import { AgentController } from "./http/agent.controller";
import { DeleteAgentConversationUseCase } from "./usecases/delete-agent-conversation.usecase";
import { IssueAgentChatTicketUseCase } from "./usecases/issue-agent-chat-ticket.usecase";
import { ListAgentChatMessagesUseCase } from "./usecases/list-agent-chat-messages.usecase";
import { ListAgentConversationsUseCase } from "./usecases/list-agent-conversations.usecase";
import { RenameAgentConversationUseCase } from "./usecases/rename-agent-conversation.usecase";
import { RunAgentUseCase } from "./usecases/run-agent.usecase";
import { RunChatTurnUseCase } from "./usecases/run-chat-turn.usecase";

@Module({
  imports: [PersistenceModule, EventsModule],
  controllers: [AgentController, AgentChatController, AgentConversationsController],
  providers: [
    {
      provide: OpenRouterAgentGateway,
      useFactory: () => new OpenRouterAgentGateway(),
    },
    {
      provide: RunAgentUseCase,
      inject: [
        OpenRouterAgentGateway,
        SCOPED_SQL_QUERY,
        ENTITY_BATCH_WRITER,
        EVENT_REPOSITORY,
        TASK_REPOSITORY,
        NOTE_REPOSITORY,
        CreateEventUseCase,
      ],
      useFactory: (
        gateway: OpenRouterAgentGateway,
        query: ScopedSqlQuery,
        batchWriter: EntityBatchWriter,
        events: EventRepository,
        tasks: TaskRepository,
        notes: NoteRepository,
        createEvent: CreateEventUseCase,
      ) => new RunAgentUseCase(gateway, query, batchWriter, { events, tasks, notes }, createEvent),
    },
    {
      provide: RunChatTurnUseCase,
      inject: [RunAgentUseCase, AGENT_CONVERSATION_QUERY],
      useFactory: (runAgent: RunAgentUseCase, conversations: AgentConversationQuery) =>
        new RunChatTurnUseCase(runAgent, conversations),
    },
    {
      provide: ListAgentConversationsUseCase,
      inject: [AGENT_CONVERSATION_QUERY],
      useFactory: (conversations: AgentConversationQuery) =>
        new ListAgentConversationsUseCase(conversations),
    },
    {
      provide: ListAgentChatMessagesUseCase,
      inject: [AGENT_CONVERSATION_QUERY],
      useFactory: (conversations: AgentConversationQuery) =>
        new ListAgentChatMessagesUseCase(conversations),
    },
    {
      provide: RenameAgentConversationUseCase,
      inject: [AGENT_CONVERSATION_REPOSITORY],
      useFactory: (conversations: AgentConversationRepository) =>
        new RenameAgentConversationUseCase(conversations),
    },
    {
      provide: DeleteAgentConversationUseCase,
      inject: [AGENT_CONVERSATION_REPOSITORY],
      useFactory: (conversations: AgentConversationRepository) =>
        new DeleteAgentConversationUseCase(conversations),
    },
    {
      provide: IssueAgentChatTicketUseCase,
      inject: [AGENT_CHAT_TICKET_STORE],
      useFactory: (tickets: AgentChatTicketStore) => new IssueAgentChatTicketUseCase(tickets),
    },
    {
      provide: AgentChatServer,
      inject: [HttpAdapterHost, AGENT_CHAT_TICKET_STORE, RunChatTurnUseCase],
      useFactory: (
        adapterHost: HttpAdapterHost,
        tickets: AgentChatTicketStore,
        runChatTurn: RunChatTurnUseCase,
      ) => new AgentChatServer(() => adapterHost.httpAdapter.getHttpServer(), tickets, runChatTurn),
    },
  ],
})
export class AgentModule {}
