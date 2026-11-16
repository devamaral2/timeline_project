"use client";

import { Search, X } from "lucide-react";
import { type KeyboardEvent, type ReactNode, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import styles from "./entity-picker.module.css";

/** Espera depois da última tecla antes de consultar. A mesma pausa da lista de tarefas. */
const SEARCH_DEBOUNCE_MS = 250;

export interface EntityPickerDialogProps<T> {
  /** O que a lista vai receber: "Segue-se de", "Artefatos". Vira o título do modal. */
  title: string;
  /** O nome do campo de busca: rótulo acessível e placeholder. */
  searchLabel: string;
  /**
   * A fonte dos resultados. Recebe o texto sem espaços nas pontas; vazio, ao abrir, pede os primeiros itens.
   * Tem que ser estável (função de módulo ou `useCallback`): a busca refaz-se quando ela muda.
   */
  search: (query: string) => Promise<T[]>;
  keyOf: (item: T) => string;
  /** O nome do item, para o rótulo do botão de escolha. */
  nameOf: (item: T) => string;
  /** O conteúdo visível de cada escolha, dentro do botão. */
  renderItem: (item: T) => ReactNode;
  /** Quem não deve ser oferecido: já está na lista, ou é a própria entidade aberta. */
  exclude?: (item: T) => boolean;
  onPick: (item: T) => void;
  onClose: () => void;
  failedMessage: string;
}

type SearchState = "loading" | "ready" | "failed";

/**
 * O modal de seleção de entidade: abre pelo "+" de uma lista de ligações (sequência, artefatos da tarefa,
 * tarefas do artefato), mostra os primeiros itens, filtra pela busca e, ao escolher, entrega o item e fecha.
 * No celular é uma folha que sobe do pé; no desktop, um diálogo centrado. Esc, o "x" e o toque fora fecham
 * sem escolher, e o foco volta para quem abriu. Não sabe de que é a lista: quem usa passa a fonte e o desenho.
 */
export function EntityPickerDialog<T>({ title, searchLabel, search, keyOf, nameOf, renderItem, exclude, onPick, onClose, failedMessage }: EntityPickerDialogProps<T>) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const [typed, setTyped] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<T[]>([]);
  const [state, setState] = useState<SearchState>("loading");

  // A página de trás não rola, e o foco volta para o "+" que abriu o modal.
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
      opener?.focus();
    };
  }, []);

  useEffect(() => {
    const next = typed.trim();
    if (next === query) return;
    const timer = setTimeout(() => setQuery(next), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [typed, query]);

  useEffect(() => {
    let stale = false;
    setState("loading");
    search(query)
      .then((found) => {
        if (stale) return;
        setResults(found);
        setState("ready");
      })
      .catch(() => {
        if (!stale) setState("failed");
      });
    return () => {
      stale = true;
    };
  }, [query, search]);

  const shown = results.filter((item) => !exclude?.(item));

  /** Esc fecha; Tab dá a volta dentro do modal. */
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const stops = [...(panelRef.current?.querySelectorAll<HTMLElement>("button, input") ?? [])].filter((stop) => !stop.hasAttribute("disabled"));
    const first = stops[0];
    const last = stops.at(-1);
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return createPortal(
    // O toque fora fecha; o teclado fecha com Esc, tratado no painel.
    <div
      className={styles.overlay}
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={titleId} className={styles.panel} onKeyDown={onKeyDown}>
        <div className={styles.handle} aria-hidden />
        <header className={styles.head}>
          <h2 id={titleId} className={styles.title}>{title}</h2>
          <button type="button" className={styles.close} aria-label="Fechar" onClick={onClose}>
            <X className={styles.closeIcon} aria-hidden />
          </button>
        </header>
        <label className={styles.search}>
          <Search className={styles.searchIcon} aria-hidden />
          <input
            type="search"
            aria-label={searchLabel}
            placeholder={searchLabel}
            autoComplete="off"
            // O modal abre para buscar: o campo já chega com o foco.
            // biome-ignore lint/a11y/noAutofocus: o foco entra no modal ao abrir, como pede o padrão de diálogo.
            autoFocus
            value={typed}
            onChange={(change) => setTyped(change.target.value)}
          />
        </label>
        <div className={styles.results}>
          {shown.length > 0 ? (
            <ul className={styles.list} aria-label={`Resultados: ${searchLabel}`}>
              {shown.map((item) => (
                <li key={keyOf(item)}>
                  <button
                    type="button"
                    className={styles.result}
                    aria-label={`Escolher “${nameOf(item)}”`}
                    onClick={() => {
                      onPick(item);
                      onClose();
                    }}
                  >
                    {renderItem(item)}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {state === "failed" ? <p role="alert" className={styles.message} data-alert>{failedMessage}</p> : null}
          {state === "loading" && shown.length === 0 ? <p role="status" className={styles.message}>Buscando…</p> : null}
          {state === "ready" && shown.length === 0 ? (
            <p role="status" className={styles.message}>{query ? "Nada encontrado para essa busca." : "Nada para ligar por aqui."}</p>
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}
