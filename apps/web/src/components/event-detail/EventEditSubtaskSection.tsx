"use client";

import { X } from "lucide-react";
import { DetailMessage, DetailSection, detailIcon } from "@/components/detail/detail-parts";
import { type SubtaskRow, newSubtaskRow } from "./event-subtask-draft";
import styles from "./event-edit-subtasks.module.css";

interface EventEditSubtaskSectionProps {
  rows: SubtaskRow[];
  /** Mensagem por chave de linha, da última tentativa de Salvar. */
  errors: Record<string, string>;
  loaded: boolean;
  loadFailed: boolean;
  onChange: (rows: SubtaskRow[]) => void;
}

/**
 * "Subtarefas" na edição: uma linha com nome editável por subtarefa, "Nova
 * subtarefa" no fim e o remover de cada uma. Remover uma subtarefa existente só
 * a tira da lista do evento aberto; a subtarefa continua existindo, e a
 * gravação fica para o Salvar.
 */
export function EventEditSubtaskSection({ rows, errors, loaded, loadFailed, onChange }: EventEditSubtaskSectionProps) {
  const visible = rows.filter((row) => !row.removed);

  function rename(key: string, name: string) {
    onChange(rows.map((row) => (row.key === key ? { ...row, name } : row)));
  }

  function remove(row: SubtaskRow) {
    // Uma linha nova nem chegou a existir: some. Uma existente só sai da lista, marcada para o Salvar.
    onChange(row.id === null ? rows.filter((other) => other.key !== row.key) : rows.map((other) => (other.key === row.key ? { ...other, removed: true } : other)));
  }

  return (
    <DetailSection title="Subtarefas" labelId="event-edit-subtasks">
      {loadFailed && !loaded ? <DetailMessage alert>Não foi possível carregar as subtarefas.</DetailMessage> : null}
      {!loaded && !loadFailed ? <DetailMessage>Carregando subtarefas…</DetailMessage> : null}
      {loaded && visible.length === 0 ? <p className={styles.empty}>nenhuma subtarefa</p> : null}
      {loaded && visible.length > 0 ? (
        <ul className={styles.list}>
          {visible.map((row) => (
            <li key={row.key} className={styles.row}>
              <input
                type="text"
                aria-label="Nome da subtarefa"
                placeholder="Nome da subtarefa"
                value={row.name}
                aria-invalid={errors[row.key] ? true : undefined}
                className={styles.input}
                onChange={(change) => rename(row.key, change.target.value)}
              />
              <button
                type="button"
                className={styles.remove}
                aria-label={`Remover subtarefa “${row.loadedName || row.name}”`}
                onClick={() => remove(row)}
              >
                <X {...detailIcon} />
              </button>
              {errors[row.key] ? <p className={styles.error}>{errors[row.key]}</p> : null}
            </li>
          ))}
        </ul>
      ) : null}
      <button type="button" className={styles.add} onClick={() => onChange([...rows, newSubtaskRow()])}>
        Nova subtarefa
      </button>
    </DetailSection>
  );
}
