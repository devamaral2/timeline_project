"use client";

import { ArrowLeft } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useMotionRouter } from "@/components/shell/navigation-motion";
import { type ComponentType, type ReactNode, useEffect, useState } from "react";
import { type EditItemFormProps, type NewItemFormProps, NewNoteForm, NewTaskForm } from "./new-item-forms";
import { authedFetch } from "@/lib/api/authed-fetch";
import type { TaskDetailDto } from "@/lib/api/contracts";
import type { ArtifactDto } from "@repo/contracts";
import { getArtifact } from "@/lib/api/artifacts";
import styles from "@/components/shell/shell.module.css";

/**
 * A rota de criação de nota (`/notas/nova`): o mesmo formulário do menu "Buscar e
 * criar", em tela cheia. Salvar abre a nota criada; a seta volta à lista. `?nome=`
 * preenche o título. A criação de evento tem a sua rota (`/eventos/novo`).
 */
function NewItemRoute({ userId, title, listPath, Form }: { userId: string; title: string; listPath: string; Form: ComponentType<NewItemFormProps> }): ReactNode {
  const router = useMotionRouter();
  const initialName = useSearchParams().get("nome") ?? undefined;
  return (
    <main id="conteudo" className={styles.newEventPage}>
      <div className={styles.pickerHeader}>
        <button type="button" className={styles.pickerBack} onClick={() => router.replace(`/${userId}${listPath}`)} aria-label="Cancelar"><ArrowLeft aria-hidden /></button>
        <h1>{title}</h1>
      </div>
      <Form initialName={initialName} onCreated={path => router.replace(`/${userId}${path}`)} />
    </main>
  );
}

export const NewNoteRoute = ({ userId }: { userId: string }) => <NewItemRoute userId={userId} title="Nova nota" listPath="/notas" Form={NewNoteForm} />;

/**
 * As rotas de edição de tarefa e de nota (`/tarefas/:id/editar`, `/notas/:id/editar`): o formulário
 * de criar, preenchido com o item. Salvar ou cancelar volta ao detalhe.
 */
function EditItemRoute<Item>({ userId, title, apiPath, detailPath, Form }: {
  userId: string; title: string; apiPath: string; detailPath: string; Form: ComponentType<EditItemFormProps<Item>>;
}): ReactNode {
  const router = useMotionRouter();
  const [item, setItem] = useState<Item | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void authedFetch<Item>(apiPath).then(data => { if (!cancelled) setItem(data); }).catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [apiPath]);
  const back = () => router.replace(`/${userId}${detailPath}`);
  return (
    <main id="conteudo" className={styles.newEventPage}>
      <div className={styles.pickerHeader}>
        <button type="button" className={styles.pickerBack} onClick={back} aria-label="Cancelar"><ArrowLeft aria-hidden /></button>
        <h1>{title}</h1>
      </div>
      {failed ? <p role="alert">Não foi possível carregar o item. Tente novamente.</p>
        : item ? <Form existing={item} onCreated={path => router.replace(`/${userId}${path}`)} />
        : <p role="status">Carregando…</p>}
    </main>
  );
}

export const EditTaskRoute = ({ userId, taskId }: { userId: string; taskId: string }) =>
  <EditItemRoute<TaskDetailDto> userId={userId} title="Editar tarefa" apiPath={`/api/tasks/${taskId}`} detailPath={`/tarefas/${taskId}`} Form={NewTaskForm} />;
/**
 * A edição da nota de texto (`/notas/:id/editar`): carrega o artefato e monta o formulário de criar com ele.
 * Só a nota de texto se edita aqui; os outros tipos e o catálogo global voltam ao detalhe.
 */
export function EditNoteRoute({ userId, noteId }: { userId: string; noteId: string }): ReactNode {
  const router = useMotionRouter();
  const [note, setNote] = useState<ArtifactDto | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void getArtifact(noteId).then(
      (loaded) => { if (!cancelled) setNote(loaded); },
      () => { if (!cancelled) setFailed(true); },
    );
    return () => { cancelled = true; };
  }, [noteId]);
  const back = () => router.replace(`/${userId}/notas/${noteId}`);
  return (
    <main id="conteudo" className={styles.newEventPage}>
      <div className={styles.pickerHeader}>
        <button type="button" className={styles.pickerBack} onClick={back} aria-label="Cancelar"><ArrowLeft aria-hidden /></button>
        <h1>Editar nota</h1>
      </div>
      {failed ? <p role="alert">Não foi possível carregar a nota. Tente novamente.</p>
        : !note ? <p role="status">Carregando…</p>
        : note.type !== "text" || note.global ? <p role="alert">Esta nota não se edita aqui.</p>
        : <NewNoteForm existing={note} onCreated={path => router.replace(`/${userId}${path}`)} />}
    </main>
  );
}
