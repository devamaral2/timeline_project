"use client";

import { useId, useRef, useState } from "react";
import type { ArtifactDto, EventCardDto, EventKind } from "@repo/contracts";
import { DetailFrame, DetailMessage, DetailSection, detailStyles } from "@/components/detail/detail-parts";
import { AddButton, EditBar, EditCaret, EditFieldSection, EditFooter, EditSelect, RemoveButton, editStyles as edit } from "@/components/edit/edit-parts";
import { EditTagSection } from "@/components/edit/EditTagSection";
import { EntityPickerDialog } from "@/components/edit/EntityPickerDialog";
import { EventChoiceView, searchHumanEvents } from "@/components/edit/event-choice";
import { EventKindMark } from "@/components/events/event-kind-mark";
import { MarkdownEditor, type MarkdownEditorMode } from "@/components/notes/MarkdownEditor";
import { noteTypeIcon } from "@/components/notes/NoteSheet";
import { createArtifact, editArtifact, getArtifact } from "@/lib/api/artifacts";
import { ApiRequestError, newIdempotencyKey } from "@/lib/api/client-request";
import { artifactVisualType } from "@/lib/artifacts/artifact-model";
import { useNow } from "@/lib/events/use-now";
import { whenLabel } from "@/lib/notes/notes-model";
import styles from "./artifact-edit.module.css";

/** Na criação, o formulário escolhe entre nota de texto e alimento (só o texto do que foi comido). */
type CreateKind = "text" | "food";

const KIND_OPTIONS: { value: CreateKind; label: string }[] = [
  { value: "text", label: "Nota" },
  { value: "food", label: "Alimento" },
];

/** Um evento ligado ao artefato, com o que a linha mostra. `relation` só existe na ligação que já estava gravada. */
interface LinkedEvent {
  eventId: string;
  name: string;
  kind: EventKind;
  startedAt?: string;
  relation?: string;
}

interface ArtifactEditViewProps {
  /** A nota de texto lida. Sem ela, o formulário é de criação. */
  existing?: ArtifactDto;
  /** O nome de um artefato novo, vindo de `/nota ideias`. */
  initialName?: string;
  /** Chamado com o id do artefato salvo ou criado: a rota abre a leitura dele. */
  onSaved: (artifactId: string) => void;
  /** Descartar: volta para a tela de onde a pessoa veio. */
  onLeave: () => void;
}

const STALE_MESSAGE = "Esta nota mudou em outro lugar. Atualizamos a revisão; o que você digitou continua aqui. Confira e salve de novo.";

/** Só os eventos de pessoa entram na lista: os pedidos ao agente que tocaram o artefato não se editam por aqui. */
function linkedEventsOf(artifact: ArtifactDto | undefined): LinkedEvent[] {
  return (artifact?.events ?? [])
    .filter((link) => link.actor === "human")
    .map((link) => ({ eventId: link.eventId, name: link.name, kind: link.kind, startedAt: link.startedAt, relation: link.relation }));
}

/**
 * O formulário do artefato, na criação e na edição da nota de texto, no desenho do quadro "Detalhe · edição": o
 * topo só com o rótulo, o resumo (tipo e nome), as seções (conteúdo, tags e eventos) e o rodapé de Descartar e
 * Salvar. Na criação o tipo troca entre nota e alimento; o alimento vai só com o texto do que foi comido, e os
 * nutrientes são calculados depois, pelo agente. Os eventos entram pelo "+", que abre o modal de seleção. A
 * criação leva uma chave de idempotência guardada enquanto o formulário estiver aberto; a edição manda a
 * revisão lida e o conteúdo inteiro.
 */
