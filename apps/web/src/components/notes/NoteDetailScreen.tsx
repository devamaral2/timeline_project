"use client";

import { FileText, ListChecks, Pencil, Trash2, Unlink } from "lucide-react";
import { formatTime } from "@repo/timeline";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ActionPill, BackLink, DetailActions, DetailFact, DetailFacts, DetailFrame, DetailHeading, DetailMenu, DetailMessage,
  DetailNav, DetailOrigin, DetailSection, LinkList, LinkRow, MenuItem, OriginLink, TagPills, detailIcon,
} from "@/components/detail/detail-parts";
import { authedFetch } from "@/lib/api/authed-fetch";
import type { NoteDto } from "@/lib/api/contracts";
import { useNow } from "@/lib/events/use-now";
import { noteDates, primaryLinkOf, sleepAgendaOf, whenLabel } from "@/lib/notes/notes-model";
import { hasPendingMeal, pendingMealEditMessage } from "@/lib/notes/meal-generation";
import { usePendingMealRefresh } from "@/lib/notes/use-pending-meal-refresh";
import { EntityAiEditBar } from "@/components/detail/EntityAiEditBar";
import { editEntityTypeOfNote } from "@/lib/ai-process/entity-edit";
import { DeleteNoteDialog } from "./DeleteNoteDialog";
import { NoteContent } from "./NoteContent";
import { NoteEditorDialog } from "./NoteEditorDialog";
import { originOfLink } from "./NoteOrigin";
import { AgentFileNoteView } from "./AgentFileNoteView";
import { agentFileKindLabel, isAgentFileNote } from "@/lib/notes/agent-file-notes";

