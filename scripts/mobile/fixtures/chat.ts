/**
 * Fixtures do chat com o agente: as respostas de `POST/GET /api/requests*` validadas pelo `requestSchema` do
 * contrato e as saídas das funções do web que o chat usa (`answerChoices`, `choiceLabel`, `shortUrl`,
 * `remarkAnswer`, `parseChatCommand`, `parseCommand`, `hermesStepsOf`, `traceDuration`, `timelineBars`,
 * `requestWithWindow`, `requestEntityRef`, os textos de erro).
 *
 * O `css-stub` vem primeiro: os componentes do chat importam módulos CSS, que o Node não lê.
 */
import "../css-stub";
import { modelOptionsSchema, requestSchema } from "../../../packages/contracts/src/schemas";
import { answerChoices, choiceLabel, remarkAnswer, shortUrl } from "../../../apps/web/src/lib/agent-chat/answer-format";
import { parseChatCommand } from "../../../apps/web/src/lib/agent-chat/chat-mode-command";
import {
  type StoredModelSelection, modelFooter, modelName, providerOffText, resolveSelection, withEffort, withModel, withProvider,
} from "../../../apps/web/src/lib/agent-chat/model-selection";
import { hermesStepsOf } from "../../../apps/web/src/lib/agent-chat/hermes-steps";
import { pendingStepLabel } from "../../../apps/web/src/lib/agent-chat/pending-step";
import {
  type AgentChatMessage, type AgentChatPending, agentFailureText, type ChatFailureCode,
} from "../../../apps/web/src/lib/agent-chat/use-agent-chat";
import { CHANGE_LABELS, requestEntityRef } from "../../../apps/web/src/components/hub/entity-rows";
import { parseCommand } from "../../../apps/web/src/components/hub/hub-commands";
import { requestWithWindow } from "../../../apps/web/src/components/hub/agent-chat-panel";
import { timelineBars, traceDuration } from "../../../apps/web/src/components/hub/agent-trace";

type RequestInput = Record<string, unknown> & { id: string };

function request(input: RequestInput) {
  return requestSchema.parse({
    kind: "request",
    route: "steps",
    status: "queued",
    title: "Pedido",
    createdAt: "2026-09-14T14:48:00.000Z",
    updatedAt: "2026-09-14T14:48:00.000Z",
    steps: [],
    entities: [],
    ...input,
  });
}

const FIRST = "R00000000000000000000000A1";
const SECOND = "R00000000000000000000000A2";

const queued = request({ id: FIRST, status: "queued", title: "Criar a reunião de sexta", text: "Criar a reunião de sexta" });

const running = request({
  ...queued,
  status: "running",
  steps: [
    { id: "s1", agent: "router", label: "Entendendo o pedido", status: "done" },
    { id: "s2", agent: "task", label: "Criando a tarefa", status: "running" },
    { id: "s3", agent: "writer", label: "Escrevendo a resposta", status: "queued" },
  ],
  progress: "Criando a tarefa…",
});

const done = request({
  ...queued,
  status: "done",
  updatedAt: "2026-09-14T14:48:09.000Z",
  steps: [
    { id: "s1", agent: "router", label: "Entendendo o pedido", status: "done" },
    { id: "s2", agent: "task", label: "Criando a tarefa", status: "done" },
    { id: "s3", agent: "writer", label: "Escrevendo a resposta", status: "done" },
  ],
  entities: [
    { kind: "task", id: "task-new", name: "Reunião de sexta", operation: "create", linkedTo: [] },
    { kind: "artifact", id: "art-new", name: "Pauta da reunião", artifactType: "text", operation: "update", linkedTo: [{ kind: "task", id: "task-new" }] },
    { kind: "task", id: "task-gone", name: "Reunião antiga", operation: "delete", linkedTo: [] },
  ],
  message: "Criei a tarefa para sexta às 10h.",
});

const queryDone = request({
  ...queued,
  id: SECOND,
  status: "done",
  title: "O que tenho amanhã?",
  text: "O que tenho amanhã?",
  steps: [
    {
      id: "q1",
      agent: "query",
      label: "Consultando a agenda",
      status: "done",
      result: { columns: ["Tarefa", "Início"], rows: [["Dentista", "09:00"], ["Almoço", null]], truncated: true },
    },
  ],
  message: "Você tem duas tarefas amanhã.",
});

