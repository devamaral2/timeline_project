import type { AgentTraceDto, AgentTraceEntryDto, AgentTraceField, AgentTraceSection, AgentTraceStatus } from "@repo/contracts";
import { isFinalAgentStatus, isSuccessAgentStatus } from "../../domain/agent-status";
import { dispatchConfig, stepLabel } from "./request-config";
import { ENTITY_AGENT } from "./request-steps";
import type { DispatchRecord, RequestEntityRecord, RequestRecord, StepRecord } from "./request-store";

const MAX_TEXT = 4_000;
const MAX_SUMMARY = 160;
const RESULT_PREVIEW_ROWS = 10;

const STEP_STATUS: Record<StepRecord["status"], AgentTraceStatus> = {
  queued: "pending", running: "running", done: "done", failed: "failed", cancel: "failed",
};

/** Por que o pedido foi ao Hermes sem ser uma tarefa de agente. `no_step` e `unsupported` so existem em pedidos antigos. */
const FALLBACK_REASONS: Record<string, string> = {
  uncertain: "o roteador não teve certeza",
  forced: "pedido direto, pelo prefixo fallback:",
  model_unavailable: "o modo modelo não está disponível para este pedido",
  no_step: "nenhum agente reconhecido para o pedido",
  unsupported: "o pedido pede uma operação sem agente",
};

/** O destino que o roteador escolheu, como o rastro o mostra. */
const ROUTE_LABELS: Record<string, string> = {
  query: "consultar registros",
  write: "criar ou atualizar registros",
  config: "configuração do app (modo modelo)",
};
const AGENT_TASK = "tarefa de agente (Hermes)";

/** O agente de fallback que existia antes de o Hermes ser o fallback: so aparece em pedidos antigos. */
const LEGACY_FALLBACK_AGENT: string = "fallback";

/** O rotulo de cada registro, no genero da entidade: "Tarefa criada", "Artefato criado". */
const ENTITY_LABELS: Record<RequestEntityRecord["kind"], Record<RequestEntityRecord["operation"], string>> = {
  task: { create: "Tarefa criada", update: "Tarefa alterada", delete: "Tarefa apagada" },
  artifact: { create: "Artefato criado", update: "Artefato alterado", delete: "Artefato apagado" },
};

function clip(text: string, max = MAX_TEXT): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function firstLine(text: string): string {
  return clip(text.trim().split("\n", 1)[0] ?? "", MAX_SUMMARY);
}

