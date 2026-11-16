"use client";

import { type KeyboardEvent, type ReactNode, type RefObject, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import styles from "./popover.module.css";

const GAP = 6;
const MARGIN = 8;

interface PopoverProps {
  /** O botão que abriu o painel: o painel nasce embaixo dele, e o toque nele não fecha por fora. */
  anchor: RefObject<HTMLElement | null>;
  /** O nome do painel para o leitor de tela; a lista de escolha já se nomeia sozinha e passa só `label`. */
  label: string;
  /** Um painel com mais que uma lista (o calendário, a hora) é um diálogo. */
  dialog?: boolean;
  /** Largura mínima do painel: a do botão, para a lista não ficar mais estreita que o campo. */
  matchWidth?: boolean;
  onClose: () => void;
  children: ReactNode;
}

type Placement = { left: number; top: number; minWidth: number; maxHeight: number } | null;

/**
 * Um painel que flutua junto de um botão: abre embaixo (ou em cima, se embaixo não cabe), fecha com Esc, com o toque
 * fora e ao sair do foco para fora, e devolve o foco ao botão. No celular vira uma folha que sobe do pé, com um
 * fundo que escurece a tela. É montado no <body>, fora do shell, então traz os próprios apelidos de token.
 */
export function Popover({ anchor, label, dialog = false, matchWidth = false, onClose, children }: PopoverProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = useState<Placement>(null);
  const [sheet, setSheet] = useState(false);

  const close = useCallback(() => {
    onClose();
    anchor.current?.focus();
  }, [onClose, anchor]);

  const place = useCallback(() => {
    const button = anchor.current;
    const panel = panelRef.current;
    if (!button || !panel) return;
    const phone = typeof window.matchMedia === "function" && window.matchMedia("(max-width: 720px)").matches;
    setSheet(phone);
    if (phone) {
      setPlacement(null);
      return;
    }
    const box = button.getBoundingClientRect();
    const height = panel.offsetHeight;
    const width = panel.offsetWidth;
    const below = window.innerHeight - box.bottom - GAP - MARGIN;
    const above = box.top - GAP - MARGIN;
    const up = height > below && above > below;
    const room = up ? above : below;
    const left = Math.max(MARGIN, Math.min(box.left, window.innerWidth - Math.max(width, box.width) - MARGIN));
    setPlacement({
      left,
      top: up ? Math.max(MARGIN, box.top - GAP - Math.min(height, room)) : box.bottom + GAP,
      minWidth: matchWidth ? box.width : 0,
      maxHeight: Math.max(160, room),
    });
  }, [anchor, matchWidth]);

  useLayoutEffect(() => {
    place();
  }, [place]);

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (panelRef.current?.contains(target) || anchor.current?.contains(target)) return;
      onClose();
    }
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [anchor, onClose, place]);

  // A página de trás não rola enquanto a folha do celular está aberta.
  useEffect(() => {
    if (!sheet) return;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
    };
  }, [sheet]);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.stopPropagation();
      close();
      return;
    }
    // Tab sai do painel para o campo seguinte: o painel não prende o foco, só se fecha.
    if (event.key === "Tab") onClose();
  }

  return createPortal(
    <div className={styles.layer} data-sheet={sheet || undefined}>
      {sheet ? <div className={styles.scrim} aria-hidden /> : null}
      <div
        ref={panelRef}
        className={styles.panel}
        role={dialog ? "dialog" : undefined}
        aria-label={dialog ? label : undefined}
        data-ready={placement !== null || sheet || undefined}
        style={placement ? { left: placement.left, top: placement.top, minWidth: placement.minWidth, maxHeight: placement.maxHeight } : undefined}
        onKeyDown={onKeyDown}
      >
        {sheet ? <div className={styles.handle} aria-hidden /> : null}
        {children}
      </div>
    </div>,
    document.body,
  );
}

export interface ListOption<T extends string> {
  value: T;
  label: string;
}

interface OptionListProps<T extends string> {
  label: string;
  options: readonly ListOption<T>[];
  value: T | null;
  onPick: (value: T) => void;
  /** Leva o foco para a opção marcada ao montar; as colunas de hora e minuto abrem sem roubar o foco uma da outra. */
  autoFocus?: boolean;
  /** Rola a opção marcada para o meio da lista ao montar. */
  centerSelected?: boolean;
  className?: string;
  renderOption?: (option: ListOption<T>) => ReactNode;
}

/**
 * Uma lista de escolha com o teclado do `listbox`: setas e Home/End movem o foco, Enter e espaço escolhem. Quem usa
 * decide o que acontece depois de escolher (fechar o painel, ou só marcar e deixar a pessoa seguir).
 */
export function OptionList<T extends string>({ label, options, value, onPick, autoFocus = false, centerSelected = false, className, renderOption }: OptionListProps<T>) {
  const listRef = useRef<HTMLUListElement>(null);
  const selectedIndex = options.findIndex((option) => option.value === value);
  const [active, setActive] = useState(Math.max(0, selectedIndex));

  useLayoutEffect(() => {
    const list = listRef.current;
    const item = list?.children[Math.max(0, selectedIndex)];
    if (!list || !(item instanceof HTMLElement)) return;
    if (centerSelected) list.scrollTop = item.offsetTop - (list.clientHeight - item.offsetHeight) / 2;
    if (autoFocus) item.focus({ preventScroll: true });
    // Só ao montar: depois disso quem mexe no foco é o teclado.
    // biome-ignore lint/correctness/useExhaustiveDependencies: a opção marcada ao abrir é a que vale.
  }, []);

  function move(index: number) {
    const next = Math.max(0, Math.min(options.length - 1, index));
    setActive(next);
    const item = listRef.current?.children[next];
    if (item instanceof HTMLElement) item.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLUListElement>) {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        move(active + 1);
        break;
      case "ArrowUp":
        event.preventDefault();
        move(active - 1);
        break;
      case "Home":
        event.preventDefault();
        move(0);
        break;
      case "End":
        event.preventDefault();
        move(options.length - 1);
        break;
      case "Enter":
      case " ": {
        event.preventDefault();
        const option = options[active];
        if (option) onPick(option.value);
        break;
      }
      default:
    }
  }

  return (
    // biome-ignore lint/a11y/useSemanticElements: o listbox com opções desenhadas não existe como elemento nativo.
    <ul ref={listRef} role="listbox" aria-label={label} className={`${styles.options} ${className ?? ""}`} onKeyDown={onKeyDown}>
      {options.map((option, index) => (
        <li
          key={option.value}
          // biome-ignore lint/a11y/useSemanticElements: idem.
          role="option"
          aria-selected={option.value === value}
          data-value={option.value}
          tabIndex={index === active ? 0 : -1}
          className={styles.option}
          onFocus={() => setActive(index)}
          onClick={() => onPick(option.value)}
        >
          {renderOption ? renderOption(option) : option.label}
        </li>
      ))}
    </ul>
  );
}
