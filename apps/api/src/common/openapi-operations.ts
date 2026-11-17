import {
  agendaPageSchema,
  artifactSchema,
  createArtifactRequestSchema,
  createArtifactResponseSchema,
  createTaskInputSchema,
  createRecurrenceInputSchema,
  taskCardSchema,
  taskSchema,
  recurrenceSchema,
  requestSchema,
  placeSuggestionSchema,
  tagSuggestionSchema,
  updateArtifactRequestSchema,
  updateTaskInputSchema,
  updateRecurrenceInputSchema,
} from "@repo/contracts/schemas";
import { z } from "zod";
import { ACTORS, ARTIFACT_TYPES, TASK_KINDS, TASK_STATUSES, PRIORITIES } from "../domain";
import { editRequestBody } from "../features/request-agent-file-edit/request-agent-file-edit.controller";
import { restoreBody } from "../features/restore-agent-file/restore-agent-file.controller";
import { startEditRequestBody } from "../features/start-edit-request/start-edit-request.controller";
import { startHermesRequestBody } from "../features/start-hermes-request/start-hermes-request.controller";
import { startRequestBody } from "../features/start-request/start-request.controller";
import { startVoiceRequestBody } from "../features/start-voice-request/start-voice-request.controller";

/**
 * O que o Swagger nao consegue ler dos controllers: eles recebem o corpo como
 * tipo TypeScript e validam com zod, entao nada disso chega ao documento
 * gerado. Este catalogo diz, rota por rota, o grupo, o resumo, os filtros, o
 * corpo e a resposta. Os formatos saem dos mesmos esquemas zod dos contratos.
 */

const agentFileSchema = z.object({
  path: z.string(), kind: z.enum(["skill", "agent"]), hash: z.string(), missing: z.boolean(),
  tags: z.array(z.string()), description: z.string(),
});

/** Os formatos nomeados do documento (`components.schemas`). */
export const documentedSchemas = {
  TaskCard: taskCardSchema,
  AgendaPage: agendaPageSchema,
  Task: taskSchema,
  CreateTaskInput: createTaskInputSchema,
  UpdateTaskInput: updateTaskInputSchema.omit({ taskId: true }),
  CreatedTask: z.object({ taskId: z.string() }),
  TagSuggestion: tagSuggestionSchema,
  PlaceSuggestion: placeSuggestionSchema,
  Artifact: artifactSchema,
  CreateArtifactRequest: createArtifactRequestSchema,
  CreatedArtifact: createArtifactResponseSchema,
  UpdateArtifactRequest: updateArtifactRequestSchema,
  Recurrence: recurrenceSchema,
  CreateRecurrenceInput: createRecurrenceInputSchema,
  UpdateRecurrenceInput: updateRecurrenceInputSchema.omit({ recurrenceId: true }),
  CreatedRecurrence: z.object({ recurrenceId: z.string() }),
  Request: requestSchema,
  StartRequestInput: startRequestBody,
  StartEditRequestInput: startEditRequestBody,
  StartHermesRequestInput: startHermesRequestBody,
  StartVoiceRequestInput: startVoiceRequestBody,
  StartedRequest: z.object({ requestId: z.string() }),
  AgentFileList: z.object({ files: z.array(agentFileSchema) }),
  AgentFileText: z.object({ path: z.string(), text: z.string() }),
  AgentFileBackupList: z.object({
    backups: z.array(z.object({ id: z.string(), path: z.string(), createdAt: z.iso.datetime(), sizeBytes: z.number().int() })),
  }),
  AgentFileEditRequest: editRequestBody,
  RestoreAgentFileRequest: restoreBody,
  Error: z.object({ error: z.string() }),
} as const;

export type SchemaName = keyof typeof documentedSchemas;

