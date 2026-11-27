import { isOpenAgentStatus, isSuccessAgentStatus } from "@repo/contracts";
import type { AgentTaskStatus, AgentTraceEntryDto, TaskCardDto, RequestDto, RequestEntityDto } from "@repo/contracts";
import { artifactTypeLabel } from "@/lib/artifacts/artifact-model";

/**
 * O que o detalhe da tarefa de agente lê do pedido: se ainda está em aberto (e portanto se relê), a
 * contagem de passos feitos, o texto das entradas e o que o pedido produziu. Funções puras; a tela só as chama.
 */

/** De quanto em quanto tempo uma tela se relê enquanto há pedido de agente em aberto (detalhe e listas). */
export const AGENT_REQUEST_POLL_MS = 3000;

/** Pedido em fila, executando ou aguardando o usuário: a tela continua relendo. */
export function isOpenRequest(status: AgentTaskStatus): boolean {
  return isOpenAgentStatus(status);
}

/**
 * Há uma tarefa de agente em aberto nesta lista (fila, execução ou espera)? Só ele faz a lista se reler sozinha.
 * Tarefa de pessoa nunca conta, mesmo com status parecido.
 */
export function hasOpenAgentTask(cards: readonly TaskCardDto[]): boolean {
  return cards.some((card) => card.actor === "agent" && card.status !== undefined && isOpenRequest(card.status as AgentTaskStatus));
}

/** Quantos passos terminaram e quantos há no total. */
export function stepProgress(steps: RequestDto["steps"]): { done: number; total: number } {
  return { done: steps.filter((step) => isSuccessAgentStatus(step.status)).length, total: steps.length };
}

/** "2 de 4 passos", "1 de 1 passo", "0 de 0 passos". */
export function stepProgressLabel({ done, total }: { done: number; total: number }): string {
  return `${done} de ${total} ${total === 1 ? "passo" : "passos"}`;
}

/** O texto do passo que está executando agora, quando há um. */
export function runningStepLabel(request: Pick<RequestDto, "steps">): string | undefined {
  return request.steps.find((step) => step.status === "running")?.label;
}

/** O texto de uma entrada: o resumo que o servidor escreveu, ou o rótulo quando não há resumo. */
export function entryText(entry: AgentTraceEntryDto): string {
  return entry.summary ?? entry.label;
}

const OPERATION_LABELS: Record<RequestEntityDto["operation"], string> = { create: "criado", update: "alterado", delete: "apagado" };

/** "criado", "alterado" ou "apagado": o que o pedido fez com a entidade. */
export function entityOperationLabel(operation: RequestEntityDto["operation"]): string {
  return OPERATION_LABELS[operation];
}

/** "Tarefa", o tipo do artefato ("Texto", "Alimento"…) ou "Nota" quando o contrato não diz o tipo. */
export function entityKindLabel(entity: RequestEntityDto): string {
  if (entity.kind === "task") return "Tarefa";
  return entity.artifactType ? artifactTypeLabel(entity.artifactType) : "Nota";
}

/** Para onde leva a entidade: o detalhe da tarefa ou o da nota (aba Notas). */
export function entityHref(userId: string, entity: RequestEntityDto): string {
  return entity.kind === "task" ? `/${userId}/tarefas/${entity.id}` : `/${userId}/notas/${entity.id}`;
}
