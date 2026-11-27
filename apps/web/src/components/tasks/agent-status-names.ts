import type { AgentTaskStatus } from "@repo/contracts";

/** Os dez nomes de status de agente (na lista e no detalhe). */
export const agentStatusNames: Record<AgentTaskStatus, string> = {
  preparing: "Preparando",
  queued: "Na fila",
  starting: "Iniciando",
  running: "Trabalhando",
  waiting: "Esperando",
  completed: "Concluído",
  interrupted: "Interrompido",
  failed: "Falhou",
  cancelled: "Cancelado",
  rolled_back: "Revertido",
};

/** O nome que um leitor de tela anuncia para o ícone: "Agente, na fila". */
export function agentStatusAccessibleName(status: AgentTaskStatus): string {
  return `Agente, ${agentStatusNames[status].toLowerCase()}`;
}
