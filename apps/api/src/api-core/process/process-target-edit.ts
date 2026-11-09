import type { z } from "zod";
import { describeTargetedEdit, type ProcessAgentRunner } from "./process-agent-runner";
import { StepFailure } from "./process-step-common";
import type { ProcessRecord, StepRecord } from "./process-store";

/**
 * Pergunta ao agente sobre o alvo da tela de detalhe. Uma unica chamada, sem consulta e sem candidatos: o agente
 * so pode devolver o `id` do alvo, e qualquer outro derruba o passo. Sem mudanca nenhuma, o passo falha com
 * `nothing_to_change` (nunca pergunta de volta).
 */
export async function askTarget<T extends { edits: Array<{ id: string }> }>(
  runner: ProcessAgentRunner,
  agent: string,
  schema: z.ZodType<T>,
  process: ProcessRecord,
  step: StepRecord,
  signal?: AbortSignal,
): Promise<T["edits"]> {
  const target = step.input?.target;
  if (!target) throw new StepFailure("target_missing");
  const { value } = await runner.run({
    agent, now: process.createdAt, schema, signal, user: describeTargetedEdit(process.prompt, target),
  });
  if (value.edits.some((edit) => edit.id !== target.id)) throw new StepFailure("target_unknown");
  if (value.edits.length === 0) throw new StepFailure("nothing_to_change");
  return value.edits;
}