const failed = request({
  ...queued,
  status: "failed",
  errorCode: "conflict",
  steps: [{ id: "s1", agent: "router", label: "Entendendo o pedido", status: "failed" }],
});

const cancelled = request({ ...queued, status: "cancel", errorCode: "cancelled", steps: [{ id: "s1", agent: "router", label: "Entendendo o pedido", status: "cancel" }] });

const hermesTrace = (status: "running" | "done", withAnswer: boolean) => ({
  route: "hermes",
  status,
  startedAt: "2026-09-14T14:48:00.000Z",
  durationMs: withAnswer ? 4200 : undefined,
  fields: [{ label: "Modelo", value: "gpt-x" }],
  entries: [
    { id: "t0", kind: "request", label: "Pedido", status: "done", startedAt: "2026-09-14T14:48:00.000Z", durationMs: 20 },
    { id: "t1", kind: "thought", label: "Pensou", status: "done", startedAt: "2026-09-14T14:48:00.500Z", durationMs: 900, sections: [{ title: "Raciocínio", text: "Preciso ver a agenda." }] },
    { id: "t2", kind: "tool", label: "Executou um comando", source: "terminal", summary: "ls /opt/data", status: withAnswer ? "done" : "running", startedAt: "2026-09-14T14:48:01.500Z", durationMs: withAnswer ? 1500 : undefined, sections: [{ title: "Entrada", text: "ls /opt/data", code: true }] },
    { id: "t3", kind: "tool", label: "Esperando", status: "pending" },
    ...(withAnswer ? [{ id: "t4", kind: "answer", label: "Resposta", status: "done", startedAt: "2026-09-14T14:48:03.500Z", durationMs: 600 }] : []),
  ],
});

const hermesAccepted = request({ id: FIRST, route: "hermes", status: "running", title: "Oi Hermes", text: "Oi Hermes", trace: hermesTrace("running", false) });
const hermesDone = request({
  ...hermesAccepted,
  status: "done",
  message: 'Quer o resumo completo? Diga "só gmail" ou "com calendar e drive".',
  trace: hermesTrace("done", true),
});
// O modo modelo (ADR 0019): o mesmo formato do Hermes, com as ferramentas da agenda no rastro e a escolha no pedido.
const MODEL_SELECTION = { provider: "anthropic", model: "claude-sonnet-5-5", effort: "medium" } as const;
const modelTrace = (status: "running" | "done") => ({
  route: "model",
  status,
  startedAt: "2026-09-14T14:48:00.000Z",
  durationMs: status === "done" ? 3100 : undefined,
  fields: status === "done" ? [{ label: "Modelo", value: "claude-sonnet-5-5" }, { label: "Provedor", value: "Anthropic" }] : [],
  entries: [
    { id: "request", kind: "request", label: "Pedido", status: "done", startedAt: "2026-09-14T14:48:00.000Z" },
    { id: "thought-1", kind: "thought", label: "Pensou", status: "done", startedAt: "2026-09-14T14:48:00.400Z", sections: [{ title: "Raciocínio", text: "Ver a agenda de amanhã." }] },
    { id: "toolu_1", kind: "tool", label: "Listou a agenda", source: "list_agenda_tasks", status, startedAt: "2026-09-14T14:48:01.000Z" },
  ],
});
const modelAccepted = request({ id: FIRST, route: "model", status: "running", title: "O que tenho amanhã?", text: "O que tenho amanhã?", model: MODEL_SELECTION, trace: modelTrace("running") });
const modelDone = request({ ...modelAccepted, status: "done", message: "Amanhã você tem dentista às 9h.", trace: modelTrace("done") });
// `GET /api/requests/model/options`: o que o servidor oferece (a OpenAI não tem chave neste ambiente).
const modelOptions = modelOptionsSchema.parse({
  providers: [
    {
      id: "anthropic",
      name: "Anthropic",
      models: [{ id: "claude-opus-5-5", name: "Opus 5.5" }, { id: "claude-sonnet-5-5", name: "Sonnet 5.5" }],
      defaultModel: "claude-sonnet-5-5",
    },
    {
      id: "openrouter",
      name: "OpenRouter",
      models: [{ id: "google/gemini-4-neon", name: "Gemini 4 Neon" }, { id: "meta/llama-5", name: "Llama 5" }],
      defaultModel: "meta/llama-5",
    },
  ],
  efforts: ["low", "medium", "high", "max"],
  default: MODEL_SELECTION,
});

