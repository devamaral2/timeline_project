/**
 * A matriz HTTP da API: uma entrada por operação, com o status de sucesso, o
 * formato da resposta e a identidade que a rota exige.
 *
 * Ela não depende de metadata de decorators: é a mesma lista que a linha de
 * base executa contra o servidor Fastify. Se uma operação sair daqui ou mudar de
 * contrato, os dois lados acusam.
 */

export type ApiHttpMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

/** Quem a rota aceita: a sessão encaminhada pelo gateway ou a chave de dispositivo do serviço local. */
export type ApiAuthentication = "gateway-session" | "transcription-device-key";

/** `json-or-empty` é a reserva do serviço local: 200 com pedido ou 204 sem corpo quando a fila está vazia. */
export type ApiResponseFormat = "json" | "empty" | "json-or-empty";

export interface ApiHttpOperation {
  method: ApiHttpMethod;
  /** O caminho como no documento OpenAPI, com `{param}` no lugar dos ids. */
  path: string;
  successStatuses: readonly (200 | 201 | 202 | 204)[];
  responseFormat: ApiResponseFormat;
  authentication: ApiAuthentication;
}

export const API_HTTP_OPERATIONS: readonly ApiHttpOperation[] = [
  { method: "GET", path: "/api/tasks", successStatuses: [200], responseFormat: "json", authentication: "gateway-session" },
  { method: "GET", path: "/api/tasks/tracked", successStatuses: [200], responseFormat: "json", authentication: "gateway-session" },
  { method: "POST", path: "/api/tasks", successStatuses: [201], responseFormat: "json", authentication: "gateway-session" },
  { method: "POST", path: "/api/tasks/daily-reading", successStatuses: [200], responseFormat: "json", authentication: "gateway-session" },
  { method: "POST", path: "/api/tasks/transcription-requests", successStatuses: [200], responseFormat: "json", authentication: "gateway-session" },
  { method: "POST", path: "/api/transcription-worker/next", successStatuses: [200, 204], responseFormat: "json-or-empty", authentication: "transcription-device-key" },
  { method: "POST", path: "/api/transcription-worker/lease", successStatuses: [200], responseFormat: "json", authentication: "transcription-device-key" },
  { method: "POST", path: "/api/transcription-worker/deliver", successStatuses: [200], responseFormat: "json", authentication: "transcription-device-key" },
  { method: "GET", path: "/api/tasks/{taskId}", successStatuses: [200], responseFormat: "json", authentication: "gateway-session" },
  { method: "PATCH", path: "/api/tasks/{taskId}", successStatuses: [204], responseFormat: "empty", authentication: "gateway-session" },
  { method: "PUT", path: "/api/tasks/{taskId}/situation", successStatuses: [200], responseFormat: "json", authentication: "gateway-session" },
  { method: "DELETE", path: "/api/tasks/{taskId}", successStatuses: [204], responseFormat: "empty", authentication: "gateway-session" },

  { method: "GET", path: "/api/tags", successStatuses: [200], responseFormat: "json", authentication: "gateway-session" },
  { method: "GET", path: "/api/places", successStatuses: [200], responseFormat: "json", authentication: "gateway-session" },

  { method: "GET", path: "/api/artifacts", successStatuses: [200], responseFormat: "json", authentication: "gateway-session" },
  { method: "POST", path: "/api/artifacts", successStatuses: [201], responseFormat: "json", authentication: "gateway-session" },
  { method: "GET", path: "/api/artifacts/{artifactId}", successStatuses: [200], responseFormat: "json", authentication: "gateway-session" },
  { method: "PATCH", path: "/api/artifacts/{artifactId}", successStatuses: [204], responseFormat: "empty", authentication: "gateway-session" },
  { method: "DELETE", path: "/api/artifacts/{artifactId}", successStatuses: [204], responseFormat: "empty", authentication: "gateway-session" },

  { method: "GET", path: "/api/projects", successStatuses: [200], responseFormat: "json", authentication: "gateway-session" },
  { method: "POST", path: "/api/projects", successStatuses: [201], responseFormat: "json", authentication: "gateway-session" },

  { method: "GET", path: "/api/recurrences", successStatuses: [200], responseFormat: "json", authentication: "gateway-session" },
  { method: "POST", path: "/api/recurrences", successStatuses: [201], responseFormat: "json", authentication: "gateway-session" },
  { method: "GET", path: "/api/recurrences/{recurrenceId}", successStatuses: [200], responseFormat: "json", authentication: "gateway-session" },
  { method: "PATCH", path: "/api/recurrences/{recurrenceId}", successStatuses: [204], responseFormat: "empty", authentication: "gateway-session" },
  { method: "DELETE", path: "/api/recurrences/{recurrenceId}", successStatuses: [204], responseFormat: "empty", authentication: "gateway-session" },

  { method: "POST", path: "/api/requests", successStatuses: [202], responseFormat: "json", authentication: "gateway-session" },
  { method: "POST", path: "/api/requests/edit", successStatuses: [202], responseFormat: "json", authentication: "gateway-session" },
  { method: "POST", path: "/api/requests/hermes", successStatuses: [202], responseFormat: "json", authentication: "gateway-session" },
  { method: "GET", path: "/api/requests/model/options", successStatuses: [200], responseFormat: "json", authentication: "gateway-session" },
  { method: "POST", path: "/api/requests/model", successStatuses: [202], responseFormat: "json", authentication: "gateway-session" },
  { method: "POST", path: "/api/requests/voice", successStatuses: [202], responseFormat: "json", authentication: "gateway-session" },
  { method: "GET", path: "/api/requests", successStatuses: [200], responseFormat: "json", authentication: "gateway-session" },
  { method: "GET", path: "/api/requests/{requestId}", successStatuses: [200], responseFormat: "json", authentication: "gateway-session" },
  { method: "POST", path: "/api/requests/{requestId}/cancel", successStatuses: [200], responseFormat: "json", authentication: "gateway-session" },

  { method: "GET", path: "/api/ai/config", successStatuses: [200], responseFormat: "json", authentication: "gateway-session" },
  { method: "GET", path: "/api/ai/config/file", successStatuses: [200], responseFormat: "json", authentication: "gateway-session" },
  { method: "GET", path: "/api/ai/config/backups", successStatuses: [200], responseFormat: "json", authentication: "gateway-session" },
  { method: "POST", path: "/api/ai/config/restore", successStatuses: [201], responseFormat: "json", authentication: "gateway-session" },
  { method: "POST", path: "/api/ai/config/edit-request", successStatuses: [202], responseFormat: "json", authentication: "gateway-session" },
] as const;

/** As duas rotas de documentação; nenhuma delas passa por autenticação. */
export const API_PUBLIC_PATHS: readonly { method: "GET"; path: string }[] = [
  { method: "GET", path: "/openapi.json" },
  { method: "GET", path: "/docs" },
] as const;

export function operationKey(operation: Pick<ApiHttpOperation, "method" | "path">): string {
  return `${operation.method} ${operation.path}`;
}

/** O caminho concreto para um id de teste, mantendo a forma da matriz. */
export function concretePath(path: string, params: Record<string, string> = {}): string {
  return path.replace(/\{(\w+)\}/g, (_match, name: string) => params[name] ?? `missing-${name}`);
}
