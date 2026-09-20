import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from "@nestjs/common";
import { z } from "zod";
import type { RunAgentResponse } from "@repo/contracts";
import { GatewayIdentityGuard } from "../../request-identity/gateway-identity.guard";
import type { AuthenticatedUser } from "../../request-identity/authenticated-user";
import { CurrentUser } from "../../request-identity/current-user.decorator";
import { InvalidInputError } from "../errors/agent.errors";
import { RunAgentUseCase } from "../usecases/run-agent.usecase";
import { agentScreenContextSchema, agentTextSchema } from "./agent-input.schemas";

const runAgentBody = z.object({
  userId: z.string().min(1).max(128),
  text: agentTextSchema,
  context: agentScreenContextSchema.optional(),
});

@Controller("api/ai")
export class AgentController {
  constructor(private readonly runAgent: RunAgentUseCase) {}

  @Post()
  @UseGuards(GatewayIdentityGuard)
  @HttpCode(HttpStatus.OK)
  async run(@Body() body: unknown, @CurrentUser() actor: AuthenticatedUser): Promise<RunAgentResponse> {
    const parsed = runAgentBody.safeParse(body);
    if (!parsed.success) throw new InvalidInputError(z.prettifyError(parsed.error));
    return this.runAgent.execute(parsed.data, actor);
  }
}
