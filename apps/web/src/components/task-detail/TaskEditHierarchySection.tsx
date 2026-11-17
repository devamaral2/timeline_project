"use client";

import { useEffect, useState } from "react";
import type { AgentTaskStatus, TaskCardDto, HumanTaskStatus } from "@repo/contracts";
import { DetailMessage, DetailSection } from "@/components/detail/detail-parts";
import { AddButton, RemoveButton, editStyles as edit } from "@/components/edit/edit-parts";
import { TaskPickerDialog } from "@/components/edit/task-picker-dialog";
import { TaskKindMark } from "@/components/tasks/task-kind-mark";
import { TaskStatusGlyph } from "@/components/tasks/task-status-glyph";
import { getTask } from "@/lib/api/tasks";
import { cardWhenLabel } from "@/lib/tasks/card-text";
import { useNow } from "@/lib/tasks/use-now";
import type { TaskDraft, TaskDraftField } from "./task-draft";

interface TaskEditHierarchySectionProps {
  /** A tarefa aberta: não aparece na busca. */
  taskId: string;
  /** Quem pede ao Hermes para criar a tarefa. Sem ele, o modal só oferece a criação manual. */
  userId?: string;
  draft: TaskDraft;
  onChange: <K extends TaskDraftField>(field: K, value: TaskDraft[K]) => void;
}

/**
 * A hierarquia na edição, em duas seções: "Tarefa principal", um lugar só (vazio
 * mostra o "+", preenchido mostra a tarefa com o "x"), e "Subtarefas", uma lista
 * com "+" e "x" em cada linha. O "+" abre o modal de seleção com a busca por nome
 * na lista de tarefas (de pessoa e de agente). A tarefa aberta fica de fora das
 * duas buscas; a principal escolhida fica de fora das subtarefas, e as
 * subtarefas, da principal. O rascunho guarda só os ids; nome, tipo e quando de
 * cada um vêm de `getTask`, ou do próprio resultado da busca quando a pessoa
 * escolheu agora. Remover só mexe no rascunho: a gravação fica para o Salvar.
 * Embaixo da busca, o modal também cria a tarefa (só com o nome, ou pelo Hermes):
 * ela nasce na hora e entra ligada no rascunho, como uma escolha da busca.
 */
