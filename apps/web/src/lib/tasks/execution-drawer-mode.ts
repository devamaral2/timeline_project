"use client";

import { useCallback, useRef, useState, useSyncExternalStore } from "react";
import { DEFAULT_EXECUTION_MODE, drawerGrows, type ExecutionDrawerMode, isExecutionMode } from "./execution-runs";

/**
 * A altura que a pessoa escolheu para a gaveta de execução. Fica guardada no aparelho e vale nas três abas; sem
 * escolha, ou com o armazenamento bloqueado, vale o padrão (três linhas).
 */
export const EXECUTION_MODE_STORAGE_KEY = "braid-execution-drawer";
const CHANGE_EVENT = "braid-execution-drawer-change";

export function readExecutionMode(): ExecutionDrawerMode {
  try {
    const stored = window.localStorage.getItem(EXECUTION_MODE_STORAGE_KEY);
    return isExecutionMode(stored) ? stored : DEFAULT_EXECUTION_MODE;
  } catch {
    return DEFAULT_EXECUTION_MODE;
  }
}

function writeExecutionMode(mode: ExecutionDrawerMode): void {
  try {
    window.localStorage.setItem(EXECUTION_MODE_STORAGE_KEY, mode);
  } catch {}
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/**
 * A altura em uso e se a última troca fez a gaveta crescer (`grow`: abrir é mais lento e as linhas que entram
 * chegam uma depois da outra). Sem armazenamento, a escolha vale só nesta carga da página.
 */
export function useExecutionDrawerMode(): { mode: ExecutionDrawerMode; grow: boolean; setMode: (next: ExecutionDrawerMode) => void } {
  const mode = useSyncExternalStore(subscribe, readExecutionMode, () => DEFAULT_EXECUTION_MODE);
  const [grow, setGrow] = useState(false);
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const setMode = useCallback((next: ExecutionDrawerMode) => {
    setGrow(drawerGrows(modeRef.current, next));
    writeExecutionMode(next);
  }, []);
  return { mode, grow, setMode };
}
