import { Body, Controller, HttpCode, HttpStatus, Inject, Module, NotFoundException, Post, UseGuards } from "@nestjs/common";
import type { RequestDto } from "@repo/contracts";
import { modelSelectionSchema } from "@repo/contracts/schemas";
import { z } from "zod";
import { InvalidInputError } from "../../api-core/agent/errors/agent.errors";
import { ApiCoreModule } from "../../api-core/api-core.module";
import { modelModeEnabled, selectionProblem } from "../../api-core/requests/model-catalog";
import { modelAgendaOwner } from "../../api-core/requests/model-config";
import { RequestOperations } from "../../api-core/requests/request-operations";
import { CurrentUser } from "../../http/request-identity/current-user.decorator";
import { GatewayIdentityGuard } from "../../http/request-identity/gateway-identity.guard";
import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";
import { startHermesRequestBody } from "../start-hermes-request/start-hermes-request.controller";

/** O corpo do Hermes mais a escolha do provedor, do modelo e do esforco. */
export const startModelRequestBody = startHermesRequestBody.extend({ model: modelSelectionSchema });

/**
 * O modo modelo do chat (ADR 0019). So existe com ao menos uma chave de provedor: sem nenhuma, o 404 vem antes de
 * ler o corpo, e e assim que o cliente descobre que o modo nao existe aqui.
 */
@Controller("api/requests")
export class StartModelRequestController {
  constructor(@Inject(RequestOperations) private readonly requests: RequestOperations) {}

  /**
   * `POST /api/requests/model`: manda uma mensagem ao modelo escolhido. O provedor precisa estar ligado e o modelo
   * na lista dele. A resposta se acompanha em `GET /api/requests/:requestId`.
   */
  @Post("model")
  @UseGuards(GatewayIdentityGuard)
  @HttpCode(HttpStatus.ACCEPTED)
  async start(@Body() body: unknown, @CurrentUser() actor: AuthenticatedUser): Promise<RequestDto> {
    if (!modelModeEnabled()) throw new NotFoundException();
    const parsed = startModelRequestBody.safeParse(body);
    if (!parsed.success) throw new InvalidInputError(z.prettifyError(parsed.error));
    const problem = await selectionProblem(parsed.data.model);
    if (problem) throw new InvalidInputError(problem);
    return this.requests.startModel(parsed.data, actor, modelAgendaOwner());
  }
}

@Module({ imports: [ApiCoreModule.forRoot()], controllers: [StartModelRequestController] })
export class StartModelRequestModule {}
