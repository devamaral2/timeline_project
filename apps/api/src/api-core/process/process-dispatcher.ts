import { Logger } from "@nestjs/common";
import {
  isAccepted, JevProcessClient, JevUnavailableError, type JevAnswer, type JevResult,
} from "./jev-process.client";
import { describeCandidate, type CandidateQuery, type EditCandidate } from "./process-candidates";
import { candidatesConfig, dispatchConfig, type ChoiceQuestion } from "./process-config";
import type { NewStep, ProcessRecord, ProcessStore } from "./process-store";
import { DISPATCH_STEPS, EDIT_AGENTS, newStepId, EDIT_SELECTOR, selects, type EditAgent, type Expected } from "./process-steps";
import { formatNow } from "../agent/time";

export interface DispatchRecord {
  model?: string;
  latencyMs?: number;
  /** So escolhas e confiancas: nada do texto do usuario. */
  answers: Record<string, { choice: string; confidence: number; probability: number }>;
  uncertain: string[];
  unsupported: string[];
  fallbackReason?: string;
  /** Quantos candidatos de edicao o servidor listou e quantos o JEV escolheu. */
  candidates?: { shortlisted: number; selected: number };
}

/**
 * O JEV de entrada: uma chamada, uma pergunta por operacao x entidade. Cada resposta diferente de "nenhum"
 * vira um passo na fila propria, todos de uma vez. Pedido sem passo reconhecido, ou com resposta incerta,
 * vai ao fallback.
 */
export class ProcessDispatcher {
  private readonly logger = new Logger(ProcessDispatcher.name);

  constructor(
    private readonly store: ProcessStore,
    private readonly jev: JevProcessClient,
    private readonly candidates?: CandidateQuery,
  ) {}

  async run(processId: string, signal?: AbortSignal): Promise<void> {
    const process = await this.store.find(processId);
    if (process?.status !== "dispatching") return;

    let result: JevResult;
    try {
      result = await this.jev.ask(dispatchConfig, {
        message: process.prompt,
        screen: process.context ?? null,
        now: process.createdAt.toISOString(),
        nowLocal: formatNow(process.createdAt),
      }, dispatchConfig.questions, signal);
    } catch (error) {
      if (signal?.aborted) throw error;
      const reason = error instanceof JevUnavailableError ? `jev_${error.reason}` : "jev_error";
      this.logger.warn(`process=${processId} JEV de entrada falhou (${reason}); indo ao fallback`);
      await this.fallback(processId, { answers: {}, uncertain: [], unsupported: [], fallbackReason: reason });
      return;
    }

    const record: DispatchRecord = {
      model: result.model, latencyMs: result.latencyMs, answers: {}, uncertain: [], unsupported: [],
    };
    const steps: NewStep[] = [];
    for (const name of Object.keys(dispatchConfig.questions)) {
      const answer: JevAnswer | undefined = result.answers[name];
      if (answer) record.answers[name] = answer;
      if (!isAccepted(answer, dispatchConfig.minCertainty)) {
        record.uncertain.push(name);
        continue;
      }
      const wanted = name === "query" ? answer.choice === "yes" : answer.choice !== "none";
      if (!wanted) continue;
      const agent = DISPATCH_STEPS[name];
      if (!agent) {
        record.unsupported.push(name);
        continue;
      }
      steps.push({ id: newStepId(), agent, expected: (answer.choice === "many" ? "many" : "one") satisfies Expected });
    }

    const mustFallback = steps.length === 0
      || record.unsupported.length > 0
      || (dispatchConfig.uncertainPolicy === "fallback" && record.uncertain.length > 0);
    if (mustFallback) {
      record.fallbackReason = steps.length === 0 && record.uncertain.length === 0 && record.unsupported.length === 0
        ? "no_step"
        : record.unsupported.length > 0 ? "unsupported" : "uncertain";
      this.logDispatch(processId, record, steps, "fallback");
      await this.fallback(processId, record);
      return;
    }
    const edits = steps.filter((step): step is NewStep & { agent: EditAgent } =>
      (EDIT_AGENTS as readonly string[]).includes(step.agent));
    if (edits.length > 0) await this.attachCandidates(process, edits, record, signal);
    this.logDispatch(processId, record, steps, "steps");
    await this.store.beginSteps(processId, steps, record);
  }

