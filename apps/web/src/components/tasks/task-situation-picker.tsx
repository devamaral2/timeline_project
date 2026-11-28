"use client";

import type { TaskCardDto, TaskSituation } from "@repo/contracts";
import { TaskChoiceList } from "@/components/task-detail/TaskChoice";
import detail from "@/components/task-detail/task-detail.module.css";
import { RowPicker } from "./row-picker";
import { situationOptions } from "./task-situation";

/**
 * A escolha das três situações, aberta pelo glifo da esquerda de um pedido de agente que terminou: a mesma lista e o
 * mesmo cartão da escolha de status de pessoa, com a situação atual marcada. Escolher qualquer uma, inclusive a atual,
 * avisa quem usa; qualquer situação vale a partir de qualquer outra.
 */
export function TaskSituationPicker({ card, anchor, onPick, onClose }: {
  card: TaskCardDto;
  anchor?: HTMLElement | null;
  onPick: (situation: TaskSituation) => void;
  onClose: () => void;
}) {
  return (
    <RowPicker label={`Situação de “${card.name}”`} anchor={anchor} onClose={onClose}>
      <TaskChoiceList<TaskSituation>
        listLabel="Situação da tarefa"
        value={card.situation ?? null}
        className={detail.choiceList}
        options={situationOptions()}
        onPick={onPick}
      />
    </RowPicker>
  );
}
