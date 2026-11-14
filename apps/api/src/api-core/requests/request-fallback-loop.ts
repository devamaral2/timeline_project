import type { RequestQueryResult } from "@repo/contracts";
import { newOrderedId } from "../../infrastructure/persistence/requests/request-rows";
import type { EntityKind, RequestAgent } from "./request-steps";
import type { NewStep, RequestEntityRecord, StepRecord } from "./request-store";

/**
 * O laco do fallback, so para o pedido que chega por `fallback: <pedido>`. E o laco de sessao do opencode
 * (`SessionRunner.drain`) na rota por passos: cada rodada e uma chamada ao modelo; se ele chama especialistas,
 * os resultados voltam na rodada seguinte; se responde, o laco acaba. A ultima rodada so pode responder, como o
 * limite de passos de la. Nada fica em memoria entre rodadas: o historico e lido dos passos gravados.
 */

/** Quantas rodadas o laco pode ter. Na ultima os especialistas ficam desativados e o modelo so responde. */
export const MAX_ROUNDS = 4;

const RESULT_ROWS = 50;
const HISTORY_CHARS = 12_000;

/** O que um especialista chamado numa rodada fez, como o modelo ve na rodada seguinte. */
export interface LoopCall {
  agent: RequestAgent;
  instruction?: string;
  status: "done" | "failed";
  errorCode?: string;
  /** O que o especialista criou ou alterou. */
  records?: Array<{ kind: EntityKind; operation: "create" | "update" | "delete"; name: string; startedAt?: string }>;
  /** As linhas de uma consulta. */
  result?: Pick<RequestQueryResult, "columns" | "rows" | "truncated">;
}

export interface LoopRound {
  round: number;
  calls: LoopCall[];
}

/**
 * As rodadas ja concluidas: cada passo de fallback que terminou abre uma rodada, e os passos que vem depois dele
 * (os passos ordenam por id, na ordem de criacao) sao as chamadas dela.
 */
export function loopRounds(steps: readonly StepRecord[], entities: readonly RequestEntityRecord[]): LoopRound[] {
  const rounds: LoopRound[] = [];
  for (const step of steps) {
    if (step.agent === "fallback") {
      if (step.status === "done") rounds.push({ round: step.input?.round ?? rounds.length + 1, calls: [] });
      continue;
    }
    if (step.status !== "done" && step.status !== "failed") continue;
    const records = entities.filter((entity) => entity.stepId === step.id).map((entity) => ({
      kind: entity.kind, operation: entity.operation, name: entity.summary.name,
      ...(entity.summary.startedAt ? { startedAt: entity.summary.startedAt } : {}),
    }));
    rounds.at(-1)?.calls.push({
      agent: step.agent,
      ...(step.input?.instruction ? { instruction: step.input.instruction } : {}),
      status: step.status,
      ...(step.errorCode ? { errorCode: step.errorCode } : {}),
      ...(records.length > 0 ? { records } : {}),
      ...(step.result
        ? { result: { columns: step.result.columns, rows: step.result.rows.slice(0, RESULT_ROWS), truncated: step.result.truncated || step.result.rows.length > RESULT_ROWS } }
        : {}),
    });
  }
  return rounds;
}

/** A parte variavel de uma rodada: o pedido, em que rodada esta e o que as rodadas anteriores fizeram. */
export function describeRound(request: string, round: number, history: readonly LoopRound[]): string {
  const last = round >= MAX_ROUNDS;
  return [
    request,
    "",
    `Rodada: ${round} de ${MAX_ROUNDS}`,
    ...(history.length > 0 ? ["", "Rodadas anteriores (JSON):", JSON.stringify(history).slice(0, HISTORY_CHARS)] : []),
    ...(last
      ? [
        "",
        "LIMITE DE RODADAS ATINGIDO. Os especialistas estão desativados: não chame nenhum.",
        "Responda só com `reply`: o que foi feito até aqui e, se algo ficou por fazer, o que faltou.",
      ]
      : []),
  ].join("\n");
}

/**
 * A proxima rodada, quando o pedido esta no laco e os especialistas da rodada atual terminaram. O ultimo passo
 * de fallback so esta concluido com o pedido aberto se ele chamou especialistas: a resposta final fecha o
 * pedido no mesmo ato.
 */
export function nextLoopRound(steps: readonly StepRecord[]): NewStep | undefined {
  const last = steps.filter((step) => step.agent === "fallback").at(-1);
  if (!last?.input?.round || last.status !== "done") return undefined;
  return { id: newOrderedId(), agent: "fallback", expected: "one", input: { round: last.input.round + 1 } };
}
