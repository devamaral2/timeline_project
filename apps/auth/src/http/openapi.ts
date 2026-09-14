import type { INestApplication } from "@nestjs/common";
import { apiReference } from "@scalar/nestjs-api-reference";
import type { Request, Response } from "express";

type OpenApiSchema = Record<string, unknown>;
type OpenApiOperation = {
  summary: string;
  description: string;
  tags: string[];
  security?: Array<Record<string, string[]>>;
  parameters?: unknown[];
  requestBody?: unknown;
  responses: Record<string, unknown>;
};

const json = (schema: OpenApiSchema, description = "Resposta JSON.") => ({
  description,
  content: { "application/json": { schema } },
});
const noContent = (description: string) => ({ description });
const bearer = [{ bearerAuth: [] }];
const errorResponses = {
  "400": json({ $ref: "#/components/schemas/ErrorCode" }, "Requisição inválida: JSON malformado, campo desconhecido ou formato incompatível."),
  "401": noContent("Credenciais ou token inválido, expirado ou revogado."),
  "429": noContent("Limite de tentativas excedido. Consulte o cabeçalho `Retry-After` antes de tentar novamente."),
  "500": json({ $ref: "#/components/schemas/InternalError" }, "Falha inesperada. Informe o `correlationId` ao suporte."),
} as const;
const protectedErrors = {
  ...errorResponses,
  "403": noContent("O token é válido, mas não autoriza esta operação — inclusive quando é de um tipo que a rota não aceita."),
} as const;

const string = (description: string, maxLength?: number): OpenApiSchema => ({ type: "string", description, ...(maxLength === undefined ? {} : { maxLength }) });
const token = (description: string): OpenApiSchema => ({ ...string(description, 1024), format: "password", writeOnly: true });
const dateTime = (description: string): OpenApiSchema => ({ type: "string", format: "date-time", description });

const operations: Record<string, Record<string, OpenApiOperation>> = {
  "/health/live": {
    get: { summary: "Verifica se o processo está vivo", description: "Sonda de liveness. Não consulta o banco de dados e pode ser usada pelo orquestrador para saber se o processo responde.", tags: ["Infraestrutura"], responses: { "200": json({ $ref: "#/components/schemas/Health" }) } },
  },
  "/health/ready": {
    get: { summary: "Verifica se o serviço está pronto", description: "Sonda de readiness. Confirma que o banco está acessível e na versão de schema esperada antes de receber tráfego.", tags: ["Infraestrutura"], responses: { "200": json({ $ref: "#/components/schemas/Health" }), "503": json({ $ref: "#/components/schemas/ErrorCode" }, "Banco ou migração necessária indisponível.") } },
  },
  "/.well-known/jwks.json": {
    get: { summary: "Publica as chaves públicas JWT", description: "JWKS usado por serviços consumidores para validar tokens de acesso emitidos pelo Auth. A resposta pode retornar `304` quando o `ETag` enviado em `If-None-Match` ainda for atual.", tags: ["Infraestrutura"], parameters: [{ name: "If-None-Match", in: "header", required: false, schema: { type: "string" }, description: "ETag da versão JWKS já armazenada." }], responses: { "200": json({ $ref: "#/components/schemas/Jwks" }, "Conjunto atual de chaves públicas."), "304": noContent("O conjunto não mudou desde o ETag informado.") } },
  },
  "/auth/login": {
    post: { summary: "Faz login por senha", description: "Confere email e senha e devolve o par de tokens da nova sessão em uma única ida. Email inexistente, senha errada e conta que ainda não pode entrar respondem o mesmo `401`, no mesmo tempo.", tags: ["Autenticação pública"], requestBody: request("LoginRequest"), responses: { "200": json({ $ref: "#/components/schemas/SessionTokens" }, "Sessão emitida."), ...errorResponses } },
  },
  "/auth/token/refresh": {
    post: { summary: "Renova tokens de sessão", description: "Troca um refresh token válido por um novo par de tokens. O refresh token enviado é consumido; reutilizá-lo é tratado como tentativa inválida.", tags: ["Sessões"], requestBody: request("RefreshTokenRequest"), responses: { "200": json({ $ref: "#/components/schemas/RefreshTokens" }), ...errorResponses } },
  },
  "/auth/logout": {
    post: { summary: "Encerra uma sessão", description: "Revoga a sessão associada ao refresh token informado. É seguro descartar localmente os tokens depois da resposta.", tags: ["Sessões"], requestBody: request("RefreshTokenRequest"), responses: { "204": noContent("Sessão revogada."), ...errorResponses } },
  },
  "/auth/logout-all": {
    post: { summary: "Encerra todas as sessões", description: "Revoga todas as sessões ativas do usuário autenticado, incluindo outros dispositivos.", tags: ["Sessões"], security: bearer, responses: { "204": noContent("Todas as sessões foram revogadas."), ...protectedErrors } },
  },
  "/auth/me": {
    get: { summary: "Consulta a sessão atual", description: "Relê usuário, sessão e permissões efetivas no banco. Isso garante que uma sessão revogada ou uma conta desativada não seja considerada válida apenas pelo JWT.", tags: ["Sessões"], security: bearer, responses: { "200": json({ $ref: "#/components/schemas/CurrentUser" }), ...protectedErrors } },
  },
};

