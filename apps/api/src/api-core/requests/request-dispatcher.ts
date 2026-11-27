import { Logger } from "@nestjs/common";
import type { ModelSelection } from "@repo/contracts";
import { isAccepted, JevUnavailableError, type JevClient, type JevResult } from "./jev.client";
import type { CandidateQuery } from "./request-candidates";
import { dispatchConfig } from "./request-config";
import type { DispatchRecord, NewStep, RequestRecord, RequestStore } from "./request-store";
import { newOrderedId } from "../../infrastructure/persistence/requests/request-rows";
import { CANDIDATE_KINDS, DISPATCH_ROUTES, ENTITY_AGENT, type DispatchRoute } from "./request-steps";
import { formatNow } from "../agent/time";

export interface RequestDispatcherOptions {
  /** A lista curta das entidades que o agente de escrita pode alterar. Sem ela, ele so cria ou busca por consulta. */
  candidates?: CandidateQuery;
  /**
   * O modelo padrao que responde um pedido de configuracao deste usuario; nada quando o modo modelo nao vale para
   * ele. O pedido que ja traz a escolha do usuario usa a dele no lugar do padrao.
   */
  model?: (userId: string) => Promise<ModelSelection | undefined>;
}

/**
 * O JEV de entrada: uma chamada com tres perguntas de sim ou nao, e so elas. Um unico `yes` certo escolhe o destino:
 *
 * - `query`: o pedido so consulta o banco. Um passo do agente de consulta.
 * - `write`: o pedido so cria ou atualiza entidades. Um passo do agente de escrita, que recebe a lista curta do que
 *   ja existe e decide sozinho o que criar, o que alterar e o que ligar.
 * - `config`: o pedido trata da configuracao do app, do modelo ou do provedor. Passa para a rota do modo modelo.
 *
 * Sem nenhum `yes`, o pedido e uma tarefa de agente e passa para a rota do Hermes. Um `yes` incerto, mais de um
 * `yes`, JEV fora do ar ou modo modelo indisponivel tambem vao ao Hermes, como fallback (ADR 0018). Um pedido
 * escrito como `fallback: <pedido>` vai direto ao Hermes, sem a chamada ao JEV.
 */
export class RequestDispatcher {
  private readonly logger = new Logger(RequestDispatcher.name);

  constructor(
    private readonly store: RequestStore,
    private readonly jev: JevClient,
    private readonly options: RequestDispatcherOptions = {},
  ) {}

  async run(requestId: string, signal?: AbortSignal): Promise<void> {
    const request = await this.store.find(requestId);
    // So o pedido que ainda nao tem destino: uma nova tentativa depois da entrega nao despacha de novo.
    if (request?.status !== "preparing") return;

    // `fallback: <pedido>`: quem pediu ja escolheu o caminho; o JEV nem e consultado.
    if (request.forceFallback) {
      this.logger.log(`request=${requestId} fallback pedido pelo prefixo; JEV de entrada pulado, direto ao Hermes`);
      await this.store.handToHermes(requestId, { answers: {}, uncertain: [], fallbackReason: "forced" });
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
      this.logger.warn(`request=${requestId} JEV de entrada falhou (${reason}); indo ao Hermes`);
      await this.store.handToHermes(requestId, { answers: {}, uncertain: [], fallbackReason: reason });
      return;
    }

    const record: DispatchRecord = { model: result.model, latencyMs: result.latencyMs, answers: {}, uncertain: [] };
    for (const name of DISPATCH_ROUTES) {
      const answer = result.answers[name];
      if (answer) record.answers[name] = { choice: answer.choice, confidence: answer.confidence, probability: answer.probability };
    }

    const route = this.routeOf(result, record);
    if (!route) {
      await this.toHermes(requestId, record, record.uncertain.length > 0 ? "uncertain" : undefined);
      return;
    }
    record.route = route;
    switch (route) {
      case "query":
        await this.begin(requestId, record, { id: newOrderedId(), agent: "query", expected: "one" });
        return;
      case "write": {
        const step: NewStep = { id: newOrderedId(), agent: ENTITY_AGENT, expected: "many" };
        await this.attachCandidates(request, step, record);
        await this.begin(requestId, record, step);
        return;
      }
      case "config": {
        const standard = await this.options.model?.(request.userId);
        const model = standard && (request.model ?? standard);
        if (!model) {
          await this.toHermes(requestId, record, "model_unavailable");
          return;
        }
        this.logDispatch(requestId, record, `modo modelo: ${model.provider} ${model.model}`);
        await this.store.handToModel(requestId, record, model);
        return;
      }
    }
  }

