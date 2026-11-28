import {
  agendaPageSchema,
  artifactSchema,
  createArtifactRequestSchema,
  createArtifactResponseSchema,
  createProjectInputSchema,
  createTaskInputSchema,
  createRecurrenceInputSchema,
  dailyReadingInputSchema,
  dailyReadingResultSchema,
  projectSchema,
  setTaskSituationInputSchema,
  transcriptionDeliveryInputSchema,
  transcriptionDeliveryResultSchema,
  transcriptionLeaseInputSchema,
  transcriptionLeaseResultSchema,
  transcriptionRequestInputSchema,
  transcriptionRequestResultSchema,
  transcriptionReservationSchema,
  taskCardSchema,
  taskSchema,
  recurrenceSchema,
  requestSchema,
  modelOptionsSchema,
  placeSuggestionSchema,
  tagSuggestionSchema,
  updateArtifactRequestSchema,
  updateTaskInputSchema,
  updateRecurrenceInputSchema,
} from "@repo/contracts/schemas";
import { z } from "zod";
import { ACTORS, AGENDA_KINDS, ARTIFACT_TYPES, TASK_STATUSES, PRIORITIES } from "../domain";
import { editRequestBody } from "../features/request-agent-file-edit/request-agent-file-edit.controller";
import { restoreBody } from "../features/restore-agent-file/restore-agent-file.controller";
import {
  startEditRequestBody,
  startHermesRequestBody,
  startModelRequestBody,
  startRequestBody,
  startVoiceRequestBody,
} from "../api-core/requests/request-input.schemas";

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
  SetTaskSituationInput: setTaskSituationInputSchema,
  CreatedTask: z.object({ taskId: z.string() }),
  DailyReadingInput: dailyReadingInputSchema,
  DailyReadingResult: dailyReadingResultSchema,
  TranscriptionRequestInput: transcriptionRequestInputSchema,
  TranscriptionRequestResult: transcriptionRequestResultSchema,
  TranscriptionReservation: transcriptionReservationSchema,
  TranscriptionLeaseInput: transcriptionLeaseInputSchema,
  TranscriptionLeaseResult: transcriptionLeaseResultSchema,
  TranscriptionDeliveryInput: transcriptionDeliveryInputSchema,
  TranscriptionDeliveryResult: transcriptionDeliveryResultSchema,
  TagSuggestion: tagSuggestionSchema,
  PlaceSuggestion: placeSuggestionSchema,
  Artifact: artifactSchema,
  CreateArtifactRequest: createArtifactRequestSchema,
  CreatedArtifact: createArtifactResponseSchema,
  UpdateArtifactRequest: updateArtifactRequestSchema,
  Project: projectSchema,
  CreateProjectInput: createProjectInputSchema,
  Recurrence: recurrenceSchema,
  CreateRecurrenceInput: createRecurrenceInputSchema,
  UpdateRecurrenceInput: updateRecurrenceInputSchema.omit({ recurrenceId: true }),
  CreatedRecurrence: z.object({ recurrenceId: z.string() }),
  Request: requestSchema,
  StartRequestInput: startRequestBody,
  StartEditRequestInput: startEditRequestBody,
  StartHermesRequestInput: startHermesRequestBody,
  StartModelRequestInput: startModelRequestBody,
  ModelOptions: modelOptionsSchema,
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
  { name: "Projetos", description: "Onde cada tarefa fica guardada. Toda tarefa tem um projeto; sem escolha, é o `diario`." },
  { name: "Séries", description: "Regras de repetição e o que cada ocorrência copia." },
  { name: "Pedidos ao agente", description: "Abrir, acompanhar e cancelar pedidos em texto ou fala." },
  {
    name: "Serviço local de transcrição",
    description: "As três operações do serviço que transcreve vídeos no computador do dono (spec #39). Só a chave de dispositivo com a permissão de transcrição as acessa; sessão comum recebe 403.",
  },
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
const modelOff = "O modo modelo está desligado neste servidor (sem `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` nem `OPENROUTER_API_KEY`).";
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
      kind: { description: "Só tarefas deste tipo.", enum: [...AGENDA_KINDS] },
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
    description: "Cria uma tarefa de pessoa, com os artefatos novos ou já existentes que ela carrega. `projectId` põe a tarefa num projeto do usuário; sem ele, ela fica em `diario`.",
    body: "CreateTaskInput",
    success: { status: 201, description: "A tarefa foi criada.", schema: "CreatedTask" },
    errors: { 400: invalid, 404: "Projeto não encontrado (não existe ou não é do usuário).", 409: idempotencyClash, 422: idempotencyReuse },
    idempotent: true,
  },
  "POST /api/tasks/daily-reading": {
    tag: "Tarefas",
    summary: "Guarda uma página lida na Leitura diária do dia",
    description:
      "Recebe uma página já em markdown e a guarda como artefato de texto na tarefa \"Leitura diária\" de hoje, criando a tarefa a fazer, às 18h do dia, quando ela ainda não existe. A mesma página guardada de novo no mesmo dia atualiza o artefato dela. Guardar uma página numa leitura que já existe a devolve para a fazer. Imagens e vídeos entram no markdown como endereços.",
    body: "DailyReadingInput",
    success: { status: 200, description: "A página está na leitura do dia.", schema: "DailyReadingResult" },
    errors: { 400: invalid },
  },
  "POST /api/tasks/transcription-requests": {
    tag: "Tarefas",
    summary: "Pede a transcrição de um vídeo do YouTube",
    description:
      "Recebe o endereço de um vídeo do YouTube (`watch?v=`, `youtu.be/`, `shorts/`, `embed/` ou `live/`) e, numa gravação só, cria a tarefa de agente `save_content_with_transcription` em `awaiting_transcription`, o documento \"Transcrição na fila\" na Leitura diária do dia e o job que o serviço local de transcrição reserva. A Leitura diária nasce a fazer, às 18h do dia, ou volta para a fazer. O mesmo vídeo no mesmo dia, com o pedido ainda esperando ou rodando, devolve o pedido que existe (`created: false`); com o pedido já concluído ou falho, nasce outro que atualiza o mesmo documento. Canal, playlist e busca são recusados.",
    body: "TranscriptionRequestInput",
    success: { status: 200, description: "O pedido está na fila de transcrição.", schema: "TranscriptionRequestResult" },
    errors: { 400: invalid },
  },
  "POST /api/transcription-worker/next": {
    tag: "Serviço local de transcrição",
    summary: "Reserva o próximo pedido de transcrição",
    description:
      "Devolve o pedido mais antigo do dono que espera o serviço local, com o endereço canônico do vídeo e o lease (`leaseToken`, `leaseExpiresAt`). Antes, o pedido cujo lease venceu volta para a fila. Com a fila vazia, responde 204 sem corpo. O serviço renova o lease em `lease` enquanto trabalha.",
    success: { status: 200, description: "O pedido reservado (ou 204, sem corpo, quando não há pedido na fila).", schema: "TranscriptionReservation" },
  },
  "POST /api/transcription-worker/lease": {
    tag: "Serviço local de transcrição",
    summary: "Renova o lease do pedido com o progresso",
    description: "Estende o lease e guarda a etapa e a porcentagem. Um lease vencido, trocado ou cancelado responde 409: o serviço deve largar o pedido.",
    body: "TranscriptionLeaseInput",
    success: { status: 200, description: "O novo vencimento do lease.", schema: "TranscriptionLeaseResult" },
    errors: { 400: invalid, 409: "O lease não vale mais: venceu, foi trocado ou o pedido foi cancelado." },
  },
  "POST /api/transcription-worker/deliver": {
    tag: "Serviço local de transcrição",
    summary: "Entrega o resultado ou a falha do pedido",
    description:
      "Com `outcome: completed`, grava o resultado cru numa entrada do pedido, leva o pedido a `running` e enfileira a formatação com o Haiku; acima do teto de tamanho, o pedido fica `failed` com `too_large` e a resposta já diz isso. Com `outcome: failed`, o pedido vai para `failed` com o código fechado, o documento diz o motivo e a Leitura diária do dia do pedido volta para a fazer. O corpo aceita até 4 MiB.",
    body: "TranscriptionDeliveryInput",
    success: { status: 200, description: "Como o pedido ficou: `running`, ou `failed` com o código.", schema: "TranscriptionDeliveryResult" },
    errors: { 400: invalid, 409: "O lease não vale mais: venceu, foi trocado ou o pedido foi cancelado." },
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
    description: "Envie só os campos que mudam, mais o `expectedRevision` lida da tarefa. `null` em `status` ou numa data apaga o valor; `null` em `projectId` devolve a tarefa a `diario`.",
    body: "UpdateTaskInput",
    success: { status: 204, description: "A tarefa foi editada." },
    errors: { 400: invalid, 404: "Tarefa ou projeto não encontrado.", 409: stale },
  },
  "PUT /api/tasks/{taskId}/situation": {
    tag: "Tarefas",
    summary: "Define a situação do pedido de agente que terminou",
    description: "Para revisar, revisada ou guardada: qualquer uma a partir de qualquer uma. Vale a última gravação, sem `expectedRevision`.",
    body: "SetTaskSituationInput",
    success: { status: 200, description: "O cartão da tarefa com a situação nova.", schema: "TaskCard" },
    errors: { 400: invalid, 404: "Tarefa não encontrada (não existe ou não é do usuário).", 409: "A tarefa não aceita situação: é de pessoa, passo, execução agendada ou ainda está aberta." },
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

  "GET /api/projects": {
    tag: "Projetos",
    summary: "Lista os projetos",
    description: "Os projetos do usuário: `diario` primeiro e os outros por nome. O `diario` nasce na primeira leitura de quem ainda não tem nenhum.",
    success: { status: 200, description: "Os projetos do usuário.", schema: "Project", list: true },
  },
  "POST /api/projects": {
    tag: "Projetos",
    summary: "Cria um projeto",
    description: "O nome vale sem os espaços das pontas: de 1 a 60 caracteres, único por usuário sem distinguir maiúsculas de minúsculas (`diario` já existe para todos).",
    body: "CreateProjectInput",
    success: { status: 201, description: "O projeto foi criado.", schema: "Project" },
    errors: { 400: invalid, 409: "O usuário já tem um projeto com esse nome." },
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
    errors: { 400: invalid, 404: "Projeto do modelo não encontrado (não existe ou não é do usuário).", 409: idempotencyClash, 422: idempotencyReuse },
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
    errors: { 400: invalid, 404: "Série ou projeto do modelo não encontrado.", 409: stale },
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
  "GET /api/requests/model/options": {
    tag: "Pedidos ao agente",
    summary: "Lista os provedores e modelos do modo modelo",
    description: "Os provedores com chave neste servidor, os modelos que cada um oferece, os níveis de esforço e a escolha padrão (ADR 0019).",
    success: { status: 200, description: "As opções do seletor.", schema: "ModelOptions" },
    errors: { 404: modelOff },
  },
  "POST /api/requests/model": {
    tag: "Pedidos ao agente",
    summary: "Manda uma mensagem ao modelo escolhido",
    description: "O modelo escolhido (provedor, modelo e esforço) conversa e usa a agenda pelo MCP (ADR 0019). Reenviar o mesmo `clientMessageId` devolve o pedido já aceito; `sessionId` continua a conversa, e as trocas anteriores da sessão vão junto. Com as ferramentas da agenda ligadas, só o dono do MCP (`MCP_OWNER_USER_ID`) usa o modo; os demais recebem 403.",
    body: "StartModelRequestInput",
    success: { status: 202, description: "O pedido foi aceito.", schema: "Request" },
    errors: { 400: `${invalid} Ou o provedor não está ligado, ou o modelo não está na lista dele.`, 404: `${modelOff} Ou \`sessionId\` não é um pedido deste usuário.` },
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
