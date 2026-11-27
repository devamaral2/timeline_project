import type {
  AgentRequestKind,
  ProjectDto,
  AgentTraceDto,
  ModelSelection,
  RequestEditEntityType,
  RequestErrorCode,
  RequestQueryResult,
  RequestRoute,
  RequestScreenContext,
} from "@repo/contracts";
import type { AgentTaskStatus, Situation } from "../../domain/sets";
import type { EditCandidate } from "./request-candidates";
import type { DispatchRoute, EntityKind, Expected, RequestAgent, RequestJobKind } from "./request-steps";

export type RequestStatus = AgentTaskStatus;
export type StepStatus = Exclude<RequestStatus, "waiting">;

/** O que o pedido mostra de cada entidade que gravou, lido da propria entidade: nunca o texto bruto do pedido. */
export interface EntitySummary {
  name: string;
  taskKind?: string;
  artifactType?: string;
  startedAt?: string;
  estimatedFinishAt?: string;
  /** Inicio do texto do artefato. */
  text?: string;
  /** Ocorrencia de uma serie, ainda ligada a ela. */
  series?: boolean;
}

export interface EntityRef {
  kind: EntityKind;
  id: string;
}

/** Uma ligacao que a finalizacao aplicou: `from` pertence a `to` (o artefato à tarefa). */
export interface LinkRecord {
  from: EntityRef;
  to: EntityRef;
}

export interface FailedStep {
  agent: RequestAgent;
  errorCode: string;
}

/** O que o JEV de entrada escolheu: so escolhas, confiancas e medidas, nada do texto do usuario. */
export interface DispatchRecord {
  model?: string;
  latencyMs?: number;
  /** A resposta de cada pergunta de sim ou nao (`query`, `write`, `config`). */
  answers: Record<string, { choice: string; confidence: number; probability: number }>;
  /** As perguntas que deixaram o destino em duvida: um `yes` abaixo da certeza minima, ou mais de um `yes`. */
  uncertain: string[];
  /** O destino que o JEV escolheu. Ausente quando o pedido foi ao Hermes. */
  route?: DispatchRoute;
  /** Por que o pedido foi ao Hermes sem ser uma tarefa de agente: duvida, JEV fora do ar, prefixo `fallback:`. */
  fallbackReason?: string;
  /** Quantas entidades o servidor entregou ao agente de escrita como candidatas a alteracao. */
  candidates?: { shortlisted: number; selected: number };
  /** So em pedidos antigos: perguntas reconhecidas que nao tinham agente. */
  unsupported?: string[];
}

/** A entidade aberta na tela de detalhe quando o pedido de edicao foi feito. */
export interface RequestTarget {
  entityType: RequestEditEntityType;
  entityId: string;
}

/** Como um pedido termina. O texto vira a mensagem do agente; o raciocinio e o rastro viram entradas. */
export interface RequestOutcome {
  failedSteps?: FailedStep[];
  errorCode?: RequestErrorCode;
  /** A resposta do agente, ou o que falhou. */
  message?: string;
  /** O que o agente de explicacao pensou antes de escrever a mensagem. */
  thought?: string;
  /** O rastro que precisa sobreviver ao job (o do Hermes e o do modo modelo, que nao tem passos gravados). */
  trace?: AgentTraceDto;
}

export interface RequestRecord {
  id: string;
  userId: string;
  kind: AgentRequestKind;
  route: RequestRoute;
  status: RequestStatus;
  /** O nome da tarefa: o inicio do que o usuario pediu. */
  title: string;
  /** O projeto do pedido. */
  project: ProjectDto;
  /** O que o usuario decidiu do pedido; o fechamento grava `to_review`. Ausente enquanto o pedido esta aberto. */
  situation?: Situation;
  /** O que o usuario escreveu ou falou, inteiro. */
  prompt: string;
  context?: RequestScreenContext;
  target?: RequestTarget;
  /** O pedido veio com `fallback:`: o despacho nao pergunta ao JEV e o entrega direto ao Hermes. */
  forceFallback?: boolean;
  /** O primeiro pedido da sessao; ausente quando este e o primeiro. */
  sessionId?: string;
  /**
   * O provedor, o modelo e o esforco que o usuario escolheu: quem responde na rota `model` e quem roda os agentes
   * dos passos na rota `steps`. Ausente quando o pedido nao levou escolha (vale o modelo do servidor).
   */
  model?: ModelSelection;
  createdAt: Date;
  updatedAt: Date;
  finishedAt?: Date;
  dispatch?: DispatchRecord;
  failedSteps: FailedStep[];
  errorCode?: RequestErrorCode;
  /** A ultima mensagem do agente. */
  answer?: string;
  answerThought?: string;
  /** O rastro gravado quando o pedido terminou (rota do Hermes). */
  trace?: AgentTraceDto;
}

