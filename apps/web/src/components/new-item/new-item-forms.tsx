"use client";

import { FileText, Utensils } from "lucide-react";
import { type FormEvent, useId, useState } from "react";
import type { ArtifactDto } from "@repo/contracts";
import { createArtifact, editArtifact, getArtifact } from "@/lib/api/artifacts";
import { ApiRequestError, newIdempotencyKey } from "@/lib/api/client-request";
import { MarkdownEditor, type MarkdownEditorMode } from "@/components/notes/MarkdownEditor";
import { TagInput } from "@/components/events/new-event-forms/TagInput";
import styles from "@/components/shell/shell.module.css";

/** Props comuns: `onCreated` recebe o caminho do item criado; `initialName` vem de `/tarefa comprar pão`. */
export interface NewItemFormProps {
  initialName?: string;
  onCreated: (path: string) => void;
  /** O evento troca o formulário pelo calendário; quem hospeda esconde o seu cabeçalho enquanto isso. */
  onPickerChange?: (open: boolean) => void;
}

/** Edição: o mesmo formulário, preenchido com o item; `onCreated` recebe o caminho do item salvo. */
export interface EditItemFormProps<Item> extends NewItemFormProps {
  existing?: Item;
}

const STALE_NOTE_MESSAGE = "Esta nota mudou em outro lugar. Atualizamos a revisão; o que você digitou continua aqui. Confira e salve de novo.";

/** Na criação, o formulário escolhe entre nota de texto e alimento (só o texto do que foi comido). */
type CreateKind = "note" | "food";

/**
 * Nova nota de texto ou alimento, e edição da nota de texto: o título é opcional (vem da primeira linha), o
 * conteúdo é markdown (Escrever e Visualizar) e há tags. A criação leva uma chave de idempotência guardada enquanto o
 * formulário estiver aberto; a edição manda a revisão lida e o conteúdo inteiro.
 */
export function NewNoteForm({ initialName, onCreated, existing }: EditItemFormProps<ArtifactDto>) {
  const contentId = useId();
  const [name, setName] = useState(existing?.name ?? initialName ?? "");
  const [content, setContent] = useState(existing?.type === "text" ? existing.data.body : "");
  const [tags, setTags] = useState<string[]>(existing?.tags ?? []);
  const [revision, setRevision] = useState(existing?.revision ?? 0);
  const [mode, setMode] = useState<MarkdownEditorMode>("write");
  // Uma chave por tipo: trocar de Nota para Alimento e voltar não reaproveita a chave de outro corpo.
  const [idempotencyKeys] = useState(() => ({ note: newIdempotencyKey(), food: newIdempotencyKey() }));
  const [kind, setKind] = useState<CreateKind>("note");
  const [foodText, setFoodText] = useState("");
  const foodId = useId();
  const food = kind === "food" && !existing;
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Revisão velha: lê a revisão atual para a próxima tentativa. O texto digitado fica como está. */
  async function refreshRevision(artifactId: string) {
    try {
      setRevision((await getArtifact(artifactId)).revision);
    } catch {
      // Sem a revisão nova, a próxima tentativa avisa de novo.
    }
  }

  function chooseKind(next: CreateKind) {
    setKind(next);
    setError(null);
  }

  /** O alimento vai só com o texto do que foi comido; os nutrientes são calculados depois, pelo agente. */
  async function submitFood() {
    if (!foodText.trim()) { setError("Escreva o que você comeu."); return; }
    setSubmitting(true);
    setError(null);
    try {
      const artifactId = await createArtifact({ type: "food", data: { inputText: foodText.trim() } }, { idempotencyKey: idempotencyKeys.food });
      onCreated(`/notas/${artifactId}`);
    } catch {
      setError("Não foi possível criar o alimento. Tente novamente.");
      setSubmitting(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;
    if (food) { await submitFood(); return; }
    if (!content.trim()) { setError("Escreva o texto da nota."); return; }
    setSubmitting(true);
    setError(null);
    const title = name.trim() || undefined;
    if (existing) {
      try {
        await editArtifact(existing.id, { expectedRevision: revision, name: title, tags, type: "text", data: { body: content } });
        onCreated(`/notas/${existing.id}`);
      } catch (cause) {
        if (cause instanceof ApiRequestError && cause.kind === "stale_revision") {
          await refreshRevision(existing.id);
          setError(STALE_NOTE_MESSAGE);
        } else {
          setError("Não foi possível salvar a nota. Tente novamente.");
        }
        setSubmitting(false);
      }
      return;
    }
    try {
      const artifactId = await createArtifact({ type: "text", name: title, tags, data: { body: content } }, { idempotencyKey: idempotencyKeys.note });
      onCreated(`/notas/${artifactId}`);
    } catch {
      setError("Não foi possível criar a nota. Tente novamente.");
      setSubmitting(false);
    }
  }

  const submitLabel = existing ? (submitting ? "Salvando…" : "Salvar alterações") : food ? (submitting ? "Criando…" : "Criar alimento") : (submitting ? "Criando…" : "Criar nota");

  return <form className={styles.entityForm} onSubmit={event => void submit(event)} noValidate>
    {existing ? null : <fieldset className={styles.creationToggle} aria-label="Tipo do item">
      <button type="button" aria-pressed={kind === "note"} onClick={() => chooseKind("note")}><FileText aria-hidden /><span>Nota</span></button>
      <button type="button" aria-pressed={kind === "food"} onClick={() => chooseKind("food")}><Utensils aria-hidden /><span>Alimento</span></button>
    </fieldset>}
    {food ? <>
      <label htmlFor={foodId}>O que você comeu</label>
      <textarea id={foodId} className={styles.entityControl} rows={4} value={foodText} onChange={event => setFoodText(event.target.value)} placeholder="Ex.: arroz, feijão, frango grelhado e salada" />
    </> : <>
      <div className={styles.entityHeading}>
        <span><FileText aria-hidden /></span>
        <div><input className={styles.entityNameInput} aria-label="Nome da nota" value={name} onChange={event => setName(event.target.value)} placeholder="Nome da nota (opcional)" autoComplete="off" /></div>
      </div>
      <label htmlFor={contentId}>Conteúdo da nota</label>
      <MarkdownEditor
        id={contentId}
        value={content}
        onChange={setContent}
        mode={mode}
        onModeChange={setMode}
        placeholder="Escreva em markdown: ## subtítulo, **negrito**, - lista, - [ ] tarefa, > citação."
      />
      <TagInput tags={tags} onTagsChange={setTags} />
    </>}
    {error ? <p role="alert" className={styles.formError}>{error}</p> : null}
    <button type="submit" className={styles.entityContinue} disabled={submitting}>{submitLabel}</button>
  </form>;
}
