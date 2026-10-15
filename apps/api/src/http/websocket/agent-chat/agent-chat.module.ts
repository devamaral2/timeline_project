import { Module } from "@nestjs/common";
import { HttpAdapterHost } from "@nestjs/core";
import { AGENT_CHAT_TICKET_STORE } from "../../../infrastructure/persistence";
import type { AgentChatTicketStore } from "../../../domain/ports";
import { ApiCoreModule } from "../../../api-core/api-core.module";
import { QueuedAiOperations } from "../../../api-core/agent/queued-ai-operations";
import { AgentChatServer } from "./agent-chat.server";

@Module({
  imports: [ApiCoreModule.forRoot()],
  providers: [{
    provide: AgentChatServer,
    inject: [HttpAdapterHost, AGENT_CHAT_TICKET_STORE, QueuedAiOperations],
    useFactory: (
      adapterHost: HttpAdapterHost,
      tickets: AgentChatTicketStore,
      runChatTurn: QueuedAiOperations,
    ) => new AgentChatServer(() => adapterHost.httpAdapter.getHttpServer(), tickets, runChatTurn),
  }],
})
export class AgentChatModule {}
