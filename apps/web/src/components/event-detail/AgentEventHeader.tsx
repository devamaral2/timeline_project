import type { TaskDto, RequestDto } from "@repo/contracts";
import { Bot } from "lucide-react";
import { EventKindMark } from "@/components/events/event-kind-mark";
import { EventStatusGlyph, eventStatusName } from "@/components/events/event-status-glyph";
import styles from "./event-detail.module.css";

interface AgentEventHeaderProps {
  event: TaskDto;
  request: RequestDto;
}

/**
 * O topo do evento de agente: o código do tipo, o título e o status do agente,
 * solto na linha (sem pílula), com o robô na ponta direita como assinatura, igual
 * à linha da agenda. Prioridade e "N de M passos" não aparecem aqui (os passos
 * têm a sua seção). Não há lápis nem troca de status: quem executa é o agente.
 */
export function AgentEventHeader({ event, request }: AgentEventHeaderProps) {
  return (
    <header className={styles.header}>
      <EventKindMark kind={event.kind} />
      <h1 className={styles.title}>{event.name}</h1>
      <div className={styles.chips}>
        <span className={styles.agentStatus}>
          <span aria-hidden className={styles.glyph}><EventStatusGlyph actor="agent" status={request.status} size={16} /></span>
          {eventStatusName("agent", request.status)}
        </span>
        <Bot className={styles.agentMark} size={20} strokeWidth={1.9} aria-hidden="true" data-agent-mark />
      </div>
    </header>
  );
}
