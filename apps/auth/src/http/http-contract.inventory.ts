/**
 * O inventário das operações HTTP do Auth.
 *
 * Ele é a linha de base que a migração para Fastify precisa preservar: para
 * cada operação, método, caminho, status de sucesso, corpo, autenticação e o
 * resultado observável de uma requisição sem credencial. O teste
 * `http-contract.integration.test.ts` confronta esta tabela com o documento
 * OpenAPI e com os servidores de verdade.
 *
 * Operações novas ou removidas passam por aqui: quando o inventário e as rotas
 * reais divergirem, o teste falha. Os campos de sucesso descrevem o corpo que
 * os clientes recebem; os detalhes de validação ficam nos testes de cada fluxo.
 */

/** Como a operação autentica quem chama. */
export type AuthAuthentication =
  /** Livre: health, JWKS, documentação e as operações públicas de sessão/convite. */
  | "none"
  /** Bearer de sessão, validado contra a chave de assinatura ativa. */
  | "bearer"
  /** Bearer de sessão + `*:manage` inteiro (`admin`). */
  | "bearer-super-admin"
  /** Chave de dispositivo (`Bearer bdk_...`) da operação local de transcrição. */
  | "device-key";

/** O que o cliente recebe quando a operação dá certo. */
export interface AuthSuccessContract {
  status: number;
  body:
    | { kind: "json"; schema: string }
    | { kind: "html" }
    | { kind: "empty" }
    /** Repasse integral da resposta da API (status, corpo e headers). */
    | { kind: "passthrough" };
}

export interface AuthOperation {
  /** `ALL` cobre qualquer método aceito pelo proxy. */
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE" | "ALL";
  path: string;
  authentication: AuthAuthentication;
  success: AuthSuccessContract;
  /** Cabeçalhos que a operação garante além dos padrões do servidor. */
  headers: readonly string[];
  /** Está no documento OpenAPI servido em `/openapi.json`? */
  documented: boolean;
  /**
   * Status observado numa requisição canônica, sem credencial e com corpo
   * JSON vazio. Congela a borda que o Fastify precisa reproduzir (401 vazio,
   * 400 invalid_request, 404 not_found e por aí).
   */
  withoutCredential: number;
  /** O que a operação faz, em uma linha. */
  summary: string;
}

const json = (status: number, schema: string): AuthSuccessContract => ({ status, body: { kind: "json", schema } });
const empty = (status: number): AuthSuccessContract => ({ status, body: { kind: "empty" } });
const CORRELATION = ["x-correlation-id"] as const;
const JWKS_HEADERS = ["x-correlation-id", "cache-control", "etag"] as const;

export const AUTH_HTTP_OPERATIONS: readonly AuthOperation[] = Object.freeze([
  // Infraestrutura: fora da autenticação e fora dos módulos de feature.
  { method: "GET", path: "/health/live", authentication: "none", success: json(200, "Health"), headers: CORRELATION, documented: true, withoutCredential: 200, summary: "Liveness sem consultar o banco." },
  { method: "GET", path: "/health/ready", authentication: "none", success: json(200, "Health"), headers: CORRELATION, documented: true, withoutCredential: 200, summary: "Readiness: banco, schema e chave de assinatura ativa." },
  { method: "GET", path: "/.well-known/jwks.json", authentication: "none", success: json(200, "Jwks"), headers: JWKS_HEADERS, documented: true, withoutCredential: 200, summary: "JWKS público, com ETag e 304." },
  { method: "GET", path: "/openapi.json", authentication: "none", success: json(200, "OpenApiDocument"), headers: CORRELATION, documented: false, withoutCredential: 200, summary: "Documento OpenAPI estático." },
  { method: "GET", path: "/docs", authentication: "none", success: { status: 200, body: { kind: "html" } }, headers: CORRELATION, documented: false, withoutCredential: 200, summary: "Referência interativa Scalar." },

  // Convites públicos.
  { method: "POST", path: "/auth/invites/inspect", authentication: "none", success: json(201, "InviteInspection"), headers: CORRELATION, documented: true, withoutCredential: 400, summary: "Inspeciona um convite antes do cadastro." },
  { method: "POST", path: "/auth/invites/accept", authentication: "none", success: json(201, "InviteAccepted"), headers: CORRELATION, documented: true, withoutCredential: 400, summary: "Aceita o convite e define a senha." },

  // Sessões públicas.
  { method: "POST", path: "/auth/login", authentication: "none", success: json(201, "SessionTokens"), headers: CORRELATION, documented: true, withoutCredential: 400, summary: "Login por email e senha emite uma sessão." },
  { method: "POST", path: "/auth/token/refresh", authentication: "none", success: json(200, "RefreshTokens"), headers: CORRELATION, documented: true, withoutCredential: 400, summary: "Troca o refresh token consumindo-o." },
  { method: "POST", path: "/auth/logout", authentication: "none", success: empty(204), headers: CORRELATION, documented: true, withoutCredential: 400, summary: "Revoga a sessão do refresh token; responde 204 sempre." },

  // Sessões protegidas.
  { method: "POST", path: "/auth/logout-all", authentication: "bearer", success: empty(204), headers: CORRELATION, documented: true, withoutCredential: 401, summary: "Revoga todas as sessões do usuário autenticado." },
  { method: "GET", path: "/auth/me", authentication: "bearer", success: json(200, "CurrentUser"), headers: CORRELATION, documented: true, withoutCredential: 401, summary: "Relê usuário, sessão e permissões no banco." },

  // Administração.
  { method: "POST", path: "/auth/admin/invites", authentication: "bearer-super-admin", success: json(201, "CreatedInvite"), headers: CORRELATION, documented: true, withoutCredential: 401, summary: "Cria convite com papéis e permissões diretas." },

  // Proxy Auth -> API.
  { method: "ALL", path: "/api/*", authentication: "bearer", success: { status: 200, body: { kind: "passthrough" } }, headers: CORRELATION, documented: false, withoutCredential: 401, summary: "Autoriza por recurso/ação e repassa para a API com a identidade validada." },
  { method: "ALL", path: "/api/transcription-worker/*", authentication: "device-key", success: { status: 200, body: { kind: "passthrough" } }, headers: CORRELATION, documented: false, withoutCredential: 401, summary: "Porta exclusiva da chave de dispositivo; repassa dono e permissão de transcrição." },
]);

/** As operações que aparecem no documento OpenAPI do Auth. */
export const documentedOperations = (): readonly AuthOperation[] =>
  AUTH_HTTP_OPERATIONS.filter((operation) => operation.documented);
