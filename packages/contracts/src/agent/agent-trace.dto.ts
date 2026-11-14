/**
 * O rastro de um pedido a IA: tudo o que ela fez, em ordem, com o detalhe de cada passo. E o que a aba
 * "Processo" do chat mostra ao lado da conversa. As duas rotas falam a mesma forma: a rota por passos
 * (ADR 003) monta o rastro das entradas que o servidor gravou; o Hermes (ADR 004), dos eventos da execucao dele.
 *
 * Todo rotulo ja vem escrito pelo servidor: o cliente so desenha.
 */

/**
 * - `request`: o pedido que entrou;
 * - `routing`: a escolha de quais agentes o pedido aciona;
 * - `thought`: um raciocinio do modelo;
 * - `agent`: um agente ou subagente trabalhando;
 * - `tool`: uma ferramenta chamada;
 * - `message`: um comentario do modelo no meio do trabalho;
 * - `answer`: a resposta que fechou o pedido.
 */
export type AgentTraceKind = "request" | "routing" | "thought" | "agent" | "tool" | "message" | "answer";

export type AgentTraceStatus = "pending" | "running" | "done" | "failed";

/** Um par "Modelo: gpt-x" do resumo de um passo ou do pedido inteiro. */
export interface AgentTraceField {
  label: string;
  value: string;
}

/** Um bloco de texto do passo: a entrada, o resultado, o raciocinio. */
export interface AgentTraceSection {
  title: string;
  text: string;
  /** Comando, JSON ou saida de ferramenta: o cliente mostra em fonte mono, sem quebrar o alinhamento. */
  code?: boolean;
}

export interface AgentTraceEntryDto {
  id: string;
  kind: AgentTraceKind;
  /** "Pensou", "Executou um comando", "Criando eventos". */
  label: string;
  /** O nome tecnico por tras do rotulo: a ferramenta, o agente. */
  source?: string;
  /** Uma linha: o comando, o inicio do pensamento, o que saiu. */
  summary?: string;
  status: AgentTraceStatus;
  /** ISO 8601. Ausente quando o servidor nao sabe quando comecou. */
  startedAt?: string;
  durationMs?: number;
  fields?: AgentTraceField[];
  sections?: AgentTraceSection[];
  /** O registro como o servidor o tem, para a vista "Bruto". */
  raw?: unknown;
}

export interface AgentTraceDto {
  route: "steps" | "hermes";
  status: "running" | "done" | "failed";
  startedAt?: string;
  durationMs?: number;
  /** Totais do pedido: modelo, provedor, tokens. */
  fields: AgentTraceField[];
  entries: AgentTraceEntryDto[];
}
