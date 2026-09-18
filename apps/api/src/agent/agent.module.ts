import { Module } from "@nestjs/common";
import { HttpAdapterHost } from "@nestjs/core";
import {
  AGENT_CHAT_TICKET_STORE,
  ENTITY_BATCH_WRITER,
  EVENT_REPOSITORY,
  NOTE_REPOSITORY,
  PersistenceModule,
  SCOPED_SQL_QUERY,
  TASK_REPOSITORY,
} from "@repo/persistence";
import type {
  AgentChatTicketStore,
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
import { AgentController } from "./http/agent.controller";
import { IssueAgentChatTicketUseCase } from "./usecases/issue-agent-chat-ticket.usecase";
import { RunAgentUseCase } from "./usecases/run-agent.usecase";

@Module({
  imports: [PersistenceModule, EventsModule],
  controllers: [AgentController, AgentChatController],
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
      provide: IssueAgentChatTicketUseCase,
      inject: [AGENT_CHAT_TICKET_STORE],
      useFactory: (tickets: AgentChatTicketStore) => new IssueAgentChatTicketUseCase(tickets),
    },
    {
      provide: AgentChatServer,
      inject: [HttpAdapterHost, AGENT_CHAT_TICKET_STORE, RunAgentUseCase],
      useFactory: (adapterHost: HttpAdapterHost, tickets: AgentChatTicketStore, runAgent: RunAgentUseCase) =>
        new AgentChatServer(() => adapterHost.httpAdapter.getHttpServer(), tickets, runAgent),
    },
  ],
})
export class AgentModule {}
