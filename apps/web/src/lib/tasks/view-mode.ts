import { useSyncExternalStore } from "react";

/**
 * Modo de visualização das listas (agenda e lista de tarefas). Três modos fixos:
 * os seus eventos, os eventos dos agentes e todos. O modo em uso vai como filtro
 * de executor (`actor`) nas consultas e fica guardado no navegador. Sem escolha
 * guardada, ou com o armazenamento bloqueado, vale "Todos os eventos".
 */

export type ViewModeId = "human" | "agent" | "all";

export interface ViewMode {
  id: ViewModeId;
  label: string;
  /** Executor que vai à consulta; `undefined` deixa a API devolver os dois. */
  actor: "human" | "agent" | undefined;
  /** Variável CSS da cor da aba selecionada (`apps/web/src/styles/globals.css`). */
  colorVar: "--mode-human" | "--mode-agent" | "--mode-all";
}

export const VIEW_MODES: readonly ViewMode[] = [
  { id: "human", label: "Todos os seus eventos", actor: "human", colorVar: "--mode-human" },
  { id: "agent", label: "Todos os eventos de agentes", actor: "agent", colorVar: "--mode-agent" },
  { id: "all", label: "Todos os eventos", actor: undefined, colorVar: "--mode-all" },
];

export const DEFAULT_VIEW_MODE_ID: ViewModeId = "all";
export const VIEW_MODE_STORAGE_KEY = "braid-view-mode";
/** Evento da mesma aba: o navegador não avisa a própria aba quando o armazenamento muda. */
const VIEW_MODE_CHANGE_EVENT = "braid-view-mode-change";

/** O modo com este id; qualquer outro valor (inclusive `null`) cai no padrão. */
export function viewModeOf(id: string | null | undefined): ViewMode {
  return VIEW_MODES.find((mode) => mode.id === id) ?? VIEW_MODES[VIEW_MODES.length - 1];
}

/** A escolha guardada, ou o padrão. Armazenamento bloqueado também vale o padrão. */
export function readViewMode(): ViewModeId {
  try {
    return viewModeOf(window.localStorage.getItem(VIEW_MODE_STORAGE_KEY)).id;
  } catch {
    return DEFAULT_VIEW_MODE_ID;
  }
}

/** Guarda a escolha e avisa as telas abertas nesta aba. Sem armazenamento, o modo não sobrevive à recarga. */
export function writeViewMode(id: ViewModeId): void {
  try {
    window.localStorage.setItem(VIEW_MODE_STORAGE_KEY, id);
  } catch {}
  window.dispatchEvent(new Event(VIEW_MODE_CHANGE_EVENT));
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(VIEW_MODE_CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(VIEW_MODE_CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/**
 * O modo em uso. As duas listas e a barra inferior o usam; a troca (na mesma
 * aba ou em outra) chega a todas. Antes da montagem, e no servidor, vale o padrão.
 */
export function useViewMode(): ViewMode {
  const id = useSyncExternalStore(subscribe, readViewMode, () => DEFAULT_VIEW_MODE_ID);
  return viewModeOf(id);
}
