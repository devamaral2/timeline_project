import { isOpenAgentStatus } from "@repo/contracts";
import type { AgentChatMessage, AgentChatPending } from "./use-agent-chat";

/** O que a linha de status diz de um pedido por passos antes de o servidor desdobrá-lo. */
const UNDERSTANDING = "Entendendo o pedido";

/**
 * O passo em que o pedido em andamento está, para a linha de status do campo (a conversa não mostra o andamento; os
 * passos todos ficam na aba "Processo"). No pedido por passos é o passo que roda, senão o próximo da fila, senão o
 * último. No Hermes e no modelo é a ferramenta ou o pensamento em curso, senão o último. Sem passo nenhum, o rótulo
 * do pedido ("Realizando processos", o nome do modelo) ou "Pensando".
 */
export function pendingStepLabel(messages: readonly AgentChatMessage[], pending: AgentChatPending): string {
  for (const message of messages) {
    if (message.role === "process" && message.id === `${pending.id}-process`) {
      const steps = message.request?.steps ?? [];
      const current = steps.find((step) => step.status === "running")
        ?? steps.find((step) => isOpenAgentStatus(step.status))
        ?? steps.at(-1);
      return current?.label ?? UNDERSTANDING;
    }
    if (message.role === "hermes-steps" && message.id === `${pending.id}-steps`) {
      const current = [...message.steps].reverse().find((step) => step.status === "running") ?? message.steps.at(-1);
      if (current) return current.label;
    }
  }
  return pending.label ?? "Pensando";
}
