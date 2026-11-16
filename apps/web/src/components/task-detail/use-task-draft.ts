import { useCallback, useState } from "react";
import type { TaskDto } from "@repo/contracts";
import { type TaskDraft, type TaskDraftField, draftFromTask, emptyTaskDraft, rebaseDraft } from "./task-draft";

interface DraftState {
  /** `null` na criação: não há tarefa de origem. */
  task: TaskDto | null;
  draft: TaskDraft;
}

/**
 * O único estado do formulário de edição e de criação. Sem tarefa (criação), o
 * rascunho começa vazio, com `initialName` no título. Quando a tarefa chega de
 * novo (uma recarga depois de revisão velha), o rascunho se rebaseia durante a
 * renderização: o que a pessoa digitou fica, e o resto segue a versão nova.
 */
export function useTaskDraft(task: TaskDto | null, initialName?: string) {
  const [state, setState] = useState<DraftState>(() => ({
    task,
    draft: task ? draftFromTask(task) : emptyTaskDraft(initialName),
  }));
  let current = state;
  if (task && state.task && state.task !== task) {
    current = { task, draft: rebaseDraft(state.draft, state.task, task) };
    setState(current);
  }

  const setField = useCallback(<K extends TaskDraftField>(field: K, value: TaskDraft[K]) => {
    setState((previous) => ({ ...previous, draft: { ...previous.draft, [field]: value } }));
  }, []);

  return { task: current.task, draft: current.draft, setField };
}