const hermesOff = request({ id: FIRST, route: "hermes", status: "failed", errorCode: "unavailable", title: "Oi", message: "O Hermes está desligado nesta API." });
const hermesFailed = request({ id: FIRST, route: "hermes", status: "failed", errorCode: "unavailable", title: "Oi", text: "Oi", message: "O Hermes não respondeu a tempo." });

const listed = [
  request({ id: "R00000000000000000000000C3", status: "running", title: "Criar nota de compras", text: "Criar nota de compras", steps: [{ id: "c1", agent: "note", label: "Criando a nota", status: "running" }] }),
  request({ id: "R00000000000000000000000C2", route: "hermes", status: "running", title: "Resumir meu e-mail", text: "Resumir meu e-mail" }),
  request({ id: "R00000000000000000000000C1", status: "done", title: "Já terminou", text: "Já terminou" }),
  request({ id: "R00000000000000000000000C0", route: "voice", status: "running", title: "Voz aberta" }),
  request({ id: "R00000000000000000000000B9", route: "steps", status: "waiting", title: "Sem texto" }),
];

const CHOICE_TEXTS = [
  'Diga "só gmail" ou "com calendar e drive".',
  'Escolha “hoje”, “amanhã” ou “segunda”.',
  'Quer "sim"?',
  'Diga "a", "b", "c", "d" ou "e".',
  'Diga "ok", "não" e "talvez".',
  'Depois eu digo "uma" mas antes "duas" ou "três".',
  '"um" separa "dois" tudo "três"',
  'Fale "x" ou "y"',
  'Primeiro "alfa" ou "beta" e depois "gama" ou "delta".',
  'Diga "mesma" ou "mesma".',
  'Aspas "inicial e depois ""vazio"" ou "ok ok".',
  'Escreva "um texto bem longo que passa dos quarenta e oito caracteres com certeza" ou "curto".',
  "Sem aspas nenhuma aqui.",
  'Ou, em inglês: "yes" or "no".',
  'Prefere "café", "chá" ou "água"?',
];

const CHOICE_LABELS = ["só gmail", "éclair", "çedilha", "Já maiúscula", "ábaco ", "1 número", "", "ß"];

const URLS = [
  "https://www.example.com/",
  "http://example.com/caminho?x=1#topo",
  "https://example.com/um/dois/tres/quatro/cinco/seis/sete/oito",
  "https://exemplo-de-dominio-muito-longo.com.br/pasta/arquivo-com-nome-longo.html",
  "https://exemplo-de-dominio-muito-longo-mesmo-demais-para-caber.com.br",
  "www.nada.com",
];

const CHAT_COMMANDS = [
  "/hermes", "/hermes  oi tudo bem", "/HERMES\nlinha dois", "/app", "/assistente", "/sair", " /sair ", "/appx", "oi /hermes", "/hermesx", "hermes", "/hermes   ",
  "/claude", "/Claude o que tenho amanhã?", "/claudes oi", "claude",
  "/modelo", "/MODELO  qual a previsão?", "/openai", "/OpenAI resuma o dia", "/openrouter", "/openrouter\nlinha dois", "/modelos", "/modelo   ", "oi /claude",
];

// A escolha guardada contra o que o servidor oferece, a troca de provedor, de modelo e de esforço, e o rodapé da resposta.
const ANTHROPIC_OPUS = { provider: "anthropic", model: "claude-opus-5-5", effort: "high" } as const;
const STORED_CASES: (StoredModelSelection | null)[] = [
  null,
  { current: ANTHROPIC_OPUS, models: { anthropic: "claude-opus-5-5" } },
  { current: { provider: "openrouter", model: "meta/llama-5", effort: "max" }, models: { openrouter: "meta/llama-5", anthropic: "claude-opus-5-5" } },
  // A OpenAI saiu do ambiente: volta ao padrão do servidor.
  { current: { provider: "openai", model: "gpt-6.2-sol", effort: "low" }, models: { openai: "gpt-6.2-sol" } },
  // Modelo que saiu da lista: vira o padrão do provedor.
  { current: { provider: "anthropic", model: "claude-velho", effort: "low" }, models: { anthropic: "claude-velho" } },
  // Esforço que o servidor não oferece mais: vira o do padrão.
  { current: { provider: "anthropic", model: "claude-opus-5-5", effort: "max" }, models: {} },
];
const SERVER_OPTIONS = { ...modelOptions, efforts: ["low", "medium", "high"] as typeof modelOptions.efforts };


