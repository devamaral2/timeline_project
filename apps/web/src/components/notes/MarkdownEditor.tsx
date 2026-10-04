"use client";

import { useEffect, useLayoutEffect, useRef, type KeyboardEvent, type Ref } from "react";
import { continueMarkdownList, toggleWrap, type TextEdit } from "@/lib/notes/markdown-editing";
import { cn } from "@/lib/utils";
import { fieldTextareaClass } from "@/components/events/new-event-forms/field-styles";
import { MarkdownView } from "./MarkdownView";

/** Como o editor mostra o texto: só a fonte, fonte e leitura lado a lado, ou só a leitura. */
export type MarkdownEditorMode = "write" | "split" | "read";

export const markdownEditorModes: ReadonlyArray<{ key: MarkdownEditorMode; label: string; splitOnly?: boolean }> = [
  { key: "write", label: "Escrever" },
  { key: "split", label: "Dividido", splitOnly: true },
  { key: "read", label: "Visualizar" },
];

interface MarkdownEditorProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  mode: MarkdownEditorMode;
  onModeChange: (mode: MarkdownEditorMode) => void;
  placeholder?: string;
  textareaRef?: Ref<HTMLTextAreaElement>;
}

/**
 * O editor de markdown das notas, ao modo do Obsidian: a fonte em um painel e a
 * leitura no outro (ou uma de cada vez). Enter continua listas, Ctrl+B e Ctrl+I
 * envolvem a seleção e Ctrl+E abre a visualização.
 */
export function MarkdownEditor({ id, value, onChange, mode, onModeChange, placeholder, textareaRef }: MarkdownEditorProps) {
  const localRef = useRef<HTMLTextAreaElement | null>(null);
  const pendingSelection = useRef<{ start: number; end: number } | null>(null);

  // A seleção só pode ser posta depois que o React devolve o novo valor ao textarea; sem seleção pendente, não faz nada.
  useLayoutEffect(() => {
    const selection = pendingSelection.current;
    const textarea = localRef.current;
    if (!selection || !textarea) return;
    pendingSelection.current = null;
    textarea.setSelectionRange(selection.start, selection.end);
  });

  // Voltar da leitura monta o textarea de novo: o foco volta para ele.
  const previousMode = useRef(mode);
  useEffect(() => {
    if (previousMode.current === "read" && mode !== "read") localRef.current?.focus();
    previousMode.current = mode;
  }, [mode]);

  function setRefs(node: HTMLTextAreaElement | null) {
    localRef.current = node;
    if (typeof textareaRef === "function") textareaRef(node);
    else if (textareaRef) (textareaRef as { current: HTMLTextAreaElement | null }).current = node;
  }

  function apply(edit: TextEdit) {
    pendingSelection.current = { start: edit.selectionStart, end: edit.selectionEnd };
    onChange(edit.value);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    const { selectionStart, selectionEnd } = event.currentTarget;
    const shortcut = event.ctrlKey || event.metaKey;

    if (event.key === "Enter" && !shortcut && !event.shiftKey && !event.nativeEvent.isComposing) {
      const edit = continueMarkdownList(value, selectionStart, selectionEnd);
      if (edit) {
        event.preventDefault();
        apply(edit);
      }
      return;
    }
    if (!shortcut || event.altKey) return;
    const key = event.key.toLowerCase();
    if (key === "b" || key === "i") {
      event.preventDefault();
      apply(toggleWrap(value, selectionStart, selectionEnd, key === "b" ? "**" : "*"));
    } else if (key === "e") {
      event.preventDefault();
      onModeChange("read");
    }
  }

  const showSource = mode !== "read";
  const showPreview = mode !== "write";

  return (
    <div className="flex flex-col gap-2">
      <fieldset className="m-0 flex w-fit min-w-0 gap-1 rounded-lg border border-input p-0.5">
        <legend className="sr-only">Modo do editor</legend>
        {markdownEditorModes.map(({ key, label, splitOnly }) => (
          <button
            key={key}
            type="button"
            aria-pressed={mode === key}
            onClick={() => onModeChange(key)}
            className={cn(
              "h-7 rounded-md px-3 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground",
              "aria-pressed:bg-foreground/10 aria-pressed:text-foreground",
              splitOnly && "max-md:hidden",
            )}
          >
            {label}
          </button>
        ))}
      </fieldset>

      <div className={cn("grid gap-3", mode === "split" && "md:grid-cols-2")}>
        {showSource ? (
          <textarea
            id={id}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            rows={12}
            spellCheck
            ref={setRefs}
            className={cn(fieldTextareaClass, "min-h-64 font-mono leading-6 md:text-[13px]")}
          />
        ) : null}
        {showPreview ? (
          <section
            aria-label="Visualização"
            className={cn("min-h-64 overflow-y-auto rounded-lg border border-input px-4 py-3", mode === "split" && "max-h-[22rem]")}
          >
            {value.trim() ? (
              <MarkdownView source={value} />
            ) : (
              <p className="text-sm text-muted-foreground">Nada para visualizar ainda.</p>
            )}
          </section>
        ) : null}
      </div>
    </div>
  );
}
