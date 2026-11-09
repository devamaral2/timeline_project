import { EntityBatchConflictError } from "../../domain";
import { AgentRunCancelledError, FastStageError } from "../agent/errors/agent.errors";
import type { ProcessRecord, ProcessStore, StepRecord } from "./process-store";

export interface StepPayload {
  processId: string;
  stepId: string;
}

/** Um passo que nao conseguiu agir. O codigo vai para a caixa de processo; nunca vira pergunta. */
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

/**
 * O ciclo comum de todo passo: ignora o que ja terminou, marca em andamento e converte qualquer falha em
 * passo vermelho com codigo (e a finalizacao enfileirada), sem refazer nada. Cancelamento sobe.
 */
export async function runStep(
  store: ProcessStore,
  payload: StepPayload,
  signal: AbortSignal | undefined,
  body: (input: { process: ProcessRecord; step: StepRecord; timings: Record<string, number> }) => Promise<void>,
): Promise<void> {
  const [process, steps] = await Promise.all([store.find(payload.processId), store.steps(payload.processId)]);
  const step = steps.find((candidate) => candidate.id === payload.stepId);
  if (!process || !step || step.status === "succeeded" || step.status === "failed") return;
  await store.markStepRunning(step.id);

  const timings: Record<string, number> = {};
  try {
    await body({ process, step, timings });
  } catch (error) {
    if (error instanceof AgentRunCancelledError || signal?.aborted) throw error;
    const errorCode = failureCode(error);
    // So o codigo vai para a caixa de processo; a causa de um erro inesperado precisa ficar no log do servidor.
    if (errorCode === "internal") console.error(`[process] passo ${step.agent} (${step.id}) falhou por erro interno`, error);
    await store.failStep({ processId: process.id, stepId: step.id, errorCode, timings });
  }
}