export function ArtifactEditView({ existing, initialName, onSaved, onLeave }: ArtifactEditViewProps) {
  const now = useNow();
  const contentId = useId();
  const [kind, setKind] = useState<CreateKind>("text");
  const [name, setName] = useState(existing?.name ?? initialName ?? "");
  const [content, setContent] = useState(existing?.type === "text" ? existing.data.body : "");
  const [foodText, setFoodText] = useState("");
  const [tags, setTags] = useState<string[]>(existing?.tags ?? []);
  const [initialEvents] = useState(() => linkedEventsOf(existing));
  const [events, setEvents] = useState<LinkedEvent[]>(initialEvents);
  const [picking, setPicking] = useState(false);
  const [revision, setRevision] = useState(existing?.revision ?? 0);
  const [mode, setMode] = useState<MarkdownEditorMode>("write");
  // Uma chave por tipo: trocar de Nota para Alimento e voltar não reaproveita a chave de outro corpo.
  const [idempotencyKeys] = useState(() => ({ text: newIdempotencyKey(), food: newIdempotencyKey() }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A guarda vale antes da próxima renderização: dois toques seguidos não mandam duas requisições.
  const busy = useRef(false);

  const food = kind === "food" && !existing;
  const type = existing?.type ?? kind;
  const TypeIcon = noteTypeIcon(artifactVisualType(type));
  const eventIds = events.map((link) => link.eventId);
  const eventsChanged = eventIds.join(",") !== initialEvents.map((link) => link.eventId).join(",");

  /** Revisão velha: lê a revisão atual para a próxima tentativa. O texto digitado fica como está. */
  async function refreshRevision(artifactId: string) {
    try {
      setRevision((await getArtifact(artifactId)).revision);
    } catch {
      // Sem a revisão nova, a próxima tentativa avisa de novo.
    }
  }

  function fail(message: string) {
    busy.current = false;
    setSaving(false);
    setError(message);
  }

  async function save() {
    if (busy.current) return;
    if (food && !foodText.trim()) return setError("Escreva o que você comeu.");
    if (!food && !content.trim()) return setError("Escreva o texto da nota.");
    busy.current = true;
    setSaving(true);
    setError(null);
    const title = name.trim() || undefined;
    // Os eventos só vão no corpo quando a pessoa escolheu algum (criação) ou mexeu na lista (edição).
    const links = eventsChanged ? { eventIds } : {};

    if (existing) {
      try {
        await editArtifact(existing.id, { expectedRevision: revision, name: title, tags, type: "text", data: { body: content }, ...links });
        onSaved(existing.id);
      } catch (cause) {
        if (cause instanceof ApiRequestError && cause.kind === "stale_revision") {
          await refreshRevision(existing.id);
          fail(STALE_MESSAGE);
        } else {
          fail("Não foi possível salvar a nota. Tente novamente.");
        }
      }
      return;
    }

    try {
      const artifactId = food
        ? await createArtifact({ type: "food", data: { inputText: foodText.trim() }, ...links }, { idempotencyKey: idempotencyKeys.food })
        : await createArtifact({ type: "text", name: title, tags, data: { body: content }, ...links }, { idempotencyKey: idempotencyKeys.text });
      onSaved(artifactId);
    } catch {
      fail(food ? "Não foi possível criar o alimento. Tente novamente." : "Não foi possível criar a nota. Tente novamente.");
    }
  }

  function link(card: EventCardDto) {
    setEvents((current) => [...current, { eventId: card.id, name: card.name, kind: card.kind, startedAt: card.startedAt }]);
  }

  const typeMark = (
    <span className={styles.typeMark}>
      <TypeIcon className={styles.typeIcon} aria-hidden />
      <span className={styles.typeCode}>{type}</span>
    </span>
  );

  return (
    <DetailFrame
      edit
      leadLabel="Resumo do artefato"
      bodyLabel="Conteúdo do artefato"
      lead={
        <>
          <EditBar>{existing ? "Editar artefato" : "Novo artefato"}</EditBar>
          <div className={edit.summary}>
            <div className={edit.summaryRow}>
              {existing ? (
                <span className={edit.select} data-pill>{typeMark}</span>
              ) : (
                <EditSelect<CreateKind>
                  label="Tipo"
                  pill
                  value={kind}
                  options={KIND_OPTIONS}
                  onChange={(next) => {
                    setKind(next);
                    setError(null);
                  }}
                >
                  {typeMark}
                  <EditCaret />
                </EditSelect>
              )}
            </div>
            {food ? null : (
              <input
                type="text"
                aria-label="Nome do artefato"
                placeholder="Nome (opcional)"
                autoComplete="off"
                className={edit.titleInput}
                value={name}
                onChange={(change) => setName(change.target.value)}
              />
            )}
          </div>
        </>
      }
    >
      <form
        className={edit.form}
        aria-label="Campos do artefato"
        noValidate
        onSubmit={(submit) => {
          submit.preventDefault();
          void save();
        }}
      >
        {food ? (
          <EditFieldSection title="O que você comeu" labelId="artifact-edit-food">
            <textarea
              aria-labelledby="artifact-edit-food"
              className={edit.textarea}
              rows={4}
              placeholder="Ex.: arroz, feijão, frango grelhado e salada"
              value={foodText}
              onChange={(change) => setFoodText(change.target.value)}
            />
            <p className={edit.hint}>Os nutrientes são calculados depois de salvar.</p>
          </EditFieldSection>
        ) : (
          <>
            <DetailSection title="Conteúdo" labelId="artifact-edit-content">
              <div className={edit.sectionBody}>
                <label htmlFor={contentId} className={detailStyles.srOnly}>Conteúdo da nota</label>
                <MarkdownEditor
                  id={contentId}
                  value={content}
                  onChange={setContent}
                  mode={mode}
                  onModeChange={setMode}
                  placeholder="Escreva em markdown: ## subtítulo, **negrito**, - lista, - [ ] tarefa, > citação."
                />
              </div>
            </DetailSection>
            <EditTagSection tags={tags} labelId="artifact-edit-tags" listLabel="Tags do artefato" onChange={setTags} />
          </>
        )}

        <DetailSection title="Eventos" labelId="artifact-edit-events" count={events.length > 0 ? events.length : undefined}>
          {events.length > 0 ? (
            <ul className={edit.list} aria-label="Eventos ligados">
              {events.map((item) => (
                <li key={item.eventId} className={edit.item}>
                  <div className={edit.itemBody}>
                    <span className={edit.itemName}>{item.name}</span>
                    <span className={edit.itemMeta}>
                      <EventKindMark kind={item.kind} />
                      {now && item.startedAt ? <span>{whenLabel(item.startedAt, now)}</span> : null}
                    </span>
                  </div>
                  {item.relation ? <span className={edit.itemTrail}>{item.relation}</span> : null}
                  <RemoveButton
                    label={`Desligar do evento “${item.name}”`}
                    onClick={() => setEvents((current) => current.filter((other) => other.eventId !== item.eventId))}
                  />
                </li>
              ))}
            </ul>
          ) : null}
          <div className={edit.addRow}>
            <AddButton label="Adicionar evento" onClick={() => setPicking(true)} />
            {events.length === 0 ? <p className={edit.empty}>nenhum evento</p> : null}
          </div>
        </DetailSection>

        {error ? <DetailMessage alert>{error}</DetailMessage> : null}
        <EditFooter saving={saving} onDiscard={onLeave} />
      </form>

      {picking ? (
        <EntityPickerDialog<EventCardDto>
          title="Eventos"
          searchLabel="Buscar evento para ligar"
          search={searchHumanEvents}
          keyOf={(card) => card.id}
          nameOf={(card) => card.name}
          renderItem={(card) => <EventChoiceView card={card} now={now} />}
          exclude={(card) => eventIds.includes(card.id)}
          onPick={link}
          onClose={() => setPicking(false)}
          failedMessage="Não foi possível buscar eventos. Tente de novo."
        />
      ) : null}
    </DetailFrame>
  );
}
