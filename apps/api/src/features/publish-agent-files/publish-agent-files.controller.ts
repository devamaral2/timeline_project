import { Body, Controller, Inject, Post, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { assertConfigOwner, parseConfigInput } from "../../api-core/agent/config/agent-config-access";
import { AgentFilesService } from "../../api-core/agent/config/agent-files.service";
import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";
import { CurrentUser } from "../../http/request-identity/current-user.decorator";
import { GatewayIdentityGuard } from "../../http/request-identity/gateway-identity.guard";

const publishBody = z.object({
  agents: z.unknown(),
  jevRouting: z.unknown(),
  prompts: z.unknown(),
  skills: z.unknown(),
});

/** Skills e agentes como arquivos (ADR 0005). So o dono acessa. */
@Controller("api/ai/config")
export class PublishAgentFilesController {
  constructor(@Inject(AgentFilesService) private readonly files: AgentFilesService) {}

  @Post("publish")
  @UseGuards(GatewayIdentityGuard)
  async execute(@Body() body: unknown, @CurrentUser() actor: AuthenticatedUser) {
    assertConfigOwner(actor);
    return { files: await this.files.publish(parseConfigInput(publishBody, body)) };
  }
}
