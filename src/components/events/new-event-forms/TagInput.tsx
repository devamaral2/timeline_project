"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { tagAccentStyle, tagColorStyle } from "@/lib/tags/tag-color";
import type { TagSuggestionDto } from "@/models/events/application/dtos/tag-suggestion.dto";
import { fieldLabelClass } from "./field-styles";

interface TagInputProps {
  tags: string[];
  onTagsChange: (tags: string[]) => void;
}

/**
 * Campo de tags com chips coloridos e autocomplete. A sugestao e buscada so
 * com o trecho apos a ultima virgula (o que esta sendo digitado agora), nao
 * com a lista inteira ja digitada.
 */
export function TagInput({ tags, onTagsChange }: TagInputProps) {
  const [draft, setDraft] = useState("");
  const [suggestions, setSuggestions] = useState<TagSuggestionDto[]>([]);
  const [highlighted, setHighlighted] = useState(0);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const query = draft.trim();
    if (!query) {
      setSuggestions([]);
      return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => {
      fetch(`/api/tags?query=${encodeURIComponent(query)}&limit=6`, { signal: controller.signal })
        .then((response) => (response.ok ? (response.json() as Promise<TagSuggestionDto[]>) : []))
        .then((data) => {
          setSuggestions(data.filter((suggestion) => !tags.includes(suggestion.name)));
          setHighlighted(0);
        })
        .catch(() => {});
    }, 200);

    return () => {
      controller.abort();
      clearTimeout(timeout);
    };
  }, [draft, tags]);

  function commitDraft(value: string) {
    const name = value.trim().toLowerCase();
    setDraft("");
    setSuggestions([]);
    if (!name || tags.includes(name)) return;
    onTagsChange([...tags, name]);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      if (open && suggestions[highlighted]) commitDraft(suggestions[highlighted].name);
      else commitDraft(draft);
      return;
    }
    if (event.key === "Backspace" && draft === "" && tags.length) {
      onTagsChange(tags.slice(0, -1));
      return;
    }
    if (event.key === "ArrowDown" && suggestions.length) {
      event.preventDefault();
      setHighlighted((current) => (current + 1) % suggestions.length);
      return;
    }
    if (event.key === "ArrowUp" && suggestions.length) {
      event.preventDefault();
      setHighlighted((current) => (current - 1 + suggestions.length) % suggestions.length);
      return;
    }
    if (event.key === "Escape") setOpen(false);
  }

  return (
    <div className="relative flex flex-col gap-1.5">
      <label htmlFor="event-tags" className={fieldLabelClass}>
        Tags
      </label>
      <div className="flex min-h-11 flex-wrap items-center gap-1.5 rounded-lg border border-border bg-background px-2 py-1.5 focus-within:border-primary">
        {tags.map((tag) => (
          <span
            key={tag}
            style={tagColorStyle(tag)}
            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-medium"
          >
            #{tag}
            <button
              type="button"
              onClick={() => onTagsChange(tags.filter((current) => current !== tag))}
              aria-label={`Remover tag ${tag}`}
              className="rounded-full hover:opacity-70"
            >
              <X aria-hidden className="size-3" />
            </button>
          </span>
        ))}
        <input
          id="event-tags"
          type="text"
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            setOpen(true);
          }}
          onKeyDown={handleKeyDown}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            commitDraft(draft);
            setOpen(false);
          }}
          placeholder={tags.length ? "" : "Ex.: foco, manhã"}
          className="min-w-[80px] flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
        />
      </div>

      {open && suggestions.length ? (
        <ul className="absolute top-full z-10 mt-1 w-full overflow-hidden rounded-lg border border-border bg-card shadow-card-hover">
          {suggestions.map((suggestion, index) => (
            <li key={suggestion.id}>
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => commitDraft(suggestion.name)}
                className={cn(
                  "flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-foreground",
                  index === highlighted ? "bg-accent" : "hover:bg-accent",
                )}
              >
                <span
                  aria-hidden
                  style={tagAccentStyle(suggestion.name)}
                  className="size-2 shrink-0 rounded-full bg-current"
                />
                {suggestion.name}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
