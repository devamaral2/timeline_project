"use client";

import type { EventDto } from "@repo/contracts";
import { DetailFact, DetailFacts, DetailSection } from "@/components/detail/detail-parts";
import { useNow } from "@/lib/events/use-now";
import { elapsedLabel } from "@/lib/events/card-text";
import { momentLabel } from "@/lib/events/event-read-model";
import styles from "./event-detail.module.css";

/**
 * A seção "Informações" do evento de agente: o início, com o tempo decorrido, e a conclusão, ou "ainda não
 * concluído". Fim estimado e Job não entram: o contrato não traz esses dados.
 */
export function AgentInfoSection({ event }: { event: EventDto }) {
  const now = useNow();

  return (
    <DetailSection title="Informações" labelId="agent-info">
      <DetailFacts label="Informações">
        <DetailFact label="Início">
          {event.startedAt ? (
            <span className={styles.stack}>
              <span className={styles.value}>{momentLabel(event.startedAt)}</span>
              {now ? <span className={styles.sub}>{elapsedLabel(event.startedAt, now)}</span> : null}
            </span>
          ) : "sem data"}
        </DetailFact>
        <DetailFact label="Concluído">{event.finishedAt ? momentLabel(event.finishedAt) : "ainda não concluído"}</DetailFact>
      </DetailFacts>
    </DetailSection>
  );
}
