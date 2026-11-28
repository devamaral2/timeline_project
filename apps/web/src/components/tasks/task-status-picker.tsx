"use client";

import type { TaskCardDto, HumanTaskStatus } from "@repo/contracts";
import { TaskChoiceList } from "@/components/task-detail/TaskChoice";
import detail from "@/components/task-detail/task-detail.module.css";
import { humanStatusOptions } from "@/lib/tasks/task-read-model";
import { RowPicker } from "./row-picker";
import { TaskStatusGlyph, taskStatusName } from "./task-status-glyph";

/**
 * A escolha dos sete status de pessoa, aberta pelo glifo de uma linha: o ponto
 * azul de uma tarefa de referência na agenda e o glifo de qualquer tarefa na
 * lista de tarefas. A lista é a mesma do topo do detalhe; aqui ela abre logo
 * abaixo do glifo tocado, alinhada à esquerda dele (acima, quando não cabe
 * embaixo), com o status atual marcado, e fecha com Esc ou toque fora. Sem
 * glifo de âncora, fica no cartão do pé da tela que o CSS define.
 */
export function TaskStatusPicker({ card, anchor, onPick, onClose }: {
  card: TaskCardDto;
  anchor?: HTMLElement | null;
  onPick: (status: HumanTaskStatus) => void;
  onClose: () => void;
}) {
  // O contrato garante status de pessoa (ou nenhum) quando o ator é pessoa; o glifo de agente não abre a escolha.
  const current = card.actor === "human" ? ((card.status ?? null) as HumanTaskStatus | null) : null;
  return (
    <RowPicker label={`Status de “${card.name}”`} anchor={anchor} onClose={onClose}>
      <TaskChoiceList<HumanTaskStatus>
        listLabel="Status da tarefa"
        value={current}
        className={detail.choiceList}
        options={humanStatusOptions(card).map((value) => ({
          value,
          label: taskStatusName("human", value),
          icon: <TaskStatusGlyph actor="human" status={value} size={18} />,
        }))}
        onPick={onPick}
      />
    </RowPicker>
  );
}