export const documentedTags = [
  { name: "Tarefas", description: "A agenda, a lista de tarefas e cada tarefa de pessoa." },
  { name: "Tags", description: "Sugestão de tags já usadas." },
  { name: "Locais", description: "Busca de locais para o campo de local da tarefa." },
  { name: "Artefatos", description: "O conteúdo que as tarefas criam e usam: texto, alimento, sono e treino." },
  { name: "Séries", description: "Regras de repetição e o que cada ocorrência copia." },
  { name: "Pedidos ao agente", description: "Abrir, acompanhar e cancelar pedidos em texto ou fala." },
  { name: "Configuração do agente", description: "Skills e agentes do Hermes como arquivos (ADR 0005). Só o dono acessa." },
] as const;

type TagName = (typeof documentedTags)[number]["name"];

export interface QueryDoc {
  description: string;
  type?: "string" | "integer" | "number" | "boolean";
  format?: "date-time";
  enum?: readonly string[];
  minimum?: number;
  maximum?: number;
  default?: number;
  required?: boolean;
}

export interface OperationDoc {
  tag: TagName;
  summary: string;
  description?: string;
  query?: Record<string, QueryDoc>;
  body?: SchemaName;
  success: { status: 200 | 201 | 202 | 204; description: string; schema?: SchemaName; list?: boolean };
  /** Alem de 401 e 403, que toda rota pode responder. */
  errors?: Partial<Record<400 | 404 | 409 | 422 | 502, string>>;
  /** Aceita o header `Idempotency-Key`. */
  idempotent?: boolean;
}

const instant = (description: string): QueryDoc => ({ description, type: "string", format: "date-time" });
const limit = (max: number, fallback?: number): QueryDoc => ({
  description: "Quantos itens no máximo.",
  type: "integer", minimum: 1, maximum: max, ...(fallback === undefined ? {} : { default: fallback }),
});
const tag: QueryDoc = { description: "Só os que têm esta tag." };
const search: QueryDoc = { description: "Texto a procurar no nome e na descrição." };

const invalid = "Entrada inválida; `error` diz o campo.";
const stale = "`expectedRevision` não é mais a revisão atual: alguém editou antes.";
const idempotencyClash = "Outra requisição com a mesma `Idempotency-Key` ainda está em andamento.";
const idempotencyReuse = "A `Idempotency-Key` já foi usada com um corpo diferente.";
const hermesOff = "O Hermes está desligado neste servidor (`AI_AUTOMATION`).";
const ownerOnly = "Só o dono acessa (`AGENT_CONFIG_OWNER_USER_ID`); os demais recebem 403.";