function request(schema: string, description = "Dados da operação.") {
  return { required: true, description, content: { "application/json": { schema: { $ref: `#/components/schemas/${schema}` } } } };
}


export const authOpenApiDocument = {
  openapi: "3.1.1",
  info: {
    title: "Braid Auth API",
    version: "1.0.0",
    description: "API de identidade do Braid: login por senha e sessões.\n\nRotas protegidas usam `Authorization: Bearer <accessToken>`. Todas as respostas carregam `X-Correlation-Id`; use-o para rastrear falhas. Campos de segredo são apenas de escrita e nunca voltam nas respostas.",
  },
  tags: [
    { name: "Infraestrutura", description: "Sondas de saúde e descoberta de chaves públicas." },
    { name: "Autenticação pública", description: "Login por email e senha, sem sessão existente." },
    { name: "Sessões", description: "Ciclo de vida e consulta da sessão autenticada." },
  ],
  paths: operations,
  components: {
    securitySchemes: { bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT", description: "Access token assinado pelo serviço Auth." } },
    schemas: {
      ErrorCode: { type: "object", required: ["code"], properties: { code: string("Código seguro e estável do erro.") } },
      InternalError: { type: "object", required: ["code", "correlationId"], properties: { code: { type: "string", enum: ["internal_error"] }, correlationId: string("Identificador para rastrear a falha.") } },
      Health: { type: "object", required: ["status"], properties: { status: { type: "string", enum: ["ok"] } } },
      Jwks: { type: "object", required: ["keys"], properties: { keys: { type: "array", items: { type: "object", additionalProperties: true } } } },
      LoginRequest: object({ email: { ...string("Email da conta.", 320), format: "email" }, password: token("Senha da conta.") }),
      RefreshTokenRequest: object({ refreshToken: token("Refresh token da sessão que será renovada ou revogada.") }),
      SessionTokens: object({ accessToken: string("JWT para autenticar rotas protegidas."), refreshToken: string("Token opaco para renovar a sessão."), accessTokenExpiresInSeconds: { type: "integer", description: "Vida útil do access token em segundos." }, refreshTokenExpiresAt: dateTime("Expiração do refresh token.") }),
      RefreshTokens: object({ accessToken: string("Novo JWT de acesso."), refreshToken: string("Novo refresh token; substitui o anterior.") }),
      CurrentUser: object({ userId: string("ID do usuário."), email: { type: ["string", "null"], description: "Email da conta." }, name: string("Nome da conta."), sessionId: string("ID da sessão atual."), roles: { type: "array", items: { type: "string" } }, permissions: { type: "array", items: { type: "string" } }, denies: { type: "array", items: { type: "string" } } }),
    },
  },
} as const;

function object(properties: Record<string, OpenApiSchema>, required = Object.keys(properties)): OpenApiSchema {
  return { type: "object", additionalProperties: false, required, properties };
}

/** Registra a referência interativa e o contrato OpenAPI consumível por ferramentas. */
export function configureApiDocumentation(app: INestApplication): void {
  const express = app.getHttpAdapter().getInstance() as {
    get(path: string, handler: (request: Request, response: Response) => void): void;
    use(path: string, handler: (request: Request, response: Response) => void): void;
  };
  express.get("/openapi.json", (_request, response) => response.json(authOpenApiDocument));
  express.use("/docs", apiReference({
    pageTitle: "Braid Auth API",
    theme: "purple",
    darkMode: false,
    spec: { content: authOpenApiDocument },
  }));
}
