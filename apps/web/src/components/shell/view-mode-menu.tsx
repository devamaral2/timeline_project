"use client";

import { Bot, Check, type LucideIcon, User } from "lucide-react";
import { type KeyboardEvent, type RefObject, useEffect, useId, useRef } from "react";
import { VIEW_MODES, type ViewModeId, useViewMode, writeViewMode } from "@/lib/events/view-mode";
import styles from "./view-mode-menu.module.css";

/** Quem está em cada modo: a pessoa, o robô, ou os dois. */
const ACTOR_ICONS: Record<ViewModeId, LucideIcon[]> = {
  human: [User],
  agent: [Bot],
  all: [User, Bot],
};

/**
 * Menu de modos de visualização. Sobe da barra inferior quando a pessoa toca na
 * aba que já está selecionada (Agenda ou Tarefas). Escolher um modo grava a
 * escolha e fecha; Esc e toque fora fecham sem mudar nada. Quem abre devolve o
 * foco à aba ao fechar (`returnFocusRef`).
 */
export function ViewModeMenu({ open, onClose, returnFocusRef }: { open: boolean; onClose: () => void; returnFocusRef: RefObject<HTMLElement | null> }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const headingId = useId();
  const current = useViewMode();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      dialog.querySelector<HTMLElement>('[aria-checked="true"]')?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  function choose(id: ViewModeId) {
    writeViewMode(id);
    onClose();
  }

  // Setas sobem e descem entre os modos (com volta), como num menu de escolha única.
  function onKeyDown(event: KeyboardEvent<HTMLDialogElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('[role="menuitemradio"]'));
    const step = event.key === "ArrowDown" ? 1 : -1;
    const index = items.indexOf(document.activeElement as HTMLElement);
    event.preventDefault();
    items[(index + step + items.length) % items.length]?.focus();
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={headingId}
      className={styles.menu}
      onClose={() => {
        onClose();
        returnFocusRef.current?.focus();
      }}
      onKeyDown={onKeyDown}
      onPointerDown={event => {
        const bounds = event.currentTarget.getBoundingClientRect();
        if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) {
          event.preventDefault();
          onClose();
        }
      }}
    >
      <p id={headingId} className={styles.heading}>Como ver a agenda</p>
      <div role="menu" aria-labelledby={headingId} className={styles.list}>
        {VIEW_MODES.map(mode => {
          const checked = mode.id === current.id;
          const icons = ACTOR_ICONS[mode.id];
          return (
            <button
              key={mode.id}
              type="button"
              role="menuitemradio"
              aria-checked={checked}
              data-mode={mode.id}
              className={styles.item}
              onClick={() => choose(mode.id)}
            >
              <span className={styles.symbols} data-count={icons.length} aria-hidden>
                {icons.map((Icon, index) => <Icon key={index} />)}
              </span>
              <span className={styles.name}>{mode.label}</span>
              {checked ? <Check className={styles.check} aria-hidden /> : null}
            </button>
          );
        })}
      </div>
    </dialog>
  );
}
