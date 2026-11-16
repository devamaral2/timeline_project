import { useCallback, useState } from "react";
import type { TaskDto } from "@repo/contracts";
import { type EventDraft, type EventDraftField, draftFromEvent, emptyEventDraft, rebaseDraft } from "./event-draft";

interface DraftState {
  /** `null` na criação: não há evento de origem. */
  event: TaskDto | null;
  draft: EventDraft;
}

/**
 * O único estado do formulário de edição e de criação. Sem evento (criação), o
 * rascunho começa vazio, com `initialName` no título. Quando o evento chega de
 * novo (uma recarga depois de revisão velha), o rascunho se rebaseia durante a
 * renderização: o que a pessoa digitou fica, e o resto segue a versão nova.
 */
export function useEventDraft(event: TaskDto | null, initialName?: string) {
  const [state, setState] = useState<DraftState>(() => ({
    event,
    draft: event ? draftFromEvent(event) : emptyEventDraft(initialName),
  }));
  let current = state;
  if (event && state.event && state.event !== event) {
    current = { event, draft: rebaseDraft(state.draft, state.event, event) };
    setState(current);
  }

  const setField = useCallback(<K extends EventDraftField>(field: K, value: EventDraft[K]) => {
    setState((previous) => ({ ...previous, draft: { ...previous.draft, [field]: value } }));
  }, []);

  return { event: current.event, draft: current.draft, setField };
}
