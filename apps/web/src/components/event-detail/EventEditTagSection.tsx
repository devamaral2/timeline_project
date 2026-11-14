"use client";

import { X } from "lucide-react";
import { useEffect, useState, type KeyboardEvent } from "react";
import { DetailSection, detailIcon } from "@/components/detail/detail-parts";
import { suggestTags } from "@/lib/api/events";
import { tagColorStyle } from "@/lib/tags/tag-color";
import type { EventDraft, EventDraftField } from "./event-draft";
import { addTag, normalizeTag, removeTag } from "./event-reminders-tags";
import styles from "./event-edit-lists.module.css";

interface EventEditTagSectionProps {
  draft: EventDraft;
  onChange: <K extends EventDraftField>(field: K, value: EventDraft[K]) => void;
}

const SUGGESTION_LIMIT = 6;
const SUGGESTION_DELAY_MS = 200;

/**
 * "Tags": um chip por tag, com remover, e um campo para digitar a próxima. Ao
 * digitar, a API sugere tags do usuário; a sugestão mantém o começo do nome.
 * Enter ou vírgula confirma a sugestão destacada, ou o texto digitado. Quem
 * não usa a sugestão termina a tag na mão: uma falha de sugestão não aparece.
 */
export function EventEditTagSection({ draft, onChange }: EventEditTagSectionProps) {
  const [text, setText] = useState("");
  const [names, setNames] = useState<string[]>([]);
  const [highlighted, setHighlighted] = useState(0);
  const [open, setOpen] = useState(false);

  const query = normalizeTag(text);
  // A resposta pode chegar para um texto que já mudou: a lista só mostra o que começa com o texto atual.
  const suggestions = query ? names.filter((name) => name.startsWith(query) && !draft.tags.includes(name)) : [];
  const shown = open ? suggestions : [];

  useEffect(() => {
    if (!query) return;
    let stale = false;
    const timer = setTimeout(() => {
      suggestTags(query, SUGGESTION_LIMIT)
        .then((tags) => {
          if (stale) return;
          setNames(tags.map((tag) => tag.name));
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
    const next = addTag(draft.tags, raw);
    setText("");
    setOpen(false);
    if (next.length !== draft.tags.length) onChange("tags", next);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      commit(shown[highlighted] ?? text);
      return;
    }
    if (event.key === "Backspace" && text === "" && draft.tags.length) {
      onChange("tags", draft.tags.slice(0, -1));
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
    <DetailSection title="Tags" labelId="event-edit-tags">
      <div className={styles.tagBox}>
        {draft.tags.length ? (
          <ul className={styles.chips} aria-label="Tags do evento">
            {draft.tags.map((tag) => (
              <li key={tag}>
                <button
                  type="button"
                  className={styles.chip}
                  style={tagColorStyle(tag)}
                  aria-label={`Remover tag ${tag}`}
                  onClick={() => onChange("tags", removeTag(draft.tags, tag))}
                >
                  <span>#{tag}</span>
                  <X {...detailIcon} className={styles.chipIcon} />
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        <input
          id="event-tag-input"
          type="text"
          aria-label="Nova tag"
          placeholder="Nova tag"
          autoComplete="off"
          value={text}
          className={styles.tagInput}
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
    </DetailSection>
  );
}