/** A entidade da tela de detalhe: o id e o retrato completo que o agente de edicao recebe. */
export interface EditTarget {
  entityType: RequestEditEntityType;
  id: string;
  snapshot: Record<string, unknown>;
}

/** O insumo de um passo: o que o despacho entrega a ele alem do pedido. */
export interface StepInput {
  /** Edicao pela tela de detalhe: o unico alvo permitido. Quando existe, nao ha candidatos nem consulta. */
  target?: EditTarget;
  candidates?: EditCandidate[];
}

/** O que o modelo pensou numa chamada do passo, para a aba "Processo" conferir. */
export interface StepThought {
  text: string;
  /** ISO 8601: quando a chamada voltou. */
  at: string;
  model?: string;
}

import type { TokenUsage } from "../agent/gateways/structured-completion.gateway";

export interface StepRecord {
  id: string;
  requestId: string;
  agent: RequestAgent;
  /** O rotulo predefinido do passo. */
  label: string;
  expected: Expected;
  status: StepStatus;
  errorCode?: string;
  input?: StepInput;
  result?: RequestQueryResult;
  startedAt?: Date;
  finishedAt?: Date;
  /** Quanto cada etapa do passo levou, em ms. */
  timings?: Record<string, number>;
  /** Um por chamada ao modelo que trouxe raciocinio, na ordem em que voltaram. */
  thoughts?: StepThought[];
  /** A soma dos tokens de todas as chamadas ao modelo do passo. */
  usage?: TokenUsage;
}

/** Uma tarefa ou artefato que o pedido tocou: a relacao que parte do passo (ou do proprio pedido, na voz). */
export interface RequestEntityRecord {
  requestId: string;
  kind: EntityKind;
  id: string;
  /** A tarefa de agente de onde a relacao parte. */
  stepId: string;
  operation: "create" | "update" | "delete";
  summary: EntitySummary;
  finalized: boolean;
  links: LinkRecord[];
}

export interface NewStep {
  id: string;
  agent: RequestAgent;
  expected: Expected;
  input?: StepInput;
}

export interface NewEntity {
  kind: EntityKind;
  id: string;
  operation: "create" | "update" | "delete";
}

export interface NewRequest {
  userId: string;
  route: Exclude<RequestRoute, "food">;
  /** O que o usuario escreveu ou falou. */
  text: string;
  context?: RequestScreenContext;
  target?: RequestTarget;
  forceFallback?: boolean;
  /** O primeiro pedido da sessao que este continua. */
  sessionId?: string;
  /** Estavel por mensagem: reenviar o mesmo id devolve o pedido ja aceito. */
  clientMessageId?: string;
  /** O provedor, o modelo e o esforco que o usuario escolheu para o pedido, em qualquer rota que use modelo. */
  model?: ModelSelection;
  /** O projeto escolhido para o pedido. Vale sobre o da sessao e sobre o da tarefa alvo; precisa ser do usuario. */
  projectId?: string;
  /** O job que comeca a executar o pedido. */
  job: RequestJobKind;
}

/**
 * Persistencia do pedido (ADR 0013): o pedido e cada passo sao tarefas de agente, o que se acrescenta a eles sao
 * entradas e o que um passo tocou sao relacoes partindo dele. Os metodos que recebem `tx` rodam na transacao do
 * escritor em lote (`EntityBatch.afterWrite`): o passo concluido e a finalizacao enfileirada existem se e somente
 * se as entidades existem.
 */