/**
 * A nota aberta, em duas colunas. À esquerda: voltar, quando foi atualizada (em
 * mono), o título na serifa, a origem (o evento ou a tarefa principal), tags e
 * criação, e as ações (editar, soltar da origem, excluir — pílulas no desktop,
 * menu "mais ações" no celular). À direita: o conteúdo, os outros vínculos e o
 * campo do Hermes.
 */
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

  const frame = { leadLabel: "Resumo da nota", bodyLabel: "Conteúdo da nota" };
  const backOnly = <DetailNav label="Navegação do registro" back={<BackLink href={listHref}>Notas</BackLink>} />;
  if (error) {
    return <DetailFrame {...frame} lead={backOnly}><DetailMessage alert>Não foi possível carregar a nota. Tente novamente.</DetailMessage></DetailFrame>;
  }
  if (!note) {
    return <DetailFrame {...frame} lead={backOnly}><DetailMessage>Carregando nota…</DetailMessage></DetailFrame>;
  }

  const links = note.links ?? [];
  const dates = now ? noteDates(note, now) : null;
  const sleep = sleepAgendaOf(note);
  const editType = editEntityTypeOfNote(note);

  const origin = primaryLinkOf(note);
  const otherLinks = links.filter((link) => link !== origin);
  const otherTasks = otherLinks.filter((link) => link.kind === "task");
  const otherEvents = otherLinks.filter((link) => link.kind === "event");
  const readOnly = isAgentFileNote(note) || note.type === "router";
  const kindLabel = isAgentFileNote(note) ? agentFileKindLabel(note.type) : note.type === "router" ? "Roteador" : null;
  const stamp = dates ? (dates.edited ? `Atualizada ${dates.edited}` : `Criada ${dates.created}`) : null;
  const edit = () => { if (note.type === "text") router.push(`${listHref}/${note.id}/editar`); else setEditing(true); };
  const blocked = pendingMeal ? pendingMealEditMessage : undefined;

  /** "Evento · hoje, 09:00 — 10:30" / "Tarefa · hoje, 09:00". */
  function linkMeta(link: (typeof links)[number]) {
    const label = link.kind === "event" ? "Evento" : "Tarefa";
    if (!link.at || !now) return label;
    return `${label} · ${whenLabel(link.at, now)}${link.endsAt ? ` — ${formatTime(link.endsAt)}` : ""}`;
  }

  function linkRow(link: (typeof links)[number]) {
    const { Icon } = originOfLink(link);
    return link.kind === "event"
      ? <LinkRow key={`event-${link.id}`} kind="event" icon={<Icon {...detailIcon} />} title={link.name} sub={linkMeta(link)} href={`/${userId}/eventos/${link.id}`} />
      : <LinkRow key={`task-${link.id}`} kind="task" icon={<ListChecks {...detailIcon} />} title={link.name} sub={linkMeta(link)} href={`/${userId}/tarefas/${link.id}`} />;
  }

  function originRow() {
    if (!origin) return null;
    const { Icon } = originOfLink(origin);
    const live = Boolean(origin.kind === "event" && now && origin.at && origin.endsAt && Date.parse(origin.at) <= now.getTime() && now.getTime() < Date.parse(origin.endsAt));
    return (
      <OriginLink
        href={origin.kind === "event" ? `/${userId}/eventos/${origin.id}` : `/${userId}/tarefas/${origin.id}`}
        icon={origin.kind === "event" ? <Icon {...detailIcon} /> : <ListChecks {...detailIcon} />}
        type={origin.kind === "event" ? origin.eventKind : undefined}
        live={live}
        meta={linkMeta(origin)}
        title={origin.name}
      />
    );
  }

  return (
    <DetailFrame
      {...frame}
      lead={
        <>
          <DetailNav label="Navegação do registro" back={<BackLink href={listHref}>Notas</BackLink>}>
            {readOnly ? null : (
              <DetailMenu label="Mais ações: editar, soltar, excluir">
                {(close) => (
                  <>
                    <MenuItem icon={<Pencil {...detailIcon} />} disabled={pendingMeal} title={blocked} onClick={() => { close(); edit(); }}>Editar</MenuItem>
                    {links.length ? <MenuItem icon={<Unlink {...detailIcon} />} disabled={pendingMeal} title={blocked} onClick={() => { close(); void detach(); }}>Soltar da origem</MenuItem> : null}
                    <MenuItem icon={<Trash2 {...detailIcon} />} danger onClick={() => { close(); setDeleting(true); }}>Excluir</MenuItem>
                  </>
                )}
              </DetailMenu>
            )}
          </DetailNav>

          <DetailHeading eyebrow={kindLabel ?? stamp}>{note.name}</DetailHeading>

          {originRow()}

          {note.tags.length || dates ? (
            <DetailFacts label="Informações">
              {note.tags.length ? <DetailFact label="Tags"><TagPills tags={note.tags} label="Tags da nota" /></DetailFact> : null}
              {dates ? <DetailFact label="Criada">{dates.created.replace(/^em /, "")}</DetailFact> : null}
              {kindLabel && dates?.edited ? <DetailFact label="Atualizada">{dates.edited}</DetailFact> : null}
            </DetailFacts>
          ) : null}

          {readOnly ? null : (
            <DetailActions>
              <ActionPill icon={<Pencil {...detailIcon} />} disabled={pendingMeal} title={blocked} onClick={edit}>Editar</ActionPill>
              {links.length ? <ActionPill icon={<Unlink {...detailIcon} />} disabled={pendingMeal} title={blocked} onClick={() => void detach()}>Soltar da origem</ActionPill> : null}
              <ActionPill icon={<Trash2 {...detailIcon} />} danger onClick={() => setDeleting(true)}>Excluir</ActionPill>
            </DetailActions>
          )}
        </>
      }
    >
      {isAgentFileNote(note)
        ? <AgentFileNoteView note={note} />
        : <NoteContent note={note} title={sleep?.title} agendaMinutes={sleep?.agendaMinutes} />}
      {pendingMeal ? <DetailMessage>{pendingMealEditMessage}</DetailMessage> : null}
      {actionError ? <DetailMessage alert>{actionError}</DetailMessage> : null}

      {otherTasks.length ? <DetailSection title="Tarefas vinculadas" labelId="nt-links-tasks" count={otherTasks.length > 1 ? otherTasks.length : undefined}><LinkList>{otherTasks.map(linkRow)}</LinkList></DetailSection> : null}
      {otherEvents.length ? <DetailSection title="Eventos vinculados" labelId="nt-links-events" count={otherEvents.length > 1 ? otherEvents.length : undefined}><LinkList>{otherEvents.map(linkRow)}</LinkList></DetailSection> : null}

      <DetailOrigin id="note" />

      {editType ? (
        <EntityAiEditBar
          userId={userId}
          entityType={editType}
          entityId={note.id}
          disabledReason={blocked}
          onEdited={() => setReloadKey((key) => key + 1)}
          context={{ icon: <FileText aria-hidden />, meta: stamp ? `Nota · ${stamp.charAt(0).toLocaleLowerCase("pt-BR")}${stamp.slice(1)}` : "Nota", title: note.name }}
        />
      ) : null}

      {editing ? <NoteEditorDialog note={note} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); setReloadKey((key) => key + 1); }} /> : null}
      {deleting ? <DeleteNoteDialog noteId={note.id} noteName={note.name} onClose={() => setDeleting(false)} onDeleted={() => router.push(listHref)} /> : null}
    </DetailFrame>
  );
}
