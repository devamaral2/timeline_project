"use client";

import { Plus, X } from "lucide-react";
import { useEffect, useState, type KeyboardEvent } from "react";
import { DetailSection } from "@/components/detail/detail-parts";
import { addTag, normalizeTag, removeTag } from "@/components/task-detail/task-reminders-tags";
import { suggestTags } from "@/lib/api/events";
import { tagAccentStyle } from "@/lib/tags/tag-color";
import styles from "./edit.module.css";

interface EditTagSectionProps {
  tags: string[];
  /** O id do título da seção: cada formulário tem o seu. */
  labelId: string;
  /** O nome da lista para o leitor de tela: "Tags do evento", "Tags do artefato". */
  listLabel: string;
  onChange: (tags: string[]) => void;
}

const SUGGESTION_LIMIT = 6;
const SUGGESTION_DELAY_MS = 200;

/**
 * "Tags": um chip por tag, com remover, e o campo "Nova tag" na mesma linha. Ao
 * digitar, a API sugere tags do usuário; a sugestão mantém o começo do nome.
 * Enter ou vírgula confirma a sugestão destacada, ou o texto digitado. Quem
 * não usa a sugestão termina a tag na mão: uma falha de sugestão não aparece.
 */
export function EditTagSection({ tags, labelId, listLabel, onChange }: EditTagSectionProps) {
  const [text, setText] = useState("");
  const [names, setNames] = useState<string[]>([]);
  const [highlighted, setHighlighted] = useState(0);
  const [open, setOpen] = useState(false);

  const query = normalizeTag(text);
  // A resposta pode chegar para um texto que já mudou: a lista só mostra o que começa com o texto atual.
  const suggestions = query ? names.filter((name) => name.startsWith(query) && !tags.includes(name)) : [];
  const shown = open ? suggestions : [];

  useEffect(() => {
    if (!query) return;
    let stale = false;
    const timer = setTimeout(() => {
      suggestTags(query, SUGGESTION_LIMIT)
        .then((found) => {
          if (stale) return;
          setNames(found.map((tag) => tag.name));
          setHighlighted(0);
        })
        .catch(() => {
          if (!stale) setNames([]);
        });
    }, SUGGESTION_DELAY_MS);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [query]);

  function commit(raw: string) {
    const next = addTag(tags, raw);
    setText("");
    setOpen(false);
    if (next.length !== tags.length) onChange(next);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      commit(shown[highlighted] ?? text);
      return;
    }
    if (event.key === "Backspace" && text === "" && tags.length) {
      onChange(tags.slice(0, -1));
      return;
    }
    if (event.key === "ArrowDown" && shown.length) {
      event.preventDefault();
      setHighlighted((current) => (current + 1) % shown.length);
      return;
    }
    if (event.key === "ArrowUp" && shown.length) {
      event.preventDefault();
      setHighlighted((current) => (current - 1 + shown.length) % shown.length);
      return;
    }
    if (event.key === "Escape") setOpen(false);
  }

  return (
    <DetailSection title="Tags" labelId={labelId}>
      <div className={styles.sectionBody}>
        <div className={styles.chips}>
          {tags.length ? (
            <ul className={styles.chips} aria-label={listLabel} style={{ display: "contents" }}>
              {tags.map((tag) => (
                <li key={tag}>
                  <button
                    type="button"
                    className={styles.chip}
                    style={tagAccentStyle(tag)}
                    aria-label={`Remover tag ${tag}`}
                    onClick={() => onChange(removeTag(tags, tag))}
                  >
                    <span>#{tag}</span>
                    <X className={styles.chipIcon} aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          <span className={styles.field} data-chip>
            <Plus className={styles.plus} aria-hidden />
            <input
              type="text"
              aria-label="Nova tag"
              placeholder="Nova tag"
              autoComplete="off"
              value={text}
              onChange={(change) => {
                setText(change.target.value);
                setOpen(true);
              }}
              onKeyDown={handleKeyDown}
              onFocus={() => setOpen(true)}
              onBlur={() => {
                commit(text);
              }}
            />
          </span>
        </div>

        {shown.length ? (
          <ul className={styles.suggestions} aria-label="Sugestões de tags">
            {shown.map((name, index) => (
              <li key={name}>
                <button
                  type="button"
                  className={styles.suggestion}
                  data-highlighted={index === highlighted || undefined}
                  // Sem isto o clique tira o foco do campo antes da escolha, e a tag digitada seria gravada no blur.
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => commit(name)}
                >
                  #{name}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </DetailSection>
  );
}
