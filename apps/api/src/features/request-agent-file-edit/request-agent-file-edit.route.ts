import { z } from "zod";
import type { RequestDto } from "@repo/contracts";
import type { RequestOperations } from "../../api-core/requests/request-operations";
import { clientMessageIdSchema } from "../../api-core/agent/agent-input.schemas";
import { assertConfigOwner, configAsNotFound, configPath, parseConfigInput } from "../../api-core/agent/config/agent-config-access";
import type { AgentFilesService } from "../../api-core/agent/config/agent-files.service";
import { getServerEnv } from "../../config/env";
import { NotFoundError } from "../../common/http-errors";
import type { ApiRoute, ApiRouteOperation } from "../../http/api-route";

export const editRequestBody = z.object({
  path: configPath,
  request: z.string().trim().min(1).max(4000),
  /** Estavel por pedido: reenviar devolve o pedido ja aceito, sem uma segunda mensagem ao Hermes. */
  clientMessageId: clientMessageIdSchema,
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

export const requestAgentFileEditOperation = {
  method: "POST",
  path: "/api/ai/config/edit-request",
  status: 202,
  authentication: "gateway-session",
} as const satisfies ApiRouteOperation;

/**
 * `POST /api/ai/config/edit-request`: o dono pede ao Hermes uma alteracao num
 * arquivo de skill ou agente. E um pedido da rota do Hermes (`AI_AUTOMATION`), entao se
 * acompanha em `GET /api/requests/:requestId`; so o dono acessa (ADR 0004/0005).
 */
export function requestAgentFileEditRoute(
  files: Pick<AgentFilesService, "read">,
  requests: Pick<RequestOperations, "startHermes">,
): ApiRoute {
  return {
    ...requestAgentFileEditOperation,
    handler: async ({ body, actor }): Promise<RequestDto> => {
      assertConfigOwner(actor);
      if (getServerEnv().AI_AUTOMATION !== "on") throw new NotFoundError();
      const input = parseConfigInput(editRequestBody, body);
      await configAsNotFound(() => files.read(input.path));
      return requests.startHermes(
        { userId: actor.userId, text: agentFileEditPrompt(input.path, input.request), clientMessageId: input.clientMessageId },
        actor,
      );
    },
  };
}