/** "850 ms" ou "1,2 s": o rotulo pronto, como todo texto do rastro. */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(1).replace(".", ",")} s`;
}

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function elapsed(from: Date | undefined, to: Date | undefined): number | undefined {
  if (!from || !to) return undefined;
  return Math.max(0, to.getTime() - from.getTime());
}

/**
 * O destino do pedido: o que o roteador escolheu ou, sem nenhum `yes`, o Hermes como tarefa de agente. Nada quando
 * o pedido foi ao Hermes como fallback, e nada em pedidos antigos, que nao tinham destino.
 */
function destinationOf(request: RequestRecord, dispatch: DispatchRecord): string | undefined {
  if (dispatch.fallbackReason) return undefined;
  if (dispatch.route) return ROUTE_LABELS[dispatch.route];
  return request.route === "hermes" ? AGENT_TASK : undefined;
}

/** O que o servidor fez com a resposta de cada pergunta do roteador, como no log do despacho. */
function verdict(name: string, dispatch: DispatchRecord): string {
  if (dispatch.uncertain.includes(name)) return "incerta";
  if (dispatch.unsupported?.includes(name)) return "sem agente";
  const answer = dispatch.answers[name];
  if (!answer) return "sem resposta";
  if (name === dispatch.route) return "define o destino";
  // Pedidos antigos tinham uma pergunta por operacao: toda resposta diferente de "nenhum" acionava um agente.
  return answer.choice !== "no" && answer.choice !== "none" ? "aciona um agente" : "ignorada";
}

function requestEntry(request: RequestRecord): AgentTraceEntryDto {
  const fields: AgentTraceField[] = [];
  if (request.context?.screen) fields.push({ label: "Tela", value: request.context.screen });
  if (request.context?.entityId) fields.push({ label: "Registro aberto", value: request.context.entityId });
  return {
    id: `${request.id}-request`, kind: "request", label: "Pedido", summary: firstLine(request.prompt), status: "done",
    startedAt: request.createdAt.toISOString(),
    ...(fields.length > 0 ? { fields } : {}),
    sections: [{ title: "Mensagem", text: clip(request.prompt) }],
    raw: { prompt: clip(request.prompt), context: request.context ?? null },
  };
}

function routingEntry(request: RequestRecord, steps: readonly StepRecord[]): AgentTraceEntryDto | undefined {
  const base = {
    id: `${request.id}-routing`, kind: "routing" as const, label: "Roteamento do pedido",
    startedAt: request.createdAt.toISOString(),
  };
  const dispatch: DispatchRecord | undefined = request.dispatch;
  if (!dispatch) {
    // Ainda escolhendo, ou a edicao pela tela de detalhe: ali o agente sai de uma tabela, sem modelo.
    if (request.status === "queued") return { ...base, status: "running", summary: "Entendendo o pedido" };
    return undefined;
  }
  const fields: AgentTraceField[] = [];
  if (dispatch.model) fields.push({ label: "Modelo", value: dispatch.model });
  if (dispatch.latencyMs !== undefined) fields.push({ label: "Latência", value: formatDuration(dispatch.latencyMs) });
  fields.push({ label: "Certeza mínima", value: percent(dispatchConfig.minCertainty) });
  const destination = destinationOf(request, dispatch);
  if (destination) fields.push({ label: "Destino", value: destination });
  if (dispatch.candidates) {
    const { selected, shortlisted } = dispatch.candidates;
    // Hoje o agente de escrita recebe a lista inteira; em pedidos antigos o JEV escolhia parte dela.
    fields.push({ label: "Candidatos de edição", value: selected === shortlisted ? String(shortlisted) : `${selected} de ${shortlisted}` });
  }
  if (dispatch.fallbackReason) {
    fields.push({ label: "Motivo do fallback", value: FALLBACK_REASONS[dispatch.fallbackReason] ?? "roteador indisponível" });
  }
  const answers = Object.entries(dispatch.answers).map(([name, answer]) =>
    `${name}: ${answer.choice} · confiança ${percent(answer.confidence)} · probabilidade ${percent(answer.probability)} · ${verdict(name, dispatch)}`);
  const called = steps.filter((step) => step.agent !== LEGACY_FALLBACK_AGENT).map((step) => stepLabel(step.agent));
  const summary = dispatch.fallbackReason
    ? `Fallback: ${FALLBACK_REASONS[dispatch.fallbackReason] ?? "roteador indisponível"}`
    : called.length > 0 ? `Aciona: ${called.join(", ")}`
      : destination ? `Destino: ${destination}` : undefined;
  return {
    ...base, status: "done",
    ...(dispatch.model ? { source: dispatch.model } : {}),
    ...(summary ? { summary } : {}),
    ...(dispatch.latencyMs !== undefined ? { durationMs: dispatch.latencyMs } : {}),
    fields,
    ...(answers.length > 0 ? { sections: [{ title: "Respostas do roteador", text: answers.join("\n"), code: true }] } : {}),
    raw: dispatch,
  };
}

function usageFields(usage: { input: number; output: number } | undefined): AgentTraceField[] {
  if (!usage || usage.input + usage.output === 0) return [];
  const count = (value: number) => value.toLocaleString("pt-BR");
  return [
    { label: "Tokens de entrada", value: count(usage.input) },
    { label: "Tokens de saída", value: count(usage.output) },
    { label: "Tokens no total", value: count(usage.input + usage.output) },
  ];
}

function stepEntry(step: StepRecord, entities: readonly RequestEntityRecord[]): AgentTraceEntryDto {
  const own = entities.filter((entity) => entity.stepId === step.id);
  const durationMs = elapsed(step.startedAt, step.finishedAt) ?? step.timings?.total;
  // O nome do agente ja vai em `source`.
  // O agente unico de escrita nao recebe dica de quantidade: decide sozinho quantas coisas o pedido cria ou altera.
  const fields: AgentTraceField[] = step.agent === ENTITY_AGENT
    ? []
    : [{ label: "Quantidade esperada", value: step.expected === "many" ? "vários" : "um" }];
  if (step.errorCode) fields.push({ label: "Erro", value: step.errorCode });
  for (const [name, value] of Object.entries(step.timings ?? {})) {
    fields.push({ label: name === "total" ? "Tempo do agente" : `Tempo · ${name}`, value: formatDuration(value) });
  }

  fields.push(...usageFields(step.usage));

  const sections: AgentTraceSection[] = [];
  if (step.input?.target) {
    sections.push({
      title: "Alvo", code: true,
      text: clip(JSON.stringify({ entityType: step.input.target.entityType, id: step.input.target.id, ...step.input.target.snapshot }, null, 2)),
    });
  }
  if (step.input?.candidates?.length) {
    sections.push({ title: "Candidatos de edição", text: clip(JSON.stringify(step.input.candidates, null, 2)), code: true });
  }
  if (own.length > 0) {
    sections.push({
      title: "Registros",
      text: own.map((entity) => `${ENTITY_LABELS[entity.kind][entity.operation]} · ${entity.summary.name}`).join("\n"),
    });
  }
  if (step.result) {
    sections.push({
      title: "Resultado da consulta", code: true,
      text: clip(JSON.stringify({ columns: step.result.columns, rows: step.result.rows.slice(0, RESULT_PREVIEW_ROWS) }, null, 2)),
    });
  }

  const summary = step.status === "failed" ? `Falhou: ${step.errorCode ?? "internal"}`
    : step.result ? `${step.result.rows.length} ${step.result.rows.length === 1 ? "linha" : "linhas"}${step.result.truncated ? " (cortado)" : ""}`
      : own.length > 0 ? clip(own.map((entity) => entity.summary.name).join(", "), MAX_SUMMARY)
        : undefined;
  return {
    id: step.id, kind: "agent", label: step.label, source: step.agent, status: STEP_STATUS[step.status],
    ...(summary ? { summary } : {}),
    ...(step.startedAt ? { startedAt: step.startedAt.toISOString() } : {}),
    ...(durationMs !== undefined ? { durationMs } : {}),
    fields,
    ...(sections.length > 0 ? { sections } : {}),
    raw: {
      id: step.id, agent: step.agent, expected: step.expected, status: step.status,
      errorCode: step.errorCode ?? null,
      startedAt: step.startedAt?.toISOString() ?? null,
      finishedAt: step.finishedAt?.toISOString() ?? null,
      timings: step.timings ?? null,
      // O retrato do alvo e as linhas da consulta ja estao nas secoes; aqui so o que os identifica.
      input: step.input
        ? {
          target: step.input.target ? { entityType: step.input.target.entityType, id: step.input.target.id } : null,
          candidates: step.input.candidates?.map((candidate) => ({ kind: candidate.kind, id: candidate.id, name: candidate.name })) ?? null,
        }
        : null,
      result: step.result
        ? { columns: step.result.columns, rows: step.result.rows.length, truncated: step.result.truncated }
        : null,
      entities: own.map((entity) => ({ kind: entity.kind, id: entity.id, operation: entity.operation, links: entity.links.length })),
      thoughts: step.thoughts?.length ?? 0,
    },
  };
}

/**
 * O que o modelo pensou em cada chamada do passo, um item por chamada, logo depois do agente que pensou. O
 * texto vai inteiro: ja foi cortado ao ser guardado.
 */
function thoughtEntries(step: StepRecord): AgentTraceEntryDto[] {
  return (step.thoughts ?? []).map((thought, index) => {
    const fields: AgentTraceField[] = [{ label: "Agente", value: stepLabel(step.agent) }];
    if (thought.model) fields.push({ label: "Modelo", value: thought.model });
    const summary = firstLine(thought.text);
    return {
      id: `${step.id}-thought-${index + 1}`, kind: "thought", label: "Pensou", source: step.agent, status: "done",
      ...(summary ? { summary } : {}),
      startedAt: thought.at,
      fields,
      sections: [{ title: "Raciocínio", text: thought.text }],
      // O texto ja esta na secao.
      raw: { stepId: step.id, agent: step.agent, at: thought.at, model: thought.model ?? null, chars: thought.text.length },
    };
  });
}

function answerEntry(
  request: RequestRecord,
  entities: readonly RequestEntityRecord[],
  message: string | undefined,
): AgentTraceEntryDto | undefined {
  if (!isFinalAgentStatus(request.status)) return undefined;
  const failed = !isSuccessAgentStatus(request.status);
  const links = new Set(entities.flatMap((entity) => entity.links.map((link) => `${link.from.id}>${link.to.id}`))).size;
  const fields: AgentTraceField[] = [{ label: "Registros", value: String(entities.length) }];
  if (links > 0) fields.push({ label: "Vínculos", value: String(links) });
  const failedSteps = request.failedSteps;
  if (failedSteps.length > 0) {
    fields.push({ label: "Passos com falha", value: failedSteps.map((step) => `${step.agent} (${step.errorCode})`).join(", ") });
  }
  const sections: AgentTraceSection[] = [];
  if (message) sections.push({ title: "Mensagem", text: clip(message) });
  const thought = request.answerThought;
  if (thought) sections.push({ title: "Raciocínio da explicação", text: thought });
  const summary = message ? firstLine(message)
    : entities.length === 1 ? "1 registro gravado" : `${entities.length} registros gravados`;
  return {
    id: `${request.id}-answer`, kind: "answer",
    label: request.status === "cancel" ? "Cancelado" : failed ? "Encerrou com falha" : message ? "Resposta" : "Concluiu",
    summary, status: failed ? "failed" : "done",
    ...(request.finishedAt ? { startedAt: request.finishedAt.toISOString() } : {}),
    fields,
    ...(sections.length > 0 ? { sections } : {}),
    raw: { status: request.status, failedSteps, errorCode: request.errorCode ?? null },
  };
}

/**
 * O rastro de um pedido por passos (ADR 003), para a aba "Processo" do chat: o pedido, o que o roteador escolheu, cada
 * agente com seus tempos, o que ele recebeu, o que pensou e o que gravou, e o fecho. So le o que o servidor ja
 * guardou; nada aqui chama modelo.
 */
export function toRequestTrace(
  request: RequestRecord,
  steps: readonly StepRecord[],
  entities: readonly RequestEntityRecord[],
  message?: string,
): AgentTraceDto {
  const routing = routingEntry(request, steps);
  const answer = answerEntry(request, entities, message);
  const entries: AgentTraceEntryDto[] = [
    requestEntry(request),
    ...(routing ? [routing] : []),
    ...steps.flatMap((step) => [stepEntry(step, entities), ...thoughtEntries(step)]),
    ...(answer ? [answer] : []),
  ];
  const durationMs = elapsed(request.createdAt, request.finishedAt);
  const fields: AgentTraceField[] = [];
  if (request.dispatch?.model) fields.push({ label: "Roteador", value: request.dispatch.model });
  fields.push({ label: "Agentes", value: String(steps.length) });
  fields.push({ label: "Registros", value: String(entities.length) });
  fields.push(...usageFields(steps.reduce(
    (sum, step) => ({ input: sum.input + (step.usage?.input ?? 0), output: sum.output + (step.usage?.output ?? 0) }),
    { input: 0, output: 0 },
  )));
  return {
    route: "steps",
    status: isSuccessAgentStatus(request.status) ? "done" : isFinalAgentStatus(request.status) ? "failed" : "running",
    startedAt: request.createdAt.toISOString(),
    ...(durationMs !== undefined ? { durationMs } : {}),
    fields,
    entries,
  };
}