export interface RequestStore {
  /** Grava o pedido, a mensagem do usuario e o job que o executa, numa transacao so. */
  start(input: NewRequest): Promise<{ requestId: string; created: boolean }>;
  /** Um pedido, nunca um passo. */
  find(id: string): Promise<RequestRecord | undefined>;
  /** Os pedidos do usuario, do mais novo para o mais antigo. Passos nao entram. */
  list(userId: string, limit: number): Promise<RequestRecord[]>;
  /**
   * A sessao do chat: o primeiro pedido e as continuacoes, do mais antigo para o mais novo, so os `limit` mais
   * recentes. O modo modelo recebe as trocas anteriores daqui (ADR 0019).
   */
  sessionTurns(userId: string, sessionId: string, limit: number): Promise<RequestRecord[]>;
  steps(requestId: string): Promise<StepRecord[]>;
  entities(requestId: string): Promise<RequestEntityRecord[]>;
  /** O job comecou a trabalhar no pedido que nao se desdobra em passos (Hermes, modo modelo, voz, alimento). */
  markRunning(requestId: string): Promise<void>;
  /** Cria os passos e enfileira todos os jobs de uma vez; o pedido passa a `running`. */
  beginSteps(requestId: string, steps: readonly NewStep[], dispatch?: DispatchRecord): Promise<void>;
  markStepRunning(stepId: string): Promise<void>;
  /** Acrescenta ao passo o que o modelo pensou numa chamada. Vale assim que a chamada volta, com o passo em curso. */
  recordThought(stepId: string, thought: StepThought): Promise<void>;
  /** Soma ao passo os tokens de uma chamada ao modelo. */
  recordUsage(stepId: string, usage: TokenUsage): Promise<void>;
  recordStepSuccess(tx: unknown, input: {
    requestId: string;
    stepId: string;
    entities: readonly NewEntity[];
    timings: Record<string, number>;
  }): Promise<void>;
  /** O passo de consulta terminou: resultado guardado, passo concluido e finalizacao enfileirada, juntos. */
  recordQueryResult(input: { requestId: string; stepId: string; result: RequestQueryResult; timings: Record<string, number> }): Promise<void>;
  failStep(input: { requestId: string; stepId: string; errorCode: string; timings?: Record<string, number> }): Promise<void>;
  /** Marca a entidade como finalizada e guarda as ligacoes aplicadas. `tx` ausente abre a propria. */
  markFinalized(
    tx: unknown | undefined,
    entity: Pick<RequestEntityRecord, "kind" | "id" | "stepId">,
    links: readonly LinkRecord[],
  ): Promise<void>;
  /** Encerra o pedido se ele ainda esta aberto. */
  finish(requestId: string, status: "completed" | "failed", outcome: RequestOutcome): Promise<void>;
  /**
   * O pedido e uma tarefa de agente, ou caiu no fallback: passa para a rota do Hermes, guarda o que o despacho
   * escolheu e o job do Hermes entra na fila, na mesma transacao. Nada acontece se o pedido ja terminou.
   */
  handToHermes(requestId: string, dispatch: DispatchRecord): Promise<void>;
  /**
   * O pedido e de configuracao e passa para a rota do modo modelo: guarda o que o JEV escolheu e o modelo que
   * vai responder, e o turno do modelo entra na fila, na mesma transacao. Nada acontece se o pedido ja terminou.
   */
  handToModel(requestId: string, dispatch: DispatchRecord, model: ModelSelection): Promise<void>;
  /** A fala virou uma tarefa de pessoa: a relacao do pedido com ela e o pedido concluido, na transacao da tarefa. */
  completeVoice(tx: unknown, input: { requestId: string; taskId: string }): Promise<void>;
  /**
   * Cancela o pedido e os passos que nao terminaram. Devolve as tarefas cujos jobs vivos precisam ser
   * cancelados; vazio quando o pedido ja tinha terminado.
   */
  cancel(requestId: string): Promise<string[]>;
}