  /**
   * O destino e a unica pergunta respondida `yes`, quando a resposta passa da certeza minima. Mais de um `yes`, ou
   * um `yes` incerto, deixa o destino em duvida (as perguntas ficam em `uncertain`); nenhum `yes` e o Hermes.
   */
  private routeOf(result: JevResult, record: DispatchRecord): DispatchRoute | undefined {
    const yes = DISPATCH_ROUTES.filter((name) => result.answers[name]?.choice === "yes");
    const [only] = yes;
    if (!only) return undefined;
    if (yes.length === 1 && isAccepted(result.answers[only], dispatchConfig.minCertainty)) return only;
    record.uncertain.push(...yes);
    return undefined;
  }

  /**
   * O agente de escrita recebe a lista curta do que o pedido pode estar alterando: tarefas, artefatos e series. Quem
   * escolhe dentro dela e ele. Falha aqui nao derruba o passo: sem a lista, ele ainda pode buscar por uma consulta.
   */
  private async attachCandidates(request: RequestRecord, step: NewStep, record: DispatchRecord): Promise<void> {
    if (!this.options.candidates) return;
    try {
      const shortlist = await this.options.candidates.shortlist({
        userId: request.userId, now: request.createdAt, kinds: CANDIDATE_KINDS,
      });
      record.candidates = { shortlisted: shortlist.length, selected: shortlist.length };
      if (shortlist.length > 0) step.input = { candidates: shortlist };
    } catch (error) {
      this.logger.warn(`request=${request.id} lista de candidatos falhou: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async begin(requestId: string, record: DispatchRecord, step: NewStep): Promise<void> {
    this.logDispatch(requestId, record, `passo: ${step.agent}`);
    await this.store.beginSteps(requestId, [step], record);
  }

  /** O pedido passa para a rota do Hermes: como tarefa de agente ou, com `reason`, como fallback. */
  private async toHermes(requestId: string, record: DispatchRecord, reason?: string): Promise<void> {
    if (reason) record.fallbackReason = reason;
    this.logDispatch(requestId, record, reason ? `hermes (fallback: ${reason})` : "hermes: tarefa de agente");
    await this.store.handToHermes(requestId, record);
  }

  /**
   * Um bloco por despacho: uma linha por pergunta com a resposta do JEV e o que o servidor fez com ela. So
   * escolhas, confiancas e nomes: o texto do pedido nao vai para o log.
   */
  private logDispatch(requestId: string, record: DispatchRecord, outcome: string): void {
    const width = Math.max(...DISPATCH_ROUTES.map((name) => name.length));
    const rows = DISPATCH_ROUTES.map((name) => {
      const answer = record.answers[name];
      const verdict = record.uncertain.includes(name) ? "incerta" : name === record.route ? "destino" : "";
      const given = answer
        ? `${answer.choice.padEnd(3)} conf ${answer.confidence.toFixed(2)}  prob ${answer.probability.toFixed(2)}`
        : "sem resposta";
      return `    ${name.padEnd(width)}  ${given.padEnd(28)}  ${verdict}`.trimEnd();
    });
    const lines = [
      `request=${requestId}  JEV de entrada  modelo=${record.model ?? "?"}  ${record.latencyMs ?? "?"}ms  minCertainty=${dispatchConfig.minCertainty}`,
      ...rows,
      `  => ${outcome}`,
    ];
    if (record.candidates) lines.push(`  => candidatos para o agente de escrita: ${record.candidates.shortlisted}`);
    this.logger.log(lines.join("\n"));
  }
}
