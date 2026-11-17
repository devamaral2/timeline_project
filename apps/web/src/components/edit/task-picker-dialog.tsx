"use client";

import type { TaskCardDto } from "@repo/contracts";
import { EntityPickerDialog } from "./EntityPickerDialog";
import { TaskChoiceView, searchTrackedTasks } from "./task-choice";
import { TaskCreateActions } from "./task-create-actions";

interface TaskPickerDialogProps {
  title: string;
  searchLabel: string;
  /** Os ids que a busca não oferece: a tarefa aberta e as que já estão ligadas. */
  excluded: readonly string[];
  now: Date | null;
  /** Quem pede ao Hermes. Sem ele, o rodapé só oferece a criação manual. */
  userId?: string;
  /** As tarefas que entram: uma escolhida na busca, ou as que a criação fez. */
  onPick: (cards: TaskCardDto[]) => void;
  onClose: () => void;
}

/**
 * O modal de seleção de tarefas da hierarquia: a busca na lista de tarefas (de pessoa e de agente) e, embaixo, a
 * criação de uma tarefa nova com o texto da busca (só com o nome, ou pelo Hermes). Serve à edição, que guarda a
 * escolha no rascunho, e ao detalhe, que grava na hora.
 */
export function TaskPickerDialog({ title, searchLabel, excluded, now, userId, onPick, onClose }: TaskPickerDialogProps) {
  return (
    <EntityPickerDialog<TaskCardDto>
      title={title}
      searchLabel={searchLabel}
      search={searchTrackedTasks}
      keyOf={(card) => card.id}
      nameOf={(card) => card.name}
      renderItem={(card) => <TaskChoiceView card={card} now={now} />}
      exclude={(card) => excluded.includes(card.id)}
      onPick={(card) => onPick([card])}
      onClose={onClose}
      failedMessage="Não foi possível buscar tarefas. Tente de novo."
      footer={(text, close) => <TaskCreateActions text={text} userId={userId} onCreated={onPick} close={close} />}
    />
  );
}
