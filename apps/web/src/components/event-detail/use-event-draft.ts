import { useCallback, useState } from "react";
import type { EventDto } from "@repo/contracts";
import { type EventDraft, type EventDraftField, draftFromEvent, rebaseDraft } from "./event-draft";

interface DraftState {
  event: EventDto;
  draft: EventDraft;
}

/**
 * O único estado do formulário de edição. Quando o evento chega de novo (uma
 * recarga depois de revisão velha), o rascunho se rebaseia durante a renderização:
 * o que a pessoa digitou fica, e o resto segue a versão nova.
 */
export function useEventDraft(event: EventDto) {
  const [state, setState] = useState<DraftState>(() => ({ event, draft: draftFromEvent(event) }));
  let current = state;
  if (state.event !== event) {
    current = { event, draft: rebaseDraft(state.draft, state.event, event) };
    setState(current);
  }

  const setField = useCallback(<K extends EventDraftField>(field: K, value: EventDraft[K]) => {
    setState((previous) => ({ ...previous, draft: { ...previous.draft, [field]: value } }));
  }, []);

  return { event: current.event, draft: current.draft, setField };
}
