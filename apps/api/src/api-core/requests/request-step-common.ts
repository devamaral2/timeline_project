import { EntityBatchConflictError } from "../../domain";
import { AgentRunCancelledError, FastStageError } from "../agent/errors/agent.errors";
import type { RequestRecord, RequestStore, StepRecord } from "./request-store";

export interface StepPayload {
  requestId: string;
  stepId: string;
}

/** Um passo que nao conseguiu agir. O codigo vai para a caixa do pedido; nunca vira pergunta. */
export class StepFailure extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "StepFailure";
  }
}

export function failureCode(error: unknown): string {
  if (error instanceof StepFailure) return error.code;
  if (error instanceof FastStageError) return `agent_${error.reason}`;
  if (error instanceof EntityBatchConflictError) return "conflict";
  return "internal";
}

/** ISO-8601 valido ou nada: um horario que o modelo errou nao derruba o passo, cai no padrao. */
export function validInstant(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  return Number.isNaN(new Date(value).getTime()) ? undefined : value;
}

const OPEN = new Set(["queued", "running"]);

/**
 * O ciclo comum de todo passo: ignora o que ja terminou (ou foi cancelado), marca em andamento e converte
 * qualquer falha em passo vermelho com codigo (e a finalizacao enfileirada), sem refazer nada. Cancelamento sobe.
 */
export async function runStep(
  store: RequestStore,
  payload: StepPayload,
  signal: AbortSignal | undefined,
  body: (input: { request: RequestRecord; step: StepRecord; timings: Record<string, number> }) => Promise<void>,
): Promise<void> {
  const [request, steps] = await Promise.all([store.find(payload.requestId), store.steps(payload.requestId)]);
  const step = steps.find((candidate) => candidate.id === payload.stepId);
  if (!request || !step || !OPEN.has(request.status) || !OPEN.has(step.status)) return;
  await store.markStepRunning(step.id);

  const timings: Record<string, number> = {};
  try {
    await body({ request, step, timings });
  } catch (error) {
    if (error instanceof AgentRunCancelledError || signal?.aborted) throw error;
    const errorCode = failureCode(error);
    // So o codigo vai para a caixa do pedido; a causa de um erro inesperado precisa ficar no log do servidor.
    if (errorCode === "internal") console.error(`[requests] passo ${step.agent} (${step.id}) falhou por erro interno`, error);
    await store.failStep({ requestId: request.id, stepId: step.id, errorCode, timings });
  }
}
