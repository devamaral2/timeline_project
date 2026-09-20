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
  "401": noContent("Credenciais, token de acesso ou token de convite inválido, expirado ou revogado."),
  "429": noContent("Limite de tentativas excedido. Consulte o cabeçalho `Retry-After` antes de tentar novamente."),
  "500": json({ $ref: "#/components/schemas/InternalError" }, "Falha inesperada. Informe o `correlationId` ao suporte."),
} as const;
const protectedErrors = {
  ...errorResponses,
  "403": noContent("O token é válido, mas não autoriza esta operação."),
} as const;

const string = (description: string, maxLength?: number): OpenApiSchema => ({ type: "string", description, ...(maxLength === undefined ? {} : { maxLength }) });
const token = (description: string): OpenApiSchema => ({ ...string(description, 1024), format: "password", writeOnly: true });
const dateTime = (description: string): OpenApiSchema => ({ type: "string", format: "date-time", description });
const directPermissionsSchema = { type: "array", maxItems: 64, description: "Concessões ou negações diretas, sem duplicar uma permissão.", items: { type: "object", required: ["permission", "effect"], additionalProperties: false, properties: { permission: { type: "string", pattern: "^(?:\\*:manage|(?:event|tag|user|invite|role|grant):(?:create|read|update|delete|manage))$", description: "Permissão concreta no formato `recurso:ação` ou o superadmin `*:manage`." }, effect: { type: "string", enum: ["allow", "deny"] } } } } as const;

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
  "/auth/invites/inspect": {
    post: { summary: "Inspeciona um convite", description: "Valida um token de convite antes do cadastro e devolve apenas os dados seguros para exibição: nome, email mascarado e expiração.", tags: ["Convites públicos"], requestBody: request("InspectInviteRequest"), responses: { "201": json({ $ref: "#/components/schemas/InviteInspection" }), ...errorResponses } },
  },
  "/auth/invites/accept": {
    post: { summary: "Aceita o convite com senha", description: "Define a senha e ativa o convidado em uma transação, sem emitir sessão. Depois é necessário fazer login.", tags: ["Convites públicos"], requestBody: request("AcceptInviteRequest"), responses: { "201": json({ $ref: "#/components/schemas/InviteAccepted" }), "422": json({ $ref: "#/components/schemas/ErrorCode" }, "Senha não atende à política de segurança."), ...errorResponses } },
  },
  "/auth/login": {
    post: { summary: "Faz login com email e senha", description: "Confere email e senha e emite diretamente uma sessão. Credenciais incorretas não revelam se o email existe.", tags: ["Autenticação pública"], requestBody: request("LoginRequest"), responses: { "201": json({ $ref: "#/components/schemas/SessionTokens" }), ...errorResponses } },
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
  "/auth/admin/invites": {
    post: { summary: "Cria um convite", description: "Cria um usuário pendente, define seus papéis e permissões diretas e devolve o link de convite. Exige token de um superadministrador.", tags: ["Administração"], security: bearer, requestBody: request("CreateInviteRequest"), responses: { "201": json({ $ref: "#/components/schemas/CreatedInvite" }), "409": json({ $ref: "#/components/schemas/ErrorCode" }, "Já existe uma conta para o email informado."), ...protectedErrors } },
  },
  "/auth/admin/users": {
    get: { summary: "Lista usuários", description: "Lista resumos seguros de usuários com paginação por cursor. Senhas, telefones, tokens, convites e códigos de recuperação nunca são retornados.", tags: ["Administração"], security: bearer, parameters: [{ name: "cursor", in: "query", required: false, schema: { type: "string", maxLength: 64 }, description: "Cursor retornado pela página anterior." }, { name: "limit", in: "query", required: false, schema: { type: "integer", minimum: 1, maximum: 100, default: 25 }, description: "Quantidade de resultados, de 1 a 100." }], responses: { "200": json({ $ref: "#/components/schemas/UserPage" }), ...protectedErrors } },
  },
  "/auth/admin/users/{userId}/status": {
    patch: adminUserOperation("Atualiza status do usuário", "Altera o status para `active`, `suspended` ou `disabled`. Não existe transição para `pending_invite`: o aceite do convite é quem ativa a conta.", "ChangeUserStatusRequest", "UserStatus"),
  },
  "/auth/admin/users/{userId}/access": {
    put: adminUserOperation("Substitui o acesso do usuário", "Substitui integralmente os papéis e as permissões diretas do usuário. Use `deny` para negar explicitamente uma permissão concedida por um papel.", "ReplaceUserAccessRequest", "UserAccess"),
  },
  "/auth/admin/users/{userId}/invite/reissue": {
    post: adminUserOperation("Reemite um convite", "Invalida o convite pendente anterior e devolve um novo link de convite para o usuário indicado.", undefined, "CreatedInvite", "200"),
  },
  "/auth/admin/users/{userId}/invite": {
    delete: adminUserOperation("Revoga convite", "Revoga o convite pendente do usuário indicado. A conta não poderá concluir o cadastro com o link revogado.", undefined, undefined, "204"),
  },
  "/auth/admin/users/{userId}/revoke-sessions": {
    post: adminUserOperation("Revoga sessões de um usuário", "Encerra todas as sessões ativas do usuário indicado, sem alterar seus papéis ou status.", undefined, undefined, "204"),
  },
};

function request(schema: string, description = "Dados da operação.") {
  return { required: true, description, content: { "application/json": { schema: { $ref: `#/components/schemas/${schema}` } } } };
}

