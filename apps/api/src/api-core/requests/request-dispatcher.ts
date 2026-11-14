import { Logger } from "@nestjs/common";
import { isAccepted, JevUnavailableError, type JevAnswer, type JevClient, type JevResult } from "./jev.client";
import { describeCandidate, type CandidateQuery, type EditCandidate } from "./request-candidates";
import { candidatesConfig, dispatchConfig, type ChoiceQuestion } from "./request-config";
import type { DispatchRecord, NewStep, RequestRecord, RequestStore } from "./request-store";
import { newOrderedId } from "../../infrastructure/persistence/requests/request-rows";
import { DISPATCH_STEPS, EDIT_AGENTS, EDIT_SELECTOR, isAgent, type EditAgent, type Expected } from "./request-steps";
import { formatNow } from "../agent/time";

/**
 * O JEV de entrada: uma chamada, uma pergunta por operacao x entidade. Cada resposta diferente de "nenhum"
 * vira um passo na fila propria, todos de uma vez. Pedido sem passo reconhecido, ou com resposta incerta,
 * vai ao fallback. Um pedido escrito como `fallback: <pedido>` vai direto ao fallback, sem a chamada ao JEV, e
 * so nesse caso o fallback roda em laco (`request-fallback-loop.ts`): o passo ja nasce na rodada 1.
 */
export class RequestDispatcher {
  private readonly logger = new Logger(RequestDispatcher.name);

  constructor(
    private readonly store: RequestStore,
    private readonly jev: JevClient,
    private readonly candidates?: CandidateQuery,
  ) {}

  async run(requestId: string, signal?: AbortSignal): Promise<void> {
    const request = await this.store.find(requestId);
    if (request?.status !== "queued") return;

    // `fallback: <pedido>`: quem pediu ja escolheu o caminho; o JEV nem e consultado.
    if (request.forceFallback) {
      this.logger.log(`request=${requestId} fallback pedido pelo prefixo; JEV de entrada pulado`);
      await this.fallback(requestId, { answers: {}, uncertain: [], unsupported: [], fallbackReason: "forced" }, true);
      return;
    }

    let result: JevResult;
    try {
      result = await this.jev.ask(dispatchConfig, {
        message: request.prompt,
        screen: request.context ?? null,
        now: request.createdAt.toISOString(),
        nowLocal: formatNow(request.createdAt),
      }, dispatchConfig.questions, signal);
    } catch (error) {
      if (signal?.aborted) throw error;
      const reason = error instanceof JevUnavailableError ? `jev_${error.reason}` : "jev_error";
      this.logger.warn(`request=${requestId} JEV de entrada falhou (${reason}); indo ao fallback`);
      await this.fallback(requestId, { answers: {}, uncertain: [], unsupported: [], fallbackReason: reason });
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
      steps.push({ id: newOrderedId(), agent, expected: (answer.choice === "many" ? "many" : "one") satisfies Expected });
    }

    const mustFallback = steps.length === 0
      || record.unsupported.length > 0
      || (dispatchConfig.uncertainPolicy === "fallback" && record.uncertain.length > 0);
    if (mustFallback) {
      record.fallbackReason = steps.length === 0 && record.uncertain.length === 0 && record.unsupported.length === 0
        ? "no_step"
        : record.unsupported.length > 0 ? "unsupported" : "uncertain";
      this.logDispatch(requestId, record, steps, "fallback");
      await this.fallback(requestId, record);
      return;
    }
    const edits = steps.filter((step): step is NewStep & { agent: EditAgent } => isAgent(EDIT_AGENTS, step.agent));
    if (edits.length > 0) await this.attachCandidates(request, edits, record, signal);
    this.logDispatch(requestId, record, steps, "steps");
    await this.store.beginSteps(requestId, steps, record);
  }

  /**
   * Um bloco por despacho: uma linha por pergunta com a resposta do JEV e o que o servidor fez com ela
   * (passo, ignorada, incerta, sem passo). So escolhas, confiancas e nomes de passos — o texto do pedido nao
   * vai para o log.
   */
  private logDispatch(requestId: string, record: DispatchRecord, steps: readonly NewStep[], outcome: "steps" | "fallback"): void {
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
      `request=${requestId}  JEV de entrada  modelo=${record.model ?? "?"}  ${record.latencyMs ?? "?"}ms  minCertainty=${dispatchConfig.minCertainty}`,
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
    request: RequestRecord,
    edits: ReadonlyArray<NewStep & { agent: EditAgent }>,
    record: DispatchRecord,
    signal?: AbortSignal,
  ): Promise<void> {
    if (!this.candidates) return;
    let shortlist: EditCandidate[];
    try {
      shortlist = await this.candidates.shortlist({
        userId: request.userId, now: request.createdAt, kinds: [...new Set(edits.map((step) => EDIT_SELECTOR[step.agent]))],
      });
    } catch (error) {
      this.logger.warn(`request=${request.id} lista de candidatos falhou: ${error instanceof Error ? error.message : String(error)}`);
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
        message: request.prompt, screen: request.context ?? null,
        now: request.createdAt.toISOString(), nowLocal: formatNow(request.createdAt),
      }, questions, signal);
      chosen = shortlist.filter((_, index) => {
        const answer = result.answers[`c${index + 1}`];
        return isAccepted(answer, candidatesConfig.minCertainty) && answer.choice === "edit";
      });
    } catch (error) {
      if (signal?.aborted) throw error;
      this.logger.warn(`request=${request.id} JEV de candidatos falhou; edicao segue sem candidatos`);
      return;
    }
    record.candidates.selected = chosen.length;
    for (const step of edits) {
      step.input = { candidates: chosen.filter((candidate) => candidate.kind === EDIT_SELECTOR[step.agent]) };
    }
  }

  private async fallback(requestId: string, record: DispatchRecord, loop = false): Promise<void> {
    await this.store.beginSteps(requestId, [{
      id: newOrderedId(), agent: "fallback", expected: "one", ...(loop ? { input: { round: 1 } } : {}),
    }], record);
  }
}
