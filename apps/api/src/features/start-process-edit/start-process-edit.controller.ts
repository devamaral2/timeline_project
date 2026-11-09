import { Body, Controller, HttpCode, HttpStatus, Inject, Module, Post, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { ApiCoreModule } from "../../api-core/api-core.module";
import { InvalidInputError } from "../../api-core/agent/errors/agent.errors";
import { agentTextSchema } from "../../api-core/agent/agent-input.schemas";
import { ProcessOperations } from "../../api-core/process/process-operations";
import { GatewayIdentityGuard } from "../../http/request-identity/gateway-identity.guard";
import { CurrentUser } from "../../http/request-identity/current-user.decorator";
import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";

const startProcessEditBody = z.object({
  userId: z.string().min(1).max(128),
  text: agentTextSchema,
  entityType: z.enum(["event", "task", "note", "meal_note", "sleep_note", "training_note", "skill_note", "agent_note"]),
  entityId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
});

/**
 * `POST /api/ai/process/edit`: o pedido de edicao da entidade aberta na tela de detalhe (ADR 006). Responde com o
 * `processId`, que se acompanha em `GET /api/ai/process/:id`, como qualquer processo.
 */
@Controller("api/ai/process")
export class StartProcessEditController {
  constructor(@Inject(ProcessOperations) private readonly processes: ProcessOperations) {}

  @Post("edit")
  @UseGuards(GatewayIdentityGuard)
  @HttpCode(HttpStatus.ACCEPTED)
  async start(@Body() body: unknown, @CurrentUser() actor: AuthenticatedUser): Promise<{ processId: string }> {
    const parsed = startProcessEditBody.safeParse(body);
    if (!parsed.success) throw new InvalidInputError(z.prettifyError(parsed.error));
    return { processId: await this.processes.startEdit(parsed.data, actor) };
  }
}

@Module({ imports: [ApiCoreModule.forRoot()], controllers: [StartProcessEditController] })
export class StartProcessEditModule {}
