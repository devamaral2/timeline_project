import type { EventDto, RequestDto } from "@repo/contracts";
import { EventKindMark } from "@/components/events/event-kind-mark";
import { EventPriorityMark, eventPriorityLabels } from "@/components/events/event-priority-mark";
import { EventStatusGlyph, eventStatusName } from "@/components/events/event-status-glyph";
import { stepProgress, stepProgressLabel } from "@/lib/events/agent-request-model";
import styles from "./event-detail.module.css";

interface AgentEventHeaderProps {
  event: EventDto;
  request: RequestDto;
}

/**
 * O topo do evento de agente: o código do tipo, o título, o status do agente, a prioridade (só leitura) e
 * "N de M passos". Não há lápis nem troca de status: quem executa é o agente.
 */
export function AgentEventHeader({ event, request }: AgentEventHeaderProps) {
  return (
    <header className={styles.header}>
      <EventKindMark kind={event.kind} />
      <h1 className={styles.title}>{event.name}</h1>
      <div className={styles.chips}>
        <span className={styles.chip}>
          <span aria-hidden className={styles.glyph}><EventStatusGlyph actor="agent" status={request.status} size={16} /></span>
          {eventStatusName("agent", request.status)}
        </span>
        <span className={styles.chip}>
          <span aria-hidden className={styles.glyph}><EventPriorityMark priority={event.priority} /></span>
          {eventPriorityLabels[event.priority]}
        </span>
        <span className={styles.chip}>{stepProgressLabel(stepProgress(request.steps))}</span>
      </div>
    </header>
  );
}
