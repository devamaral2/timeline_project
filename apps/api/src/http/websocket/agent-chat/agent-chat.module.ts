import { Module } from "@nestjs/common";
import { HttpAdapterHost } from "@nestjs/core";
import { AGENT_CHAT_TICKET_STORE } from "../../../infrastructure/persistence";
import type { AgentChatTicketStore } from "../../../domain/ports";
import { ApiCoreModule } from "../../../api-core/api-core.module";
import { RunChatTurnUseCase } from "../../../api-core/agent/run-chat-turn.usecase";
import { AgentChatServer } from "./agent-chat.server";

@Module({
  imports: [ApiCoreModule.forRoot()],
  providers: [{
    provide: AgentChatServer,
    inject: [HttpAdapterHost, AGENT_CHAT_TICKET_STORE, RunChatTurnUseCase],
    useFactory: (
      adapterHost: HttpAdapterHost,
      tickets: AgentChatTicketStore,
      runChatTurn: RunChatTurnUseCase,
    ) => new AgentChatServer(() => adapterHost.httpAdapter.getHttpServer(), tickets, runChatTurn),
  }],
})
export class AgentChatModule {}