  /**
   * Um bloco por despacho: uma linha por pergunta com a resposta do JEV e o que o servidor fez com ela
   * (passo, ignorada, incerta, sem passo). So escolhas, confiancas e nomes de passos — o texto do pedido nao
   * vai para o log.
   */
  private logDispatch(processId: string, record: DispatchRecord, steps: readonly NewStep[], outcome: "steps" | "fallback"): void {
    const names = Object.keys(dispatchConfig.questions);
    const width = Math.max(...names.map((name) => name.length));
    const rows = names.map((name) => {
      const answer = record.answers[name];
      const verdict = record.uncertain.includes(name) ? "incerta"
        : record.unsupported.includes(name) ? "sem passo"
          : answer && (name === "query" ? answer.choice === "yes" : answer.choice !== "none") ? "-> passo" : "ignorada";
      const given = answer
        ? `${answer.choice.padEnd(5)} conf ${answer.confidence.toFixed(2)}  prob ${answer.probability.toFixed(2)}`
        : "sem resposta";
      return `    ${name.padEnd(width)}  ${given.padEnd(30)}  ${verdict}`;
    });
    const result = outcome === "steps"
      ? `passos: ${steps.map((step) => `${step.agent} (${step.expected})`).join(", ")}`
      : `fallback: ${record.fallbackReason}`;
    const lines = [
      `process=${processId}  JEV de entrada  modelo=${record.model ?? "?"}  ${record.latencyMs ?? "?"}ms  minCertainty=${dispatchConfig.minCertainty}`,
      ...rows,
      `  => ${result}`,
    ];
    if (record.candidates) lines.push(`  => candidatos de edicao: ${record.candidates.selected} de ${record.candidates.shortlisted}`);
    this.logger.log(lines.join("\n"));
  }

  /**
   * Segunda etapa, so quando ha edicao: o servidor lista os candidatos provaveis e o JEV escolhe quais o
   * pedido altera (uma pergunta binaria por candidato, em paralelo). Falha aqui nao derruba o passo: sem
   * candidatos, o agente de edicao ainda pode buscar por uma consulta.
   */
  private async attachCandidates(
    process: ProcessRecord,
    edits: ReadonlyArray<NewStep & { agent: EditAgent }>,
    record: DispatchRecord,
    signal?: AbortSignal,
  ): Promise<void> {
    if (!this.candidates) return;
    let shortlist: EditCandidate[];
    try {
      shortlist = await this.candidates.shortlist({
        userId: process.userId, now: process.createdAt, kinds: [...new Set(edits.map((step) => EDIT_SELECTOR[step.agent].kind))],
      });
    } catch (error) {
      this.logger.warn(`process=${process.id} lista de candidatos falhou: ${error instanceof Error ? error.message : String(error)}`);
      return;
    }
    record.candidates = { shortlisted: shortlist.length, selected: 0 };
    if (shortlist.length === 0) return;

    const { instructions, criteria } = candidatesConfig.question;
    const questions: Record<string, ChoiceQuestion> = {};
    shortlist.forEach((candidate, index) => {
      questions[`c${index + 1}`] = {
        type: "choice", criteria, instructions: `${instructions}\n\nEntidade: ${describeCandidate(candidate)}`,
      };
    });
    let chosen: EditCandidate[];
    try {
      const result = await this.jev.ask(candidatesConfig, {
        message: process.prompt, screen: process.context ?? null,
        now: process.createdAt.toISOString(), nowLocal: formatNow(process.createdAt),
      }, questions, signal);
      chosen = shortlist.filter((_, index) => {
        const answer = result.answers[`c${index + 1}`];
        return isAccepted(answer, candidatesConfig.minCertainty) && answer.choice === "edit";
      });
    } catch (error) {
      if (signal?.aborted) throw error;
      this.logger.warn(`process=${process.id} JEV de candidatos falhou; edicao segue sem candidatos`);
      return;
    }
    record.candidates.selected = chosen.length;
    for (const step of edits) {
      step.input = { candidates: chosen.filter((candidate) => selects(step.agent, candidate)) };
    }
  }

  private async fallback(processId: string, record: DispatchRecord): Promise<void> {
    await this.store.beginSteps(processId, [{ id: newStepId(), agent: "fallback", expected: "one" }], record);
  }
}
