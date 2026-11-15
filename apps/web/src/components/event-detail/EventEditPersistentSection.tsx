"use client";

import { DetailSection } from "@/components/detail/detail-parts";
import type { EventDraft, EventDraftField } from "./event-draft";
import styles from "./event-edit-persistent.module.css";

interface EventEditPersistentSectionProps {
  draft: EventDraft;
  onChange: <K extends EventDraftField>(field: K, value: EventDraft[K]) => void;
}

const CHOICES: { value: boolean; label: string }[] = [
  { value: false, label: "Não" },
  { value: true, label: "Sim" },
];

/**
 * "Tarefa persistente": Não e Sim num controle só, como no quadro "Evento-pessoa".
 * Sim faz do evento um evento longo: a previsão de entrega passa a ser o prazo, a
 * recorrência some e o status é obrigatório. As recusas são de `validateEventDraft`,
 * na hora de salvar; esta seção só troca o campo.
 */
export function EventEditPersistentSection({ draft, onChange }: EventEditPersistentSectionProps) {
  return (
    <DetailSection title="Tarefa persistente" labelId="event-edit-persistent">
      <div role="group" aria-label="Tarefa persistente" className={styles.choice}>
        {CHOICES.map((choice) => (
          <button
            key={choice.label}
            type="button"
            aria-pressed={draft.longRunning === choice.value}
            className={styles.option}
            onClick={() => onChange("longRunning", choice.value)}
          >
            {choice.label}
          </button>
        ))}
      </div>
    </DetailSection>
  );
}
