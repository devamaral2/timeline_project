"use client";

import { EditRow, editStyles as edit } from "@/components/edit/edit-parts";
import type { TaskDraft, TaskDraftField } from "./task-draft";

interface TaskEditPersistentSectionProps {
  draft: TaskDraft;
  onChange: <K extends TaskDraftField>(field: K, value: TaskDraft[K]) => void;
}

const CHOICES: { value: boolean; label: string }[] = [
  { value: false, label: "Não" },
  { value: true, label: "Sim" },
];

/**
 * A linha "Tarefa persistente" de Informações: Não e Sim num controle só, como no
 * quadro "Detalhe · edição". Sim faz do evento um evento longo: a previsão de
 * entrega passa a ser o prazo, a recorrência some e o status é obrigatório. As
 * recusas são de `validateTaskDraft`, na hora de salvar; a linha só troca o campo.
 */
export function TaskEditPersistentSection({ draft, onChange }: TaskEditPersistentSectionProps) {
  return (
    <EditRow label="Tarefa persistente">
      <div className={edit.rowControls}>
        <div role="group" aria-label="Tarefa persistente" className={edit.segmented}>
          {CHOICES.map((choice) => (
            <button
              key={choice.label}
              type="button"
              aria-pressed={draft.longRunning === choice.value}
              className={edit.segment}
              onClick={() => onChange("longRunning", choice.value)}
            >
              {choice.label}
            </button>
          ))}
        </div>
      </div>
    </EditRow>
  );
}
