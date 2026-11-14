import type {
  RequestDto,
  StartEditRequestInput,
  StartHermesRequestInput,
  StartRequestInput,
  StartRequestResponse,
  StartVoiceRequestInput,
} from "@repo/contracts";
import { ApiRequestError, apiRequest } from "./client-request";

/** O Hermes está desligado nesta API (`AI_AUTOMATION`): a rota dele responde não encontrado. */
export class HermesOffError extends Error {
  constructor() {
    super("O Hermes está desligado nesta API.");
    this.name = "HermesOffError";
  }
}

/** Cancelar um pedido de alimento responde conflito: o alimento se apaga pelo próprio artefato. */
export class FoodCancelConflictError extends Error {
  constructor() {
    super("Este pedido calcula um alimento: apague o alimento para parar o cálculo.");
    this.name = "FoodCancelConflictError";
  }
}

/** Abre um pedido em texto (chat). Devolve só o id; acompanhe com `getRequest`. */
export async function startRequest(input: StartRequestInput): Promise<string> {
  const accepted = await apiRequest<StartRequestResponse>("POST", "/api/requests", { body: input });
  return accepted.requestId;
}

/** Abre o pedido de edição da entidade que a tela de detalhe tem aberta. Devolve o id do pedido. */
export async function startEditRequest(input: StartEditRequestInput): Promise<string> {
  const accepted = await apiRequest<StartRequestResponse>("POST", "/api/requests/edit", { body: input });
  return accepted.requestId;
}

/**
 * Manda uma mensagem ao Hermes. Devolve o pedido inteiro, não só o id. Com o Hermes desligado, a API responde
 * 404 antes de ler o corpo, e isso vira `HermesOffError`.
 */
export async function sendHermesMessage(input: StartHermesRequestInput): Promise<RequestDto> {
  try {
    return await apiRequest<RequestDto>("POST", "/api/requests/hermes", { body: input });
  } catch (error) {
    if (error instanceof ApiRequestError && error.kind === "not_found") throw new HermesOffError();
    throw error;
  }
}

/** Abre um pedido de voz. O evento criado aparece em `entities` do pedido quando ele termina. */
export async function startVoiceRequest(input: StartVoiceRequestInput): Promise<string> {
  const accepted = await apiRequest<StartRequestResponse>("POST", "/api/requests/voice", { body: input });
  return accepted.requestId;
}

/** Um pedido com passos, estado, entidades e resposta. */
export function getRequest(requestId: string): Promise<RequestDto> {
  return apiRequest<RequestDto>("GET", `/api/requests/${encodeURIComponent(requestId)}`);
}

/** Os pedidos do usuário, do mais novo para o mais antigo, sem o rastro. A API aceita de 1 a 50; padrão 20. */
export function listRequests(limit?: number): Promise<RequestDto[]> {
  return apiRequest<RequestDto[]>("GET", "/api/requests", { query: { limit } });
}

/**
 * Cancela o que o agente ainda não terminou. Pedido já terminado volta como estava. Pedido de alimento responde
 * conflito, que vira `FoodCancelConflictError`.
 */
export async function cancelRequest(requestId: string): Promise<RequestDto> {
  try {
    return await apiRequest<RequestDto>("POST", `/api/requests/${encodeURIComponent(requestId)}/cancel`);
  } catch (error) {
    if (error instanceof ApiRequestError && error.kind === "conflict") throw new FoodCancelConflictError();
    throw error;
  }
}
