import { Body, Controller, HttpCode, HttpStatus, Inject, Module, Post, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { ApiCoreModule } from "../../api-core/api-core.module";
import { InvalidInputError } from "../../api-core/agent/errors/agent.errors";
import { agentScreenContextSchema, agentTextSchema } from "../../api-core/agent/agent-input.schemas";
import { ProcessOperations } from "../../api-core/process/process-operations";
import { GatewayIdentityGuard } from "../../http/request-identity/gateway-identity.guard";
import { CurrentUser } from "../../http/request-identity/current-user.decorator";
import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";

const startProcessBody = z.object({
  userId: z.string().min(1).max(128),
  text: agentTextSchema,
  context: agentScreenContextSchema.optional(),
});

/** `POST /api/ai/process`: a rota de IA por processo (ADR 003). */
@Controller("api/ai/process")
export class StartProcessController {
  constructor(@Inject(ProcessOperations) private readonly processes: ProcessOperations) {}

  @Post()
  @UseGuards(GatewayIdentityGuard)
  @HttpCode(HttpStatus.ACCEPTED)
  async start(@Body() body: unknown, @CurrentUser() actor: AuthenticatedUser): Promise<{ processId: string }> {
    const parsed = startProcessBody.safeParse(body);
    if (!parsed.success) throw new InvalidInputError(z.prettifyError(parsed.error));
    return { processId: await this.processes.start(parsed.data, actor) };
  }
}

@Module({ imports: [ApiCoreModule.forRoot()], controllers: [StartProcessController] })
export class StartProcessModule {}
