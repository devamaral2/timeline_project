import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from "@nestjs/common";
import { z } from "zod";
import type { RunAgentResponse } from "@repo/contracts";
import { AuthServiceGuard } from "../../authorize-user/auth-service.guard";
import type { AuthenticatedUser } from "../../authenticate-user/authenticated-user";
import { CurrentUser } from "../../authenticate-user/current-user.decorator";
import { AccessResource } from "../../authorize-user/access-resource.decorator";
import { InvalidInputError } from "../errors/agent.errors";
import { RunAgentUseCase } from "../usecases/run-agent.usecase";
import { agentScreenContextSchema, agentTextSchema } from "./agent-input.schemas";

const runAgentBody = z.object({
  userId: z.string().min(1).max(128),
  text: agentTextSchema,
  context: agentScreenContextSchema.optional(),
});

@Controller("api/ai")
@AccessResource("agent")
export class AgentController {
  constructor(private readonly runAgent: RunAgentUseCase) {}

  @Post()
  @UseGuards(AuthServiceGuard)
  @HttpCode(HttpStatus.OK)
  async run(@Body() body: unknown, @CurrentUser() actor: AuthenticatedUser): Promise<RunAgentResponse> {
    const parsed = runAgentBody.safeParse(body);
    if (!parsed.success) throw new InvalidInputError(z.prettifyError(parsed.error));
    return this.runAgent.execute(parsed.data, actor);
  }
}
