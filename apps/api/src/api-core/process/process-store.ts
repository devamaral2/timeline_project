import type { AgentScreenContext } from "@repo/contracts";
import type { EditCandidate } from "./process-candidates";
import type { EntityKind, Expected, ProcessAgent } from "./process-steps";

export type ProcessStatus = "dispatching" | "running" | "completed" | "failed";
export type StepStatus = "pending" | "running" | "succeeded" | "failed";

/** O que a finalizacao mostra ao JEV sobre uma entidade: nunca o texto bruto do pedido. */
export interface EntitySummary {
  name: string;
  eventKind?: string;
  noteType?: string;
  startedAt?: string;
  finishedAt?: string;
  /** Inicio do texto da nota, para o JEV casar alimentos e assunto. */
  text?: string;
  /** Primeira ocorrencia de uma serie: nao entra nos vinculos, que valem para a serie e nao para um dia. */
  series?: boolean;
}

export interface LinkRecord {
  from: { kind: EntityKind; id: string };
  to: { kind: EntityKind; id: string };
}

export interface ProcessResponse {
  failedSteps: Array<{ agent: ProcessAgent; errorCode: string }>;
  /** Resposta do fallback (pedido sem relacao com as entidades). */
  text?: string;
  /** O que falhou, dito pelo agente de explicacao; so existe quando algum passo falhou. */
  explanation?: string;
}

export interface ProcessRecord {
  id: string;
  userId: string;
  actorId: string;
  prompt: string;
  context?: AgentScreenContext;
  status: ProcessStatus;
  response?: ProcessResponse;
  createdAt: Date;
}

/** O que o dispatcher entrega a um passo alem do pedido: as entidades que o JEV escolheu para editar. */
export interface StepInput {
  candidates?: EditCandidate[];
  /** O foco que o fallback deu ao especialista que ele chamou; o pedido inteiro segue junto. */
  instruction?: string;
}

/** O resultado de uma consulta: linhas limitadas, para a caixa de processo mostrar. */
export interface QueryResult {
  columns: string[];
  rows: unknown[][];
  truncated: boolean;
}

export interface StepRecord {
  id: string;
  processId: string;
  agent: ProcessAgent;
  expected: Expected;
  status: StepStatus;
  errorCode?: string;
  input?: StepInput;
  result?: QueryResult;
}

export interface ProcessEntityRecord {
  processId: string;
  kind: EntityKind;
  id: string;
  stepId: string;
  operation: "create" | "update";
  summary: EntitySummary;
  finalized: boolean;
  links: LinkRecord[];
}

export interface NewStep {
  id: string;
  agent: ProcessAgent;
  expected: Expected;
  input?: StepInput;
}

export interface NewEntity {
  kind: EntityKind;
  id: string;
  operation: "create" | "update";
  summary: EntitySummary;
}

/**
 * Persistencia do processo. Os metodos que recebem `tx` rodam na transacao do escritor em lote
 * (`EntityBatch.afterWrite`): o passo concluido e a finalizacao enfileirada existem se e somente se
 * as entidades existem.
 */
export interface ProcessStore {
  /** Grava o processo e enfileira o despacho, numa transacao so. */
  start(input: {
    id: string;
    userId: string;
    actorId: string;
    prompt: string;
    context?: AgentScreenContext;
  }): Promise<void>;
  find(id: string): Promise<ProcessRecord | undefined>;
  steps(processId: string): Promise<StepRecord[]>;
  entities(processId: string): Promise<ProcessEntityRecord[]>;
  /** Cria os passos e enfileira todos os jobs de uma vez; o processo passa a `running`. */
  beginSteps(processId: string, steps: readonly NewStep[], dispatch: unknown): Promise<void>;
  markStepRunning(stepId: string): Promise<void>;
  recordStepSuccess(tx: unknown, input: {
    processId: string;
    stepId: string;
    entities: readonly NewEntity[];
    timings: Record<string, number>;
  }): Promise<void>;
  /** O passo de consulta terminou: resultado guardado, passo concluido e finalizacao enfileirada, juntos. */
  recordQueryResult(input: { processId: string; stepId: string; result: QueryResult; timings: Record<string, number> }): Promise<void>;
  failStep(input: { processId: string; stepId: string; errorCode: string; timings?: Record<string, number> }): Promise<void>;
  /** Marca a entidade como finalizada e acrescenta os vinculos aplicados. `tx` ausente abre a propria. */
  markFinalized(
    tx: unknown | undefined,
    processId: string,
    entity: { kind: EntityKind; id: string },
    links: readonly LinkRecord[],
  ): Promise<void>;
  /** Encerra o processo se ele ainda esta aberto. */
  finish(processId: string, status: "completed" | "failed", response: ProcessResponse): Promise<void>;
  /**
   * O fallback chamou especialistas: os passos novos e seus jobs entram e o passo do fallback termina, na
   * mesma transacao. O processo nao fecha no meio: os passos novos ja existem quando o fallback termina.
   */
  handOff(processId: string, fallbackStepId: string, steps: readonly NewStep[]): Promise<void>;
  /** O fallback respondeu: passo concluido e processo encerrado, juntos. */
  finishFallback(processId: string, stepId: string, text: string): Promise<void>;
}
