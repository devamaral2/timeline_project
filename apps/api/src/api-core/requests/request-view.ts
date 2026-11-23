import type { AgentTraceDto, AgentTraceStatus, ArtifactType, RequestDto, RequestStepDto } from "@repo/contracts";
import { stepLabel, uiConfig } from "./request-config";
import type { RequestEntityRecord, RequestRecord, StepRecord, StepStatus } from "./request-store";
import { toRequestTrace } from "./request-trace";

const TRACE_STEP_STATUS: Record<AgentTraceStatus, StepStatus> = {
  pending: "queued", running: "running", done: "done", failed: "failed",
};

/** O que o job vivo do pedido publica enquanto trabalha; some com ele. */
export interface RequestProgress {
  trace?: AgentTraceDto;
}

function messageOf(request: RequestRecord): string | undefined {
  if (request.answer) return request.answer;
  if (request.failedSteps.length > 0) {
    return request.failedSteps
      .map((step) => uiConfig.failure.replace("{{label}}", stepLabel(step.agent).toLowerCase()))
      .join("\n");
  }
  return request.status === "failed" ? uiConfig.requestFailed : undefined;
}

/** No Hermes e no modo modelo nao ha passos gravados: o que pensaram e as ferramentas que usaram saem do rastro. */
function traceSteps(trace: AgentTraceDto | undefined, route: "hermes" | "model"): RequestStepDto[] {
  return (trace?.entries ?? [])
    .filter((entry) => entry.kind === "thought" || entry.kind === "tool" || entry.kind === "agent")
    .map((entry) => ({
      id: entry.id, agent: entry.source ?? route, label: entry.label, status: TRACE_STEP_STATUS[entry.status],
    }));
}

/**
 * O que o cliente mostra de um pedido: a caixa com os passos, toda com texto predefinido, o que foi tocado e a
 * resposta. O contrato e compartilhado. `withTrace: false` deixa o rastro de fora (a lista de pedidos).
 */
export function toRequestDto(
  request: RequestRecord,
  steps: readonly StepRecord[],
  entities: readonly RequestEntityRecord[],
  options: { progress?: RequestProgress; withTrace?: boolean } = {},
): RequestDto {
  const message = messageOf(request);
  const open = request.status === "queued" || request.status === "running" || request.status === "waiting";
  const trace = request.route === "steps"
    ? toRequestTrace(request, steps, entities, message)
    : request.trace ?? (open ? options.progress?.trace : undefined);
  const stepDtos: RequestStepDto[] = request.route === "hermes" || request.route === "model"
    ? traceSteps(trace, request.route)
    : steps.map((step) => ({
      id: step.id, agent: step.agent, label: step.label, status: step.status,
      ...(step.errorCode ? { errorCode: step.errorCode } : {}),
      ...(step.result ? { result: step.result } : {}),
    }));
  const current = open ? stepDtos.filter((step) => step.status === "running").at(-1)?.label : undefined;
  return {
    id: request.id,
    kind: request.kind,
    route: request.route,
    status: request.status,
    title: request.title,
    ...(request.sessionId ? { sessionId: request.sessionId } : {}),
    createdAt: request.createdAt.toISOString(),
    updatedAt: request.updatedAt.toISOString(),
    text: request.prompt,
    steps: stepDtos,
    entities: entities.map((entity) => ({
      kind: entity.kind, id: entity.id, name: entity.summary.name,
      ...(entity.summary.artifactType ? { artifactType: entity.summary.artifactType as ArtifactType } : {}),
      operation: entity.operation,
      linkedTo: entity.links
        .map((link) => (link.from.id === entity.id ? link.to : link.from)),
    })),
    ...(message ? { message } : {}),
    ...(request.errorCode ? { errorCode: request.errorCode } : {}),
    ...(current ? { progress: current } : {}),
    ...(trace && options.withTrace !== false ? { trace } : {}),
    // O Hermes responde com o modelo dele: a escolha que o pedido trouxe nao vale ali e nao aparece.
    ...(request.model && request.route !== "hermes" ? { model: { ...request.model } } : {}),
  };
}
