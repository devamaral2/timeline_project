"use client";

import { ListChecks, Pencil, Trash2, Unlink } from "lucide-react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BackLink, DetailHead, DetailMenu, DetailMessage, DetailOrigin, DetailScreen, DetailSection, DetailTitle,
  DetailTopBar, LinkGroup, LinkRow, MenuItem, Rule, Stamp, TagPills, detailIcon,
} from "@/components/detail/detail-parts";
import { authedFetch } from "@/lib/api/authed-fetch";
import type { NoteDto } from "@/lib/api/contracts";
import { useNow } from "@/lib/events/use-now";
import { noteDates, sleepAgendaOf, whenLabel } from "@/lib/notes/notes-model";
import { hasPendingMeal, pendingMealEditMessage } from "@/lib/notes/meal-generation";
import { usePendingMealRefresh } from "@/lib/notes/use-pending-meal-refresh";
import { EntityAiEditBar } from "@/components/detail/EntityAiEditBar";
import { editEntityTypeOfNote } from "@/lib/ai-process/entity-edit";
import shellStyles from "@/app/mockups/eventos/mockup.module.css";
import { DeleteNoteDialog } from "./DeleteNoteDialog";
import { NoteContent } from "./NoteContent";
import { NoteEditorDialog } from "./NoteEditorDialog";
import { originOfLink } from "./NoteOrigin";
import { AgentFileNoteView } from "./AgentFileNoteView";
import { agentFileKindLabel, isAgentFileNote } from "@/lib/notes/agent-file-notes";

/** A nota aberta: título, datas, tags, o conteúdo e os vínculos — com editar, soltar e excluir no menu. */
export function NoteDetailScreen({ userId, noteId }: { userId: string; noteId: string }) {
  const router = useRouter();
  const now = useNow();
  const [note, setNote] = useState<NoteDto | null>(null);
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const listHref = `/${userId}/notas`;
  const pendingMeal = hasPendingMeal(note ? [note] : []);
  usePendingMealRefresh(pendingMeal, async () => {
    setNote(await authedFetch<NoteDto>(`/api/notes/${noteId}`));
  });

  // biome-ignore lint/correctness/useExhaustiveDependencies: reloadKey força o refetch após editar.
  useEffect(() => {
    let cancelled = false;
    setError(false);
    void authedFetch<NoteDto>(`/api/notes/${noteId}`)
      .then((data) => { if (!cancelled) setNote(data); })
      .catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [noteId, reloadKey]);

  async function detach() {
    if (!note) return;
    setActionError(null);
    try {
      await authedFetch(`/api/notes/${note.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedRevision: note.revision, eventIds: [], taskIds: [] }),
      });
      setReloadKey((key) => key + 1);
    } catch {
      setActionError("Não foi possível soltar a nota. Tente novamente.");
    }
  }

  if (error) {
    return (
      <main id="conteudo" className={shellStyles.detailMain}>
        <DetailScreen>
          <DetailTopBar label="Nota" back={<BackLink href={listHref}>Notas</BackLink>} />
          <DetailMessage alert>Não foi possível carregar a nota. Tente novamente.</DetailMessage>
        </DetailScreen>
      </main>
    );
  }
  if (!note) {
    return <main id="conteudo" className={shellStyles.detailMain}><DetailMessage>Carregando nota…</DetailMessage></main>;
  }

  const links = note.links ?? [];
  const taskLinks = links.filter((link) => link.kind === "task");
  const eventLinks = links.filter((link) => link.kind === "event");
  const dates = now ? noteDates(note, now) : null;
  const sleep = sleepAgendaOf(note);
  const editType = editEntityTypeOfNote(note);

  function linkRow(link: (typeof links)[number]) {
    const { Icon } = originOfLink(link);
    const when = link.at && now ? ` · ${whenLabel(link.at, now)}` : "";
    return link.kind === "event"
      ? <LinkRow key={`event-${link.id}`} kind="event" icon={<Icon {...detailIcon} />} title={link.name} sub={`Evento${when}`} href={`/${userId}/eventos/${link.id}`} />
      : <LinkRow key={`task-${link.id}`} kind="task" icon={<ListChecks {...detailIcon} />} title={link.name} sub={`Tarefa${when}`} href={`/${userId}/tarefas/${link.id}`} />;
  }

  return (
    <main id="conteudo" className={shellStyles.detailMain}>
      <DetailScreen>
        <DetailTopBar label="Nota" back={<BackLink href={listHref}>Notas</BackLink>}>
          {isAgentFileNote(note) || note.type === "router" ? null : <DetailMenu label="Mais ações: editar, soltar, excluir">
            {(close) => (
              <>
                <MenuItem icon={<Pencil {...detailIcon} />} disabled={pendingMeal} title={pendingMeal ? pendingMealEditMessage : undefined} onClick={() => { close(); if (note.type === "text") router.push(`${listHref}/${note.id}/editar`); else setEditing(true); }}>Editar</MenuItem>
                {links.length ? <MenuItem icon={<Unlink {...detailIcon} />} disabled={pendingMeal} title={pendingMeal ? pendingMealEditMessage : undefined} onClick={() => { close(); void detach(); }}>Soltar da origem</MenuItem> : null}
                <MenuItem icon={<Trash2 {...detailIcon} />} danger onClick={() => { close(); setDeleting(true); }}>Excluir</MenuItem>
              </>
            )}
          </DetailMenu>}
        </DetailTopBar>

        <DetailHead>
          {isAgentFileNote(note) ? <Stamp>{agentFileKindLabel(note.type)}</Stamp> : null}
          {note.type === "router" ? <Stamp>Roteador</Stamp> : null}
          <DetailTitle>{note.name}</DetailTitle>
          <TagPills tags={note.tags} label="Tags da nota" />
          {dates ? <Stamp>Criada {dates.created}</Stamp> : null}
          {dates?.edited ? <Stamp>Editada {dates.edited}</Stamp> : null}
        </DetailHead>

        <Rule />

        {isAgentFileNote(note)
          ? <AgentFileNoteView note={note} />
          : <NoteContent note={note} title={sleep?.title} agendaMinutes={sleep?.agendaMinutes} />}
        {pendingMeal ? <DetailMessage>{pendingMealEditMessage}</DetailMessage> : null}
        {actionError ? <DetailMessage alert>{actionError}</DetailMessage> : null}

        {links.length ? (
          <DetailSection title="Vínculos" labelId="nt-links" className="links">
            {taskLinks.length ? <LinkGroup id="nt-links-tasks" title="Tarefas vinculadas" count={taskLinks.length}>{taskLinks.map(linkRow)}</LinkGroup> : null}
            {eventLinks.length ? <LinkGroup id="nt-links-events" title="Eventos vinculados" count={eventLinks.length}>{eventLinks.map(linkRow)}</LinkGroup> : null}
          </DetailSection>
        ) : null}

        <DetailOrigin id="note" />
      </DetailScreen>

      {editType ? (
        <EntityAiEditBar
          userId={userId}
          entityType={editType}
          entityId={note.id}
          disabledReason={pendingMeal ? pendingMealEditMessage : undefined}
          onEdited={() => setReloadKey((key) => key + 1)}
        />
      ) : null}

      {editing ? <NoteEditorDialog note={note} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); setReloadKey((key) => key + 1); }} /> : null}
      {deleting ? <DeleteNoteDialog noteId={note.id} noteName={note.name} onClose={() => setDeleting(false)} onDeleted={() => router.push(listHref)} /> : null}
    </main>
  );
}
