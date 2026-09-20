import { Body, Controller, HttpCode, HttpStatus, Inject, Module, Post, UseGuards } from "@nestjs/common";
import { z } from "zod";
import type { RunAgentResponse } from "@repo/contracts";
import { ApiCoreModule } from "../../api-core/api-core.module";
import { InvalidInputError } from "../../api-core/agent/errors/agent.errors";
import { RunAgentUseCase } from "../../api-core/agent/run-agent.usecase";
import { GatewayIdentityGuard } from "../../http/request-identity/gateway-identity.guard";
import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";
import { CurrentUser } from "../../http/request-identity/current-user.decorator";
import { agentScreenContextSchema, agentTextSchema } from "../../api-core/agent/agent-input.schemas";

const runAgentBody = z.object({
  userId: z.string().min(1).max(128),
  text: agentTextSchema,
  context: agentScreenContextSchema.optional(),
});

@Controller("api/ai")
export class RunAgentController {
  constructor(@Inject(RunAgentUseCase) private readonly runAgent: RunAgentUseCase) {}

  @Post()
  @UseGuards(GatewayIdentityGuard)
  @HttpCode(HttpStatus.OK)
  async execute(@Body() body: unknown, @CurrentUser() actor: AuthenticatedUser): Promise<RunAgentResponse> {
    const parsed = runAgentBody.safeParse(body);
    if (!parsed.success) throw new InvalidInputError(z.prettifyError(parsed.error));
    return this.runAgent.execute(parsed.data, actor);
  }
}

@Module({ imports: [ApiCoreModule.forRoot()], controllers: [RunAgentController] })
export class RunAgentModule {}