/** Uma entrada por rota, na forma `METODO /caminho` do documento OpenAPI. */
export const documentedOperations: Record<string, OperationDoc> = {
  "GET /api/tasks": {
    tag: "Tarefas",
    summary: "Lista a agenda, em páginas",
    description: "As tarefas de uma janela de tempo. Passe o `nextCursor` da resposta em `cursor` para a página seguinte.",
    query: {
      from: instant("Início da janela."),
      to: instant("Fim da janela."),
      actor: { description: "De quem é a tarefa.", enum: ACTORS },
      kind: { description: "Só tarefas deste tipo.", enum: TASK_KINDS.filter((kind) => kind !== "step") },
      tag,
      cursor: { description: "O `nextCursor` da página anterior." },
      limit: limit(100, 50),
    },
    success: { status: 200, description: "Uma página da agenda.", schema: "AgendaPage" },
    errors: { 400: invalid },
  },
  "GET /api/tasks/tracked": {
    tag: "Tarefas",
    summary: "Lista as tarefas",
    description: "As tarefas acompanhadas por status, com ou sem data. `status` e `priority` aceitam vários valores separados por vírgula.",
    query: {
      actor: { description: "De quem é a tarefa.", enum: ACTORS },
      status: { description: `Um ou mais status, separados por vírgula: ${TASK_STATUSES.join(", ")}.` },
      priority: { description: `Uma ou mais prioridades, separadas por vírgula: ${PRIORITIES.join(", ")}.` },
      tag,
      q: search,
      from: instant("Só tarefas a partir deste instante."),
      to: instant("Só tarefas até este instante."),
      longRunning: { description: "`true` para só as tarefas longas, `false` para só os demais.", type: "boolean" },
      limit: limit(100),
    },
    success: { status: 200, description: "As tarefas que passam nos filtros.", schema: "TaskCard", list: true },
    errors: { 400: invalid },
  },
  "POST /api/tasks": {
    tag: "Tarefas",
    summary: "Cria uma tarefa",
    description: "Cria uma tarefa de pessoa, com os artefatos novos ou já existentes que ela carrega.",
    body: "CreateTaskInput",
    success: { status: 201, description: "A tarefa foi criada.", schema: "CreatedTask" },
    errors: { 400: invalid, 409: idempotencyClash, 422: idempotencyReuse },
    idempotent: true,
  },
  "GET /api/tasks/{taskId}": {
    tag: "Tarefas",
    summary: "Lê uma tarefa",
    success: { status: 200, description: "A tarefa, com os artefatos e as relações.", schema: "Task" },
    errors: { 404: "Tarefa não encontrada." },
  },
  "PATCH /api/tasks/{taskId}": {
    tag: "Tarefas",
    summary: "Edita uma tarefa",
    description: "Envie só os campos que mudam, mais o `expectedRevision` lida da tarefa. `null` em `status` ou numa data apaga o valor.",
    body: "UpdateTaskInput",
    success: { status: 204, description: "A tarefa foi editada." },
    errors: { 400: invalid, 404: "Tarefa não encontrada.", 409: stale },
  },
  "DELETE /api/tasks/{taskId}": {
    tag: "Tarefas",
    summary: "Apaga uma tarefa",
    success: { status: 204, description: "A tarefa foi apagada." },
    errors: { 404: "Tarefa não encontrada." },
  },

  "GET /api/tags": {
    tag: "Tags",
    summary: "Sugere tags por prefixo",
    query: {
      query: { description: "O começo do nome da tag." },
      limit: { description: "Quantas sugestões no máximo.", type: "integer", minimum: 1, default: 10 },
    },
    success: { status: 200, description: "As tags que começam com o texto.", schema: "TagSuggestion", list: true },
  },

  "GET /api/places": {
    tag: "Locais",
    summary: "Busca locais por texto",
    description: "Procura endereços e lugares (OpenStreetMap) só pelo texto: a posição da pessoa não é enviada. Com menos de 3 letras ou com o serviço de mapas fora do ar, devolve lista vazia.",
    query: {
      query: { description: "O que o usuário digitou: nome do lugar ou endereço." },
      limit: limit(10, 6),
    },
    success: { status: 200, description: "Os locais encontrados.", schema: "PlaceSuggestion", list: true },
  },

  "GET /api/artifacts": {
    tag: "Artefatos",
    summary: "Lista artefatos",
    description: "Os artefatos do usuário. Com `scope=global`, os globais do `type` informado, que vale para todos.",
    query: {
      type: { description: "Só artefatos deste tipo.", enum: ARTIFACT_TYPES },
      scope: { description: "`global` lista os artefatos globais; exige `type`.", enum: ["global"] },
      tag,
      q: search,
      taskId: { description: "Só os artefatos que aparecem nesta tarefa." },
      limit: limit(100),
    },
    success: { status: 200, description: "Os artefatos que passam nos filtros.", schema: "Artifact", list: true },
    errors: { 400: invalid },
  },
  "POST /api/artifacts": {
    tag: "Artefatos",
    summary: "Cria um artefato",
    description: "Sem `type`, é texto livre. Em `food`, `data.inputText` é o que foi comido e os nutrientes são calculados depois.",
    body: "CreateArtifactRequest",
    success: { status: 201, description: "O artefato foi criado.", schema: "CreatedArtifact" },
    errors: { 400: invalid, 409: idempotencyClash, 422: idempotencyReuse },
    idempotent: true,
  },
  "GET /api/artifacts/{artifactId}": {
    tag: "Artefatos",
    summary: "Lê um artefato",
    success: { status: 200, description: "O artefato, com as tarefas em que aparece.", schema: "Artifact" },
    errors: { 404: "Artefato não encontrado." },
  },
  "PATCH /api/artifacts/{artifactId}": {
    tag: "Artefatos",
    summary: "Edita um artefato",
    description: "Envie `expectedRevision` e o que muda. `data` só vem junto com `type` e substitui o conteúdo inteiro.",
    body: "UpdateArtifactRequest",
    success: { status: 204, description: "O artefato foi editado." },
    errors: { 400: invalid, 404: "Artefato não encontrado.", 409: stale },
  },
  "DELETE /api/artifacts/{artifactId}": {
    tag: "Artefatos",
    summary: "Apaga um artefato",
    success: { status: 204, description: "O artefato foi apagado." },
    errors: { 404: "Artefato não encontrado." },
  },

  "GET /api/recurrences": {
    tag: "Séries",
    summary: "Lista as séries",
    success: { status: 200, description: "As séries do usuário.", schema: "Recurrence", list: true },
  },
  "POST /api/recurrences": {
    tag: "Séries",
    summary: "Cria uma série",
    description: "A regra diz quando cada ocorrência acontece; `template` é a tarefa que cada uma copia, sem a janela.",
    body: "CreateRecurrenceInput",
    success: { status: 201, description: "A série foi criada.", schema: "CreatedRecurrence" },
    errors: { 400: invalid, 409: idempotencyClash, 422: idempotencyReuse },
    idempotent: true,
  },
  "GET /api/recurrences/{recurrenceId}": {
    tag: "Séries",
    summary: "Lê uma série",
    success: { status: 200, description: "A série, com o template como foi guardado.", schema: "Recurrence" },
    errors: { 404: "Série não encontrada." },
  },
  "PATCH /api/recurrences/{recurrenceId}": {
    tag: "Séries",
    summary: "Edita uma série",
    description: "Envie `expectedRevision` e os campos da regra que mudam. `template`, se vier, substitui o template inteiro.",
    body: "UpdateRecurrenceInput",
    success: { status: 204, description: "A série foi editada." },
    errors: { 400: invalid, 404: "Série não encontrada.", 409: stale },
  },
  "DELETE /api/recurrences/{recurrenceId}": {
    tag: "Séries",
    summary: "Apaga uma série",
    success: { status: 204, description: "A série foi apagada." },
    errors: { 404: "Série não encontrada." },
  },

  "POST /api/requests": {
    tag: "Pedidos ao agente",
    summary: "Abre um pedido em texto",
    description: "O agente desdobra o pedido em passos que criam ou alteram tarefas e artefatos. A resposta chega antes de o trabalho terminar: acompanhe em `GET /api/requests/{requestId}`.",
    body: "StartRequestInput",
    success: { status: 202, description: "O pedido foi aceito.", schema: "StartedRequest" },
    errors: { 400: invalid, 404: "`sessionId` não é um pedido deste usuário." },
  },
  "POST /api/requests/edit": {
    tag: "Pedidos ao agente",
    summary: "Pede a edição da entidade aberta",
    description: "O pedido vale só para a entidade informada (ADR 0006). O servidor confere o `entityType` contra a entidade real.",
    body: "StartEditRequestInput",
    success: { status: 202, description: "O pedido foi aceito.", schema: "StartedRequest" },
    errors: { 400: invalid },
  },
  "POST /api/requests/hermes": {
    tag: "Pedidos ao agente",
    summary: "Manda uma mensagem ao Hermes",
    description: "Reenviar o mesmo `clientMessageId` devolve o pedido já aceito, sem uma segunda mensagem. `sessionId` continua a conversa de um pedido anterior.",
    body: "StartHermesRequestInput",
    success: { status: 202, description: "O pedido foi aceito.", schema: "Request" },
    errors: { 400: invalid, 404: `${hermesOff} Ou \`sessionId\` não é um pedido deste usuário.` },
  },
  "POST /api/requests/voice": {
    tag: "Pedidos ao agente",
    summary: "Transforma uma fala em tarefa",
    description: "A tarefa criada aparece em `entities` de `GET /api/requests/{requestId}`.",
    body: "StartVoiceRequestInput",
    success: { status: 202, description: "O pedido foi aceito.", schema: "StartedRequest" },
    errors: { 400: invalid },
  },
  "GET /api/requests": {
    tag: "Pedidos ao agente",
    summary: "Lista os pedidos do usuário",
    query: { limit: limit(50, 20) },
    success: { status: 200, description: "Os pedidos, do mais novo para o mais antigo.", schema: "Request", list: true },
    errors: { 400: invalid },
  },
  "GET /api/requests/{requestId}": {
    tag: "Pedidos ao agente",
    summary: "Acompanha um pedido",
    description: "Os passos com o estado de cada um, o que o pedido criou ou alterou e, no fim, a resposta.",
    success: { status: 200, description: "O pedido como está agora.", schema: "Request" },
    errors: { 404: "Pedido não encontrado." },
  },
  "POST /api/requests/{requestId}/cancel": {
    tag: "Pedidos ao agente",
    summary: "Cancela um pedido",
    success: { status: 200, description: "O pedido, já cancelado ou no estado final em que estava.", schema: "Request" },
    errors: { 404: "Pedido não encontrado.", 409: "O pedido calcula um alimento: apague o artefato para interrompê-lo." },
  },

  "GET /api/ai/config": {
    tag: "Configuração do agente",
    summary: "Lista as skills e os agentes",
    description: ownerOnly,
    success: { status: 200, description: "Os arquivos da pasta do Hermes, sem o texto.", schema: "AgentFileList" },
  },
  "GET /api/ai/config/file": {
    tag: "Configuração do agente",
    summary: "Lê o texto de um arquivo",
    description: `O texto como está agora, ou o último conhecido se o arquivo sumiu. ${ownerOnly}`,
    query: { path: { description: "Caminho do arquivo dentro da pasta, como veio na listagem.", required: true } },
    success: { status: 200, description: "O texto do arquivo.", schema: "AgentFileText" },
    errors: { 400: invalid, 404: "Arquivo não encontrado." },
  },
  "GET /api/ai/config/backups": {
    tag: "Configuração do agente",
    summary: "Lista os backups de um arquivo",
    description: `Cada mudança guarda o texto anterior, até 50 por arquivo. ${ownerOnly}`,
    query: { path: { description: "Caminho do arquivo dentro da pasta, como veio na listagem.", required: true } },
    success: { status: 200, description: "Os backups, do mais novo para o mais antigo.", schema: "AgentFileBackupList" },
    errors: { 400: invalid, 404: "Arquivo não encontrado." },
  },
  "POST /api/ai/config/restore": {
    tag: "Configuração do agente",
    summary: "Restaura um backup",
    description: `O texto substituído também vira backup, então a restauração se desfaz. ${ownerOnly}`,
    body: "RestoreAgentFileRequest",
    success: { status: 201, description: "O arquivo foi restaurado; a resposta é a listagem atualizada.", schema: "AgentFileList" },
    errors: { 400: invalid, 404: "Arquivo ou backup não encontrado." },
  },
  "POST /api/ai/config/edit-request": {
    tag: "Configuração do agente",
    summary: "Pede ao Hermes uma edição num arquivo",
    description: `O Hermes avalia o impacto antes de editar. Acompanhe em \`GET /api/requests/{requestId}\`. ${ownerOnly}`,
    body: "AgentFileEditRequest",
    success: { status: 202, description: "O pedido foi aceito.", schema: "Request" },
    errors: { 400: invalid, 404: hermesOff },
  },
};
