"use client";

import { type ReactNode, useEffect, useState } from "react";
import styles from "./search-picker.module.css";

/** Espera depois da última tecla antes de consultar. A mesma pausa da lista de tarefas e dos bloqueios. */
const SEARCH_DEBOUNCE_MS = 250;

interface SearchPickerProps<T> {
  /** O nome do campo: vira o rótulo acessível e o placeholder da busca. */
  label: string;
  /**
   * A fonte dos resultados para o texto, já sem espaços nas pontas e depois da pausa. Quem usa escolhe a fonte.
   * Tem que ser estável (função de módulo ou `useCallback`): a busca refaz-se quando ela muda.
   */
  search: (query: string) => Promise<T[]>;
  keyOf: (item: T) => string;
  /** O nome do item, para o rótulo do botão de escolha. */
  nameOf: (item: T) => string;
  /** O conteúdo visível de cada escolha, dentro do botão. */
  renderItem: (item: T) => ReactNode;
  /** Quem não deve ser oferecido: já está na lista, ou é o próprio evento aberto. */
  exclude?: (item: T) => boolean;
  onPick: (item: T) => void;
  failedMessage: string;
}

/**
 * A busca que acrescenta itens a uma lista de edição. Digitar espera uma pausa, consulta `search` e mostra os
 * resultados que não estão excluídos; escolher um chama `onPick` e limpa a busca. Não sabe de que é a lista: o
 * ticket que traz outra fonte (alimento, exercício) passa outra `search` e outro `renderItem`.
 */
export function SearchPicker<T>({ label, search, keyOf, nameOf, renderItem, exclude, onPick, failedMessage }: SearchPickerProps<T>) {
  const [typed, setTyped] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<T[]>([]);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setQuery(typed.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [typed]);

  useEffect(() => {
    if (!query) {
      setResults([]);
      return;
    }
    let stale = false;
    setFailed(false);
    search(query)
      .then((found) => {
        if (!stale) setResults(found);
      })
      .catch(() => {
        if (!stale) setFailed(true);
      });
    return () => {
      stale = true;
    };
  }, [query, search]);

  const shown = query ? results.filter((item) => !exclude?.(item)) : [];

  function choose(item: T) {
    onPick(item);
    setTyped("");
    setQuery("");
  }

  return (
    <div className={styles.picker}>
      <input
        type="search"
        className={styles.search}
        aria-label={label}
        placeholder={label}
        autoComplete="off"
        value={typed}
        onChange={(change) => setTyped(change.target.value)}
      />
      {shown.length > 0 ? (
        <ul className={styles.results} aria-label={`Resultados: ${label}`}>
          {shown.map((item) => (
            <li key={keyOf(item)}>
              <button type="button" className={styles.result} aria-label={`Escolher “${nameOf(item)}”`} onClick={() => choose(item)}>
                {renderItem(item)}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {failed ? <p className={styles.error}>{failedMessage}</p> : null}
    </div>
  );
}
