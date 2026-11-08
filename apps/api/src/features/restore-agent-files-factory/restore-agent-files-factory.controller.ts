import { Controller, Inject, Post, UseGuards } from "@nestjs/common";
import { assertConfigOwner } from "../../api-core/agent/config/agent-config-access";
import { AgentFilesService } from "../../api-core/agent/config/agent-files.service";
import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";
import { CurrentUser } from "../../http/request-identity/current-user.decorator";
import { GatewayIdentityGuard } from "../../http/request-identity/gateway-identity.guard";


/** Skills e agentes como arquivos (ADR 0005). So o dono acessa. */
@Controller("api/ai/config")
export class RestoreAgentFilesFactoryController {
  constructor(@Inject(AgentFilesService) private readonly files: AgentFilesService) {}

  @Post("padrao")
  @UseGuards(GatewayIdentityGuard)
  async execute(@CurrentUser() actor: AuthenticatedUser) {
    assertConfigOwner(actor);
    return { files: await this.files.restoreFactory() };
  }
}
