"use client";

import { useEffect, useState } from "react";
import type { AgentTaskStatus, TaskCardDto, HumanTaskStatus } from "@repo/contracts";
import { DetailMessage, DetailSection } from "@/components/detail/detail-parts";
import { AddButton, RemoveButton, editStyles as edit } from "@/components/edit/edit-parts";
import { EntityPickerDialog } from "@/components/edit/EntityPickerDialog";
import { TaskChoiceView, searchTrackedTasks } from "@/components/edit/task-choice";
import { TaskKindMark } from "@/components/tasks/task-kind-mark";
import { TaskStatusGlyph } from "@/components/tasks/task-status-glyph";
import { getEvent } from "@/lib/api/events";
import { cardWhenLabel } from "@/lib/tasks/card-text";
import { useNow } from "@/lib/tasks/use-now";
import type { TaskDraft, TaskDraftField } from "./task-draft";

interface TaskEditSequenceSectionProps {
  /** O evento aberto: não aparece na busca. */
  taskId: string;
  draft: TaskDraft;
  onChange: <K extends TaskDraftField>(field: K, value: TaskDraft[K]) => void;
}

/**
 * "Sequência" na edição, nos dois lados: "Segue-se de" (os eventos que vêm antes
 * deste) e "Da sequência a" (os que se seguem a este). Cada lista tem um "+" que
 * abre o modal de seleção, com a busca por nome na lista de tarefas (eventos de
 * pessoa e de agente); o evento aberto fica de fora. O rascunho guarda só os ids; nome, tipo e quando
 * de cada um vêm de `getEvent`, ou do próprio resultado da busca quando a pessoa
 * escolheu agora. Remover só tira o id do rascunho: a gravação fica para o Salvar.
 */
export function TaskEditSequenceSection({ taskId, draft, onChange }: TaskEditSequenceSectionProps) {
  const now = useNow();
  const [cards, setCards] = useState<Record<string, TaskCardDto>>({});
  const [loadFailed, setLoadFailed] = useState(false);

  const missing = [...new Set([...draft.previousTaskIds, ...draft.nextTaskIds])].filter((id) => !cards[id]);
  const missingKey = missing.join(",");

  useEffect(() => {
    if (!missingKey) return;
    let stale = false;
    for (const id of missingKey.split(",")) {
      getEvent(id)
        .then((task) => {
          if (!stale) setCards((current) => ({ ...current, [id]: task }));
        })
        .catch(() => {
          if (!stale) setLoadFailed(true);
        });
    }
    return () => {
      stale = true;
    };
  }, [missingKey]);

  function pick(field: "previousTaskIds" | "nextTaskIds", card: TaskCardDto) {
    setCards((current) => ({ ...current, [card.id]: card }));
    onChange(field, [...draft[field], card.id]);
  }

  function drop(field: "previousTaskIds" | "nextTaskIds", id: string) {
    onChange(field, draft[field].filter((current) => current !== id));
  }

  return (
    <DetailSection title="Sequência" labelId="task-edit-sequence">
      {loadFailed ? <DetailMessage alert>Alguns eventos da sequência não carregaram.</DetailMessage> : null}
      <SequencePicker
        id="previous"
        heading="Segue-se de"
        addLabel="Adicionar evento de que este se segue"
        searchLabel="Buscar evento de que este se segue"
        removeLabel={(name) => `Deixar de se seguir de “${name}”`}
        ids={draft.previousTaskIds}
        taskId={taskId}
        cards={cards}
        loadFailed={loadFailed}
        now={now}
        onPick={(card) => pick("previousTaskIds", card)}
        onDrop={(id) => drop("previousTaskIds", id)}
      />
      <SequencePicker
        id="next"
        heading="Da sequência a"
        addLabel="Adicionar evento da sequência"
        searchLabel="Buscar evento da sequência"
        removeLabel={(name) => `Remover “${name}” da sequência`}
        ids={draft.nextTaskIds}
        taskId={taskId}
        cards={cards}
        loadFailed={loadFailed}
        now={now}
        onPick={(card) => pick("nextTaskIds", card)}
        onDrop={(id) => drop("nextTaskIds", id)}
      />
    </DetailSection>
  );
}

interface SequencePickerProps {
  id: string;
  heading: string;
  /** O nome do "+" para o leitor de tela. */
  addLabel: string;
  searchLabel: string;
  removeLabel: (name: string) => string;
  ids: string[];
  taskId: string;
  cards: Record<string, TaskCardDto>;
  loadFailed: boolean;
  now: Date | null;
  onPick: (card: TaskCardDto) => void;
  onDrop: (id: string) => void;
}

/** Uma lista da sequência com o seu "+": o modal de seleção abre com a busca de eventos. */
function SequencePicker({ id, heading, addLabel, searchLabel, removeLabel, ids, taskId, cards, loadFailed, now, onPick, onDrop }: SequencePickerProps) {
  const headingId = `task-edit-sequence-${id}`;
  const [picking, setPicking] = useState(false);

  return (
    <div role="group" aria-labelledby={headingId}>
      <h3 id={headingId} className={edit.groupLabel}>{heading}</h3>
      {ids.length > 0 ? (
        <ul className={edit.list}>
          {ids.map((linkedId) => {
            const card = cards[linkedId];
            const name = card ? card.name : loadFailed ? "Evento indisponível" : "Carregando…";
            return (
              <li key={linkedId} className={edit.item}>
                <span className={edit.itemLead}>{card ? <SequenceGlyph card={card} /> : null}</span>
                <div className={edit.itemBody}>
                  <span className={edit.itemName}>{name}</span>
                  {card ? (
                    <span className={edit.itemMeta}>
                      <TaskKindMark kind={card.kind} />
                      {now ? <span>{cardWhenLabel(card, now)}</span> : null}
                    </span>
                  ) : null}
                </div>
                <RemoveButton label={removeLabel(card ? card.name : "evento")} onClick={() => onDrop(linkedId)} />
              </li>
            );
          })}
        </ul>
      ) : null}
      <div className={edit.addRow}>
        <AddButton label={addLabel} onClick={() => setPicking(true)} />
        {ids.length === 0 ? <p className={edit.empty}>nenhum evento</p> : null}
      </div>
      {picking ? (
        <EntityPickerDialog<TaskCardDto>
          title={heading}
          searchLabel={searchLabel}
          search={searchTrackedTasks}
          keyOf={(card) => card.id}
          nameOf={(card) => card.name}
          renderItem={(card) => <TaskChoiceView card={card} now={now} />}
          // O evento aberto e quem já está na lista não são oferecidos de novo.
          exclude={(card) => card.id === taskId || ids.includes(card.id)}
          onPick={onPick}
          onClose={() => setPicking(false)}
          failedMessage="Não foi possível buscar eventos. Tente de novo."
        />
      ) : null}
    </div>
  );
}

/** O glifo só mostra o status: escolher um evento da sequência não muda o status do evento daqui. */
function SequenceGlyph({ card }: { card: TaskCardDto }) {
  if (card.actor === "agent") {
    return <TaskStatusGlyph actor="agent" status={card.status as AgentTaskStatus} size={22} />;
  }
  const status = (card.status ?? null) as HumanTaskStatus | null;
  return <TaskStatusGlyph actor="human" status={status} size={22} />;
}
