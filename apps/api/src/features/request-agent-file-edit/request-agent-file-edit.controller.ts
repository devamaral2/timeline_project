import { Body, Controller, HttpCode, HttpStatus, Inject, Module, NotFoundException, Post, UseGuards } from "@nestjs/common";
import { z } from "zod";
import type { AiJobDto } from "@repo/contracts";
import { ApiCoreModule } from "../../api-core/api-core.module";
import { QueuedAiOperations } from "../../api-core/agent/queued-ai-operations";
import { assertConfigOwner, configAsNotFound, configPath, parseConfigInput } from "../../api-core/agent/config/agent-config-access";
import { AgentFilesService } from "../../api-core/agent/config/agent-files.service";
import { toAiJobDto } from "../../api-core/dto/ai-job.dto";
import { getServerEnv } from "../../config/env";
import { GatewayIdentityGuard } from "../../http/request-identity/gateway-identity.guard";
import { CurrentUser } from "../../http/request-identity/current-user.decorator";
import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";
import { AiJobsService } from "../../infrastructure/ai-jobs/ai-jobs.service";

const editRequestBody = z.object({
  path: configPath,
  request: z.string().trim().min(1).max(4000),
  /** Estavel por pedido: reenviar devolve o job ja aceito, sem uma segunda mensagem ao Hermes. */
  clientMessageId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/),
});

/** O texto que o Hermes recebe: ele edita o arquivo, mas antes avalia se o pedido compromete o fluxo (ADR 0005, decisao 6). */
export function agentFileEditPrompt(path: string, request: string): string {
  return [
    `O dono pediu uma alteração no arquivo \`${path}\` (pasta de skills e agentes, montada em /opt/agent-files).`,
    "",
    "Pedido:",
    request,
    "",
    "Antes de editar, avalie o impacto: se a mudança comprometer o fluxo dos pedidos (por exemplo, remover uma regra que outras skills ou agentes usam), NÃO edite e explique o risco.",
    "Se for seguro, edite o arquivo, preservando o restante do texto, e responda em poucas linhas o que mudou.",
  ].join("\n");
}

/**
 * `POST /api/ai/config/edit-request`: o dono pede ao Hermes uma alteracao num arquivo de skill ou agente.
 * Sai pelo mesmo job da rota do Hermes (`AI_AUTOMATION`), entao se acompanha em `GET /api/ai/jobs/:id`.
 */
@Controller("api/ai/config")
export class RequestAgentFileEditController {
  constructor(
    @Inject(AgentFilesService) private readonly files: AgentFilesService,
    @Inject(QueuedAiOperations) private readonly operations: QueuedAiOperations,
    @Inject(AiJobsService) private readonly jobs: AiJobsService,
  ) {}

  @Post("edit-request")
  @UseGuards(GatewayIdentityGuard)
  @HttpCode(HttpStatus.ACCEPTED)
  async execute(@Body() body: unknown, @CurrentUser() actor: AuthenticatedUser): Promise<AiJobDto> {
    assertConfigOwner(actor);
    if (getServerEnv().AI_AUTOMATION !== "on") throw new NotFoundException();
    const input = parseConfigInput(editRequestBody, body);
    await configAsNotFound(() => this.files.read(input.path));
    const id = await this.operations.submitHermes(
      { userId: actor.userId, text: agentFileEditPrompt(input.path, input.request) },
      actor,
      input.clientMessageId,
    );
    return toAiJobDto(await this.jobs.get(id, actor.userId));
  }
}

@Module({ imports: [ApiCoreModule.forRoot()], controllers: [RequestAgentFileEditController] })
export class RequestAgentFileEditModule {}