const COMMAND_INPUTS = ["/", "/t", "/tar", "/tarefa", "/tarefa comprar pão", "/N", "/nota", "/notificacoes", "/notif", "/config", "/configuracoes", "/ta", "/criar", "/lista", "/pesq", "/buscar", "/x", "oi", "/Tarefa  ", "/nota    texto\ncom linha", "/ajustar", "/tema", "/avisos", "/tipo"];

const HERMES_ENTRIES = [
  { id: "a", kind: "thought", label: "Pensou", status: "done", summary: "Resumo do pensamento", sections: [{ title: "Raciocínio", text: "Primeiro bloco" }, { title: "Mais", text: "Segundo bloco" }] },
  { id: "b", kind: "tool", label: "Executou um comando", status: "running", summary: "ls /opt/data" },
  { id: "c", kind: "tool", label: "Falhou", status: "failed" },
  { id: "d", kind: "answer", label: "Resposta", status: "done" },
  { id: "e", kind: "tool", label: "Esperando", status: "pending" },
  { id: "f", kind: "thought", label: "Sem texto", status: "running" },
  { id: "g", kind: "routing", label: "Roteou", status: "done" },
  { id: "h", kind: "thought", label: "Pensou de novo", status: "done", sections: [{ title: "x", text: "" }], summary: "só o resumo" },
];

const TRACE_NOW = Date.parse("2026-09-14T14:48:10.000Z");

const TRACE_CASES = [
  hermesTrace("done", true),
  hermesTrace("running", false),
  { route: "steps", status: "done", fields: [], entries: [{ id: "x", kind: "agent", label: "Agente", status: "done" }] },
  {
    route: "steps",
    status: "running",
    startedAt: "2026-09-14T14:48:00.000Z",
    fields: [],
    entries: [
      { id: "r", kind: "routing", label: "Roteamento", status: "done", startedAt: "2026-09-14T14:48:01.000Z", durationMs: 2000 },
      { id: "m", kind: "message", label: "Comentário", status: "running", startedAt: "2026-09-14T14:48:04.000Z" },
      { id: "q", kind: "request", label: "Pedido", status: "done", startedAt: "2026-09-14T14:47:50.000Z", durationMs: 100 },
      { id: "n", kind: "agent", label: "Sem início", status: "pending" },
    ],
  },
];

/** Os parágrafos que a leitura do markdown trata: o que `remarkAnswer` faz num parágrafo de texto simples. */
const POLISH_TEXTS: { text: string; nextIsList: boolean }[] = [
  { text: "Os passos:", nextIsList: true },
  { text: "Uma decisão antes: me diga qual conta.", nextIsList: false },
  { text: "Abri /opt/data/token.json e vi NOT_AUTHENTICATED lá.", nextIsList: false },
  { text: 'Resultado: diga "um" ou "dois".', nextIsList: false },
  { text: "Muitas palavras antes de chegar aos dois pontos: não é rótulo.", nextIsList: false },
  { text: "Texto simples sem nada.", nextIsList: false },
  { text: "Rótulo longo demais para ser rótulo de uma lista qualquer aqui:", nextIsList: true },
  { text: "Em http://x.com/a/b e CONSTANTE_AQUI.", nextIsList: false },
  { text: "Olá: tudo", nextIsList: false },
  { text: "A:b", nextIsList: false },
];

const WINDOW_CASES = [
  { dayKey: "2026-09-14", startMs: Date.parse("2026-09-14T13:30:00.000Z"), endMs: Date.parse("2026-09-14T16:00:00.000Z"), minutes: 150, endsAtMidnight: false, text: "  marcar um treino " },
  { dayKey: "2026-09-15", startMs: Date.parse("2026-09-15T13:00:00.000Z"), endMs: Date.parse("2026-09-15T13:45:00.000Z"), minutes: 45, endsAtMidnight: false, text: "ler" },
  { dayKey: "2026-09-16", startMs: Date.parse("2026-09-16T20:00:00.000Z"), endMs: Date.parse("2026-09-17T03:00:00.000Z"), minutes: 420, endsAtMidnight: true, text: "descansar" },
  { dayKey: "2026-09-17", startMs: Date.parse("2026-09-17T12:00:00.000Z"), endMs: Date.parse("2026-09-17T14:00:00.000Z"), minutes: 120, endsAtMidnight: false, text: "estudar" },
];