function adminUserOperation(summary: string, description: string, requestSchema?: string, responseSchema?: string, status = "200"): OpenApiOperation {
  return {
    summary, description, tags: ["Administração"], security: bearer,
    parameters: [{ name: "userId", in: "path", required: true, schema: { type: "string", minLength: 1, maxLength: 64 }, description: "Identificador do usuário alvo." }],
    ...(requestSchema === undefined ? {} : { requestBody: request(requestSchema) }),
    responses: { [status]: status === "204" ? noContent("Operação concluída.") : json({ $ref: `#/components/schemas/${responseSchema}` }), ...protectedErrors },
  };
}

export const authOpenApiDocument = {
  openapi: "3.1.1",
  info: {
    title: "Braid Auth API",
    version: "1.0.0",
    description: "API de identidade do Braid: convites, login por senha, sessões e administração de acessos.\n\nRotas protegidas usam `Authorization: Bearer <accessToken>`. Todas as respostas carregam `X-Correlation-Id`; use-o para rastrear falhas. Campos de segredo são apenas de escrita e nunca voltam nas respostas.",
  },
  tags: [
    { name: "Infraestrutura", description: "Sondas de saúde e descoberta de chaves públicas." },
    { name: "Convites públicos", description: "Fluxo de cadastro iniciado por um convite." },
    { name: "Autenticação pública", description: "Login por email e senha sem sessão existente." },
    { name: "Sessões", description: "Ciclo de vida e consulta da sessão autenticada." },
    { name: "Administração", description: "Gestão de usuários e acessos, exclusiva de superadministradores." },
  ],
  paths: operations,
  components: {
    securitySchemes: { bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT", description: "Access token assinado pelo serviço Auth." } },
    schemas: {
      ErrorCode: { type: "object", required: ["code"], properties: { code: string("Código seguro e estável do erro.") } },
      InternalError: { type: "object", required: ["code", "correlationId"], properties: { code: { type: "string", enum: ["internal_error"] }, correlationId: string("Identificador para rastrear a falha.") } },
      Health: { type: "object", required: ["status"], properties: { status: { type: "string", enum: ["ok"] } } },
      Jwks: { type: "object", required: ["keys"], properties: { keys: { type: "array", items: { type: "object", additionalProperties: true } } } },
      InspectInviteRequest: object({ token: token("Token secreto presente no link de convite.") }),
      AcceptInviteRequest: object({ token: token("Token secreto presente no link de convite."), password: token("Senha inicial, validada pela política de segurança.") }),
      LoginRequest: object({ email: { ...string("Email da conta.", 320), format: "email" }, password: token("Senha da conta.") }),
      RefreshTokenRequest: object({ refreshToken: token("Refresh token da sessão que será renovada ou revogada.") }),
      CreateInviteRequest: object({ email: { ...string("Email do convidado.", 320), format: "email" }, name: string("Nome do convidado.", 120), roleKeys: { type: "array", maxItems: 16, uniqueItems: true, items: { type: "string", enum: ["admin", "member", "viewer"] }, description: "Papéis iniciais do usuário." }, directPermissions: directPermissionsSchema }),
      ReplaceUserAccessRequest: object({ roleKeys: { type: "array", maxItems: 16, uniqueItems: true, items: { type: "string", enum: ["admin", "member", "viewer"] } }, directPermissions: directPermissionsSchema }),
      ChangeUserStatusRequest: object({ status: { type: "string", enum: ["active", "suspended", "disabled"] } }),
      InviteAccepted: object({accepted:{type:"boolean",enum:[true]}}),
      InviteInspection: object({ name: string("Nome do convidado."), email: string("Email mascarado."), expiresAt: dateTime("Momento de expiração do convite.") }),
      SessionTokens: object({ accessToken: string("JWT para autenticar rotas protegidas."), refreshToken: string("Token opaco para renovar a sessão."), accessTokenExpiresInSeconds: { type: "integer", description: "Vida útil do access token em segundos." }, refreshTokenExpiresAt: dateTime("Expiração do refresh token.") }, ["accessToken", "refreshToken"]),
      RefreshTokens: object({ accessToken: string("Novo JWT de acesso."), refreshToken: string("Novo refresh token; substitui o anterior.") }),
      CurrentUser: object({ userId: string("ID do usuário."), email: string("Email da conta."), name: string("Nome da conta."), sessionId: string("ID da sessão atual."), roles: { type: "array", items: { type: "string" } }, permissions: { type: "array", items: { type: "string" } }, denies: { type: "array", items: { type: "string" } } }),
      CreatedInvite: object({ userId: string("ID do usuário convidado."), inviteLink: { ...string("Link com token secreto de convite."), format: "uri" }, expiresAt: dateTime("Expiração do convite.") }),
      UserStatus: object({ userId: string("ID do usuário."), status: { type: "string", enum: ["active", "suspended", "disabled"] } }),
      UserAccess: object({ userId: string("ID do usuário."), roleKeys: { type: "array", items: { type: "string" } }, directPermissions: directPermissionsSchema }),
      UserPage: object({ users: { type: "array", items: { $ref: "#/components/schemas/AdminUserSummary" }, description: "Resumos seguros de usuários." }, nextCursor: { type: ["string", "null"], description: "Cursor para a próxima página; `null` quando não há mais resultados." } }),
      AdminUserSummary: object({ id: string("ID do usuário."), email: string("Email da conta."), name: string("Nome da conta."), status: { type: "string", enum: ["pending_invite", "active", "suspended", "disabled"] }, roleKeys: { type: "array", items: { type: "string" } }, directPermissions: directPermissionsSchema, createdAt: dateTime("Criação da conta."), updatedAt: dateTime("Última atualização da conta.") }),
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
