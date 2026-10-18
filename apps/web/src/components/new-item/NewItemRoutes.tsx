"use client";

import { ArrowLeft } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { type ComponentType, type ReactNode, useEffect, useState } from "react";
import { type EditItemFormProps, NewEventForm, type NewItemFormProps, NewNoteForm, NewTaskForm } from "@/app/mockups/eventos/new-item-forms";
import { authedFetch } from "@/lib/api/authed-fetch";
import type { EventDetailDto, NoteDto, TaskDetailDto } from "@/lib/api/contracts";
import styles from "@/app/mockups/eventos/mockup.module.css";

/**
 * As rotas de criação manual (`/tarefas/nova`, `/eventos/novo`, `/notas/nova`): o
 * mesmo formulário do menu "Buscar e criar", em tela cheia. Salvar abre o item
 * criado; a seta volta à lista. `?nome=` preenche o título.
 */
function NewItemRoute({ userId, title, listPath, Form }: { userId: string; title: string; listPath: string; Form: ComponentType<NewItemFormProps> }): ReactNode {
  const router = useRouter();
  const initialName = useSearchParams().get("nome") ?? undefined;
  return (
    <div className={styles.newEventPage}>
      <div className={styles.pickerHeader}>
        <button type="button" className={styles.pickerBack} onClick={() => router.replace(`/${userId}${listPath}`)} aria-label="Cancelar"><ArrowLeft aria-hidden /></button>
        <h1>{title}</h1>
      </div>
      <Form initialName={initialName} onCreated={path => router.replace(`/${userId}${path}`)} />
    </div>
  );
}

export const NewTaskRoute = ({ userId }: { userId: string }) => <NewItemRoute userId={userId} title="Nova tarefa" listPath="/tarefas" Form={NewTaskForm} />;
export const NewNoteRoute = ({ userId }: { userId: string }) => <NewItemRoute userId={userId} title="Nova nota" listPath="/notas" Form={NewNoteForm} />;
export const NewEventRoute = ({ userId }: { userId: string }) => <NewItemRoute userId={userId} title="Novo evento" listPath="" Form={NewEventForm} />;

/**
 * As rotas de edição (`/eventos/:id/editar`, `/tarefas/:id/editar`, `/notas/:id/editar`): o formulário
 * de criar, preenchido com o item. Salvar ou cancelar volta ao detalhe.
 */
function EditItemRoute<Item>({ userId, title, apiPath, detailPath, Form }: {
  userId: string; title: string; apiPath: string; detailPath: string; Form: ComponentType<EditItemFormProps<Item>>;
}): ReactNode {
  const router = useRouter();
  const [item, setItem] = useState<Item | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void authedFetch<Item>(apiPath).then(data => { if (!cancelled) setItem(data); }).catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [apiPath]);
  const back = () => router.replace(`/${userId}${detailPath}`);
  return (
    <div className={styles.newEventPage}>
      <div className={styles.pickerHeader}>
        <button type="button" className={styles.pickerBack} onClick={back} aria-label="Cancelar"><ArrowLeft aria-hidden /></button>
        <h1>{title}</h1>
      </div>
      {failed ? <p role="alert">Não foi possível carregar o item. Tente novamente.</p>
        : item ? <Form existing={item} onCreated={path => router.replace(`/${userId}${path}`)} />
        : <p role="status">Carregando…</p>}
    </div>
  );
}

export const EditTaskRoute = ({ userId, taskId }: { userId: string; taskId: string }) =>
  <EditItemRoute<TaskDetailDto> userId={userId} title="Editar tarefa" apiPath={`/api/tasks/${taskId}`} detailPath={`/tarefas/${taskId}`} Form={NewTaskForm} />;
export const EditNoteRoute = ({ userId, noteId }: { userId: string; noteId: string }) =>
  <EditItemRoute<NoteDto> userId={userId} title="Editar nota" apiPath={`/api/notes/${noteId}`} detailPath={`/notas/${noteId}`} Form={NewNoteForm} />;
export const EditEventRoute = ({ userId, eventId }: { userId: string; eventId: string }) =>
  <EditItemRoute<EventDetailDto> userId={userId} title="Editar evento" apiPath={`/api/events/${eventId}`} detailPath={`/eventos/${eventId}`} Form={NewEventForm} />;
