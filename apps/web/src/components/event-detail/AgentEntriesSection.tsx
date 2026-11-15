"use client";

import type { AgentTraceEntryDto } from "@repo/contracts";
import { formatTime } from "@repo/timeline";
import { DetailSection } from "@/components/detail/detail-parts";
import { KIND_NAMES } from "@/components/hub/agent-trace";
import { entryText } from "@/lib/events/agent-request-model";
import styles from "./agent-event-detail.module.css";

/**
 * A seção "Entradas" do pedido: o rastro em ordem, cada entrada com o tipo, a hora e o texto. Só se lê; a
 * entrada não é editada. Sem rastro (ou sem entradas), a seção não aparece.
 */
export function AgentEntriesSection({ entries }: { entries: AgentTraceEntryDto[] }) {
  if (entries.length === 0) return null;

  return (
    <DetailSection title="Entradas" count={entries.length} labelId="agent-entries">
      <ol className={styles.entries} aria-label="Entradas do pedido">
        {entries.map((entry) => (
          <li key={entry.id} className={styles.entry} data-kind={entry.kind}>
            <div className={styles.entryHead}>
              <span className={styles.entryKind}>{KIND_NAMES[entry.kind]}</span>
              {entry.source ? <span className={styles.entrySource}>{entry.source}</span> : null}
              {entry.startedAt ? <time className={styles.entryTime} dateTime={entry.startedAt}>{formatTime(entry.startedAt)}</time> : null}
            </div>
            <p className={styles.entryText}>{entryText(entry)}</p>
          </li>
        ))}
      </ol>
    </DetailSection>
  );
}