export function TaskEditHierarchySection({ taskId, userId, draft, onChange }: TaskEditHierarchySectionProps) {
  const now = useNow();
  const [cards, setCards] = useState<Record<string, TaskCardDto>>({});
  const [loadFailed, setLoadFailed] = useState(false);

  const linked = draft.parentTaskId ? [draft.parentTaskId, ...draft.subtaskIds] : draft.subtaskIds;
  const missing = [...new Set(linked)].filter((id) => !cards[id]);
  const missingKey = missing.join(",");

  useEffect(() => {
    if (!missingKey) return;
    let stale = false;
    for (const id of missingKey.split(",")) {
      getTask(id)
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

  function remember(card: TaskCardDto) {
    setCards((current) => ({ ...current, [card.id]: card }));
  }

  const parentIds = draft.parentTaskId ? [draft.parentTaskId] : [];

  return (
    <>
      <DetailSection title="Tarefa principal" labelId="task-edit-parent">
        {loadFailed && draft.parentTaskId && !cards[draft.parentTaskId] ? (
          <DetailMessage alert>A tarefa principal não carregou.</DetailMessage>
        ) : null}
        <LinkedTasksPicker
          title="Tarefa principal"
          addLabel="Escolher a tarefa principal"
          searchLabel="Buscar tarefa principal"
          removeLabel={(name) => `Tirar “${name}” como tarefa principal`}
          emptyLabel="nenhuma tarefa principal"
          ids={parentIds}
          // Um lugar só: com a principal escolhida, o "+" some até ela ser tirada.
          canAdd={parentIds.length === 0}
          // As subtarefas não podem ser também a principal.
          excluded={[taskId, ...draft.subtaskIds]}
          cards={cards}
          loadFailed={loadFailed}
          now={now}
          userId={userId}
          onPick={(picked) => {
            // Um lugar só: do que o Hermes criou, a primeira de cima vira a principal.
            const card = picked[0];
            if (!card) return;
            remember(card);
            onChange("parentTaskId", card.id);
          }}
          onDrop={() => onChange("parentTaskId", null)}
        />
      </DetailSection>
      <DetailSection title="Subtarefas" labelId="task-edit-subtasks">
        {loadFailed && draft.subtaskIds.some((id) => !cards[id]) ? (
          <DetailMessage alert>Algumas subtarefas não carregaram.</DetailMessage>
        ) : null}
        <LinkedTasksPicker
          title="Subtarefas"
          addLabel="Adicionar subtarefa"
          searchLabel="Buscar subtarefa"
          removeLabel={(name) => `Remover a subtarefa “${name}”`}
          emptyLabel="nenhuma subtarefa"
          ids={draft.subtaskIds}
          canAdd
          // A principal não pode ser também subtarefa.
          excluded={[taskId, ...parentIds, ...draft.subtaskIds]}
          cards={cards}
          loadFailed={loadFailed}
          now={now}
          userId={userId}
          onPick={(picked) => {
            for (const card of picked) remember(card);
            const added = picked.map((card) => card.id).filter((id) => !draft.subtaskIds.includes(id));
            onChange("subtaskIds", [...draft.subtaskIds, ...added]);
          }}
          onDrop={(id) => onChange("subtaskIds", draft.subtaskIds.filter((current) => current !== id))}
        />
      </DetailSection>
    </>
  );
}

interface LinkedTasksPickerProps {
  /** O título do modal de seleção. */
  title: string;
  /** O nome do "+" para o leitor de tela. */
  addLabel: string;
  searchLabel: string;
  removeLabel: (name: string) => string;
  emptyLabel: string;
  ids: string[];
  canAdd: boolean;
  /** Os ids que a busca não oferece. */
  excluded: string[];
  cards: Record<string, TaskCardDto>;
  loadFailed: boolean;
  now: Date | null;
  userId?: string;
  /** As tarefas que entram: uma da busca, ou as que a criação fez. */
  onPick: (cards: TaskCardDto[]) => void;
  onDrop: (id: string) => void;
}

/**
 * As tarefas ligadas de um lado da hierarquia e o seu "+": o modal de seleção abre com a busca de tarefas e, embaixo,
 * a criação de uma tarefa nova com o texto da busca.
 */
function LinkedTasksPicker({ title, addLabel, searchLabel, removeLabel, emptyLabel, ids, canAdd, excluded, cards, loadFailed, now, userId, onPick, onDrop }: LinkedTasksPickerProps) {
  const [picking, setPicking] = useState(false);

  return (
    <>
      {ids.length > 0 ? (
        <ul className={edit.list}>
          {ids.map((linkedId) => {
            const card = cards[linkedId];
            const name = card ? card.name : loadFailed ? "Tarefa indisponível" : "Carregando…";
            return (
              <li key={linkedId} className={edit.item}>
                <span className={edit.itemLead}>{card ? <LinkedTaskGlyph card={card} /> : null}</span>
                <div className={edit.itemBody}>
                  <span className={edit.itemName}>{name}</span>
                  {card ? (
                    <span className={edit.itemMeta}>
                      <TaskKindMark kind={card.kind} />
                      {now ? <span>{cardWhenLabel(card, now)}</span> : null}
                    </span>
                  ) : null}
                </div>
                <RemoveButton label={removeLabel(card ? card.name : "tarefa")} onClick={() => onDrop(linkedId)} />
              </li>
            );
          })}
        </ul>
      ) : null}
      {canAdd ? (
        <div className={edit.addRow}>
          <AddButton label={addLabel} onClick={() => setPicking(true)} />
          {ids.length === 0 ? <p className={edit.empty}>{emptyLabel}</p> : null}
        </div>
      ) : null}
      {picking ? (
        <TaskPickerDialog
          title={title}
          searchLabel={searchLabel}
          excluded={excluded}
          now={now}
          userId={userId}
          onPick={onPick}
          onClose={() => setPicking(false)}
        />
      ) : null}
    </>
  );
}

/** O glifo só mostra o status: ligar uma tarefa na hierarquia não muda o status de nenhuma das duas. */
function LinkedTaskGlyph({ card }: { card: TaskCardDto }) {
  if (card.actor === "agent") {
    return <TaskStatusGlyph actor="agent" status={card.status as AgentTaskStatus} size={22} />;
  }
  const status = (card.status ?? null) as HumanTaskStatus | null;
  return <TaskStatusGlyph actor="human" status={status} size={22} />;
}