const DURATIONS = [0, 1, 849.6, 850, 999, 1000, 1234, 1250, 9950, 59_999, 60_000, 65_000, 125_400, 3_600_000];

const FAILURE_CODES: ChatFailureCode[] = [
  "invalid_input", "forbidden", "limit_reached", "conflict", "unavailable", "cancelled", "internal", "connection_lost", "connection_failed", "session_expired",
];

function polish(text: string, nextIsList: boolean) {
  const tree = {
    type: "root",
    children: [
      { type: "paragraph", children: [{ type: "text", value: text }] },
      ...(nextIsList ? [{ type: "list", children: [] }] : []),
    ],
  };
  remarkAnswer()(tree);
  const paragraph = tree.children[0] as { data?: { hProperties?: Record<string, string> }; children?: unknown[] };
  const props = paragraph.data?.hProperties ?? {};
  return {
    label: props["data-label"] === "true",
    choices: props["data-choices"] ? (JSON.parse(props["data-choices"]) as string[]) : [],
    children: paragraph.children,
  };
}

/**
 * O que a linha de status diz de um pedido em andamento (`pendingStepLabel`): o passo do pedido por passos, a ferramenta
 * ou o pensamento do Hermes, senão o rótulo do pedido. Só contam as mensagens do pedido em andamento (`m1`).
 */
const STEP = (id: string, label: string, status: string) => ({ id, agent: "task-create", label, status });
const stepsProcess = (steps: ReturnType<typeof STEP>[]): AgentChatMessage =>
  ({ id: "m1-process", role: "process", request: request({ ...queued, status: "running", steps }) }) as AgentChatMessage;
const hermesSteps = (id: string, last: "running" | "done"): AgentChatMessage => ({
  id,
  role: "hermes-steps",
  running: true,
  steps: [
    { id: "a", kind: "thought", label: "Pensou", status: "done" },
    { id: "b", kind: "tool", label: "Executou um comando", detail: "date", status: last },
  ],
});
const STEP_PENDING: AgentChatPending = { id: "m1", label: "Realizando processos", requestId: FIRST };
const PENDING_STEP_CASES: { messages: AgentChatMessage[]; pending: AgentChatPending }[] = [
  { messages: [{ id: "m1-process", role: "process", request: null }], pending: STEP_PENDING },
  { messages: [stepsProcess([])], pending: STEP_PENDING },
  {
    messages: [stepsProcess([STEP("1", "Criando tarefas", "done"), STEP("2", "Criando notas", "running"), STEP("3", "Editando tarefas", "queued")])],
    pending: STEP_PENDING,
  },
  { messages: [stepsProcess([STEP("1", "Criando tarefas", "done"), STEP("3", "Editando tarefas", "queued")])], pending: STEP_PENDING },
  { messages: [stepsProcess([STEP("1", "Criando tarefas", "done"), STEP("3", "Esperando o agente", "waiting")])], pending: STEP_PENDING },
  { messages: [stepsProcess([STEP("1", "Criando tarefas", "done")])], pending: STEP_PENDING },
  { messages: [hermesSteps("m1-steps", "running")], pending: { id: "m1", label: "Hermes" } },
  { messages: [hermesSteps("m1-steps", "done")], pending: { id: "m1", label: "Hermes" } },
  { messages: [{ id: "m1-steps", role: "hermes-steps", running: true, steps: [] }], pending: { id: "m1", label: "Hermes" } },
  {
    messages: [
      { id: "m0", role: "user", text: "que horas são?" },
      hermesSteps("m0-steps", "done"),
      { ...stepsProcess([STEP("9", "De outro pedido", "running")]), id: "m0-process" },
    ],
    pending: { id: "m1", label: "Haiku 5.5" },
  },
  { messages: [], pending: { id: "m1" } },
];

