import type { TaskDto, RequestDto } from "@repo/contracts";
import { Bot } from "lucide-react";
import { TaskKindMark } from "@/components/tasks/task-kind-mark";
import { TaskStatusGlyph, taskStatusName } from "@/components/tasks/task-status-glyph";
import styles from "./task-detail.module.css";

interface AgentTaskHeaderProps {
  task: TaskDto;
  request: RequestDto;
}

/**
 * O topo do evento de agente: o código do tipo, o título e o status do agente,
 * solto na linha (sem pílula), com o robô na ponta direita como assinatura, igual
 * à linha da agenda. Prioridade e "N de M passos" não aparecem aqui (os passos
 * têm a sua seção). Não há lápis nem troca de status: quem executa é o agente.
 */
export function AgentTaskHeader({ task, request }: AgentTaskHeaderProps) {
  return (
    <header className={styles.header}>
      <TaskKindMark kind={task.kind} />
      <h1 className={styles.title}>{task.name}</h1>
      <div className={styles.chips}>
        <span className={styles.agentStatus}>
          <span aria-hidden className={styles.glyph}><TaskStatusGlyph actor="agent" status={request.status} size={16} /></span>
          {taskStatusName("agent", request.status)}
        </span>
        <Bot className={styles.agentMark} size={20} strokeWidth={1.9} aria-hidden="true" data-agent-mark />
      </div>
    </header>
  );
}