export function chatFixtures(): Record<string, unknown> {
  return {
    "chat-accepted": { requestId: FIRST },
    "chat-request-queued": queued,
    "chat-request-running": running,
    "chat-request-done": done,
    "chat-request-query": queryDone,
    "chat-request-failed": failed,
    "chat-request-cancelled": cancelled,
    "chat-hermes-accepted": hermesAccepted,
    "chat-hermes-done": hermesDone,
    "chat-hermes-off": hermesOff,
    "chat-hermes-failed": hermesFailed,
    "chat-model-accepted": modelAccepted,
    "chat-model-done": modelDone,
    "chat-model-options": modelOptions,
    "chat-request-list": listed,
    "chat-functions": {
      answerChoices: CHOICE_TEXTS.map((text) => ({ args: [text], result: answerChoices(text) })),
      choiceLabel: CHOICE_LABELS.map((text) => ({ args: [text], result: choiceLabel(text) })),
      shortUrl: URLS.map((href) => ({ args: [href], result: shortUrl(href) })),
      parseChatCommand: CHAT_COMMANDS.map((text) => ({ args: [text], result: parseChatCommand(text) })),
      parseCommand: COMMAND_INPUTS.map((input) => {
        const query = parseCommand(input);
        return { args: [input], result: query ? { slugs: query.matches.map((match) => match.slug), argument: query.argument } : null };
      }),
      hermesStepsOf: [{ args: [HERMES_ENTRIES], result: hermesStepsOf(HERMES_ENTRIES as never) }, { args: [[]], result: [] }],
      traceDuration: DURATIONS.map((ms) => ({ args: [ms], result: traceDuration(ms) })),
      timelineBars: TRACE_CASES.map((trace) => {
        const { bars, totalMs } = timelineBars(trace as never, TRACE_NOW);
        return {
          args: [trace, TRACE_NOW],
          result: { totalMs, bars: bars.map((bar) => ({ id: bar.entry.id, lane: bar.lane, left: bar.left, width: bar.width })) },
        };
      }),
      polishParagraph: POLISH_TEXTS.map((input) => ({ args: [input.text, input.nextIsList], result: polish(input.text, input.nextIsList) })),
      requestWithWindow: WINDOW_CASES.map(({ text, ...window }) => ({ args: [window, text], result: requestWithWindow(window, text) })),
      entityRows: done.entities.map((entity) => {
        const ref = requestEntityRef(entity as never);
        return { args: [entity], result: { ...ref, text: CHANGE_LABELS[ref.kind][ref.change] } };
      }),
      resolveSelection: STORED_CASES.flatMap((stored) =>
        [modelOptions, SERVER_OPTIONS].map((options) => ({ args: [options, stored], result: resolveSelection(options, stored) }))),
      withProvider: (["anthropic", "openrouter", "openai"] as const).flatMap((provider) =>
        STORED_CASES.slice(1, 3).map((stored) => ({ args: [modelOptions, stored, provider], result: withProvider(modelOptions, stored as StoredModelSelection, provider) }))),
      withModel: [{ args: [STORED_CASES[1], "claude-sonnet-5-5"], result: withModel(STORED_CASES[1] as StoredModelSelection, "claude-sonnet-5-5") }],
      withEffort: [{ args: [STORED_CASES[1], "low"], result: withEffort(STORED_CASES[1] as StoredModelSelection, "low") }],
      modelFooter: [
        { args: [modelOptions, MODEL_SELECTION], result: modelFooter(modelOptions, MODEL_SELECTION) },
        { args: [modelOptions, ANTHROPIC_OPUS], result: modelFooter(modelOptions, ANTHROPIC_OPUS) },
        { args: [null, { provider: "openrouter", model: "google/gemini-4-neon", effort: "low" }], result: modelFooter(null, { provider: "openrouter", model: "google/gemini-4-neon", effort: "low" }) },
      ],
      modelName: [
        { args: [modelOptions, MODEL_SELECTION], result: modelName(modelOptions, MODEL_SELECTION) },
        { args: [modelOptions, { provider: "anthropic", model: "desconhecido" }], result: modelName(modelOptions, { provider: "anthropic", model: "desconhecido" }) },
        { args: [null, MODEL_SELECTION], result: modelName(null, MODEL_SELECTION) },
      ],
      providerOffText: (["anthropic", "openai", "openrouter"] as const).map((provider) => ({ args: [provider], result: providerOffText(provider) })),
      failureText: FAILURE_CODES.map((code) => ({ args: [code], result: agentFailureText(code) })),
      pendingStepLabel: PENDING_STEP_CASES.map(({ messages, pending }) => ({ args: [messages, pending], result: pendingStepLabel(messages, pending) })),
    },
  };
}
