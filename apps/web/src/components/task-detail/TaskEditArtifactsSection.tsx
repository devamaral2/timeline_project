"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";
import type { ArtifactDto } from "@repo/contracts";
import { DetailSection } from "@/components/detail/detail-parts";
import { AddButton, RemoveButton, editStyles as edit } from "@/components/edit/edit-parts";
import { EntityPickerDialog } from "@/components/edit/EntityPickerDialog";
import { listArtifacts } from "@/lib/api/artifacts";
import {
  type DraftArtifact,
  addDraftArtifact,
  addFoodCopy,
  draftArtifactPositions,
  moveDraftArtifact,
  removeDraftArtifact,
  sameArtifactLinks,
  setCopyQuantity,
} from "./task-artifact-draft";
import type { TaskDraft, TaskDraftField } from "./task-draft";
import styles from "./task-edit-artifacts.module.css";

interface TaskEditArtifactsSectionProps {
  draft: TaskDraft;
  onChange: <K extends TaskDraftField>(field: K, value: TaskDraft[K]) => void;
}

/**
 * "Artefatos" na edição: a lista do evento, na ordem da tela. Cada linha tem a posição, o nome, o tipo, de quem é
 * e a relação, e os botões Subir, Descer e Remover (por teclado e por toque; não há arrastar). O "+" abre o modal
 * de seleção, e o que ele oferece depende do tipo do evento: numa refeição, os alimentos (do catálogo global e os
 * seus), que entram como cópia com quantidade; num treino, os exercícios do catálogo global, por referência; nos
 * outros tipos, os seus artefatos, com a relação `uses`. Nada vai à API aqui: a lista segue no rascunho até o Salvar.
 */
export function TaskEditArtifactsSection({ draft, onChange }: TaskEditArtifactsSectionProps) {
  const list = draft.artifacts;
  const positions = draftArtifactPositions(list);

  return (
    <DetailSection title="Artefatos" labelId="task-edit-artifacts" count={list.length}>
      {list.length > 0 ? (
        <ul className={edit.list} aria-label="Artefatos ligados">
          {list.map((item, index) => (
            <li key={item.id} className={edit.item}>
              <span className={edit.itemLead}>{positions[index] ?? "—"}</span>
              <div className={edit.itemBody}>
                <span className={edit.itemName}>{item.name}</span>
                <ArtifactMeta item={item} hasPosition={positions[index] !== null} />
                {item.copyOf !== undefined ? (
                  <input
                    type="text"
                    className={`${edit.control} ${styles.quantity}`}
                    aria-label={`Quantidade de “${item.name}”`}
                    placeholder="Quantidade"
                    autoComplete="off"
                    value={item.quantity ?? ""}
                    onChange={(change) => onChange("artifacts", setCopyQuantity(list, item.id, change.target.value))}
                  />
                ) : null}
              </div>
              {item.relation === "creates" ? null : (
                <span className={styles.steps}>
                  <StepButton item={item} list={list} step={-1} label={`Subir “${item.name}”`} onChange={onChange} />
                  <StepButton item={item} list={list} step={1} label={`Descer “${item.name}”`} onChange={onChange} />
                </span>
              )}
              <RemoveButton label={`Remover artefato “${item.name}”`} onClick={() => onChange("artifacts", removeDraftArtifact(list, item.id))} />
            </li>
          ))}
        </ul>
      ) : null}
      <LinkPicker kind={draft.kind} list={list} onChange={onChange} />
    </DetailSection>
  );
}

/** Quantos artefatos o modal de seleção pede de cada vez. */
const CHOICE_LIMIT = 50;

interface LinkPickerProps {
  kind: TaskDraft["kind"];
  list: DraftArtifact[];
  onChange: TaskEditArtifactsSectionProps["onChange"];
}

/** O que o "+" oferece, conforme o tipo do evento. Cada fonte tem o seu jeito de entrar na lista. */
const SOURCES = {
  meal: {
    title: "Alimentos",
    addLabel: "Adicionar alimento à refeição",
    searchLabel: "Buscar alimento para a refeição",
    search: searchFoods,
    failedMessage: "Não foi possível buscar alimentos. Tente de novo.",
  },
  training: {
    title: "Exercícios",
    addLabel: "Adicionar exercício ao treino",
    searchLabel: "Buscar exercício para o treino",
    search: searchExercises,
    failedMessage: "Não foi possível buscar exercícios. Tente de novo.",
  },
  other: {
    title: "Artefatos",
    addLabel: "Adicionar artefato",
    searchLabel: "Buscar artefato para ligar",
    search: searchOwnArtifacts,
    failedMessage: "Não foi possível buscar artefatos. Tente de novo.",
  },
} as const;

/** O "+" da lista e o modal de seleção que ele abre. */
function LinkPicker({ kind, list, onChange }: LinkPickerProps) {
  const [picking, setPicking] = useState(false);
  const source = kind === "meal" ? SOURCES.meal : kind === "training" ? SOURCES.training : SOURCES.other;

  function pick(artifact: ArtifactDto) {
    // O alimento entra como cópia nova (pode repetir, cada uma com a sua quantidade); o resto, por referência.
    onChange("artifacts", kind === "meal" ? addFoodCopy(list, artifact, crypto.randomUUID()) : addDraftArtifact(list, artifact));
  }

  return (
    <>
      <div className={edit.addRow}>
        <AddButton label={source.addLabel} onClick={() => setPicking(true)} />
        {list.length === 0 ? <p className={edit.empty}>nenhum artefato</p> : null}
      </div>
      {picking ? (
        <EntityPickerDialog<ArtifactDto>
          title={source.title}
          searchLabel={source.searchLabel}
          search={source.search}
          keyOf={(artifact) => artifact.id}
          nameOf={(artifact) => artifact.name}
          renderItem={(artifact) => <ChoiceView artifact={artifact} />}
          exclude={kind === "meal" ? undefined : (artifact) => list.some((item) => item.id === artifact.id)}
          onPick={pick}
          onClose={() => setPicking(false)}
          failedMessage={source.failedMessage}
        />
      ) : null}
    </>
  );
}

/** O texto da busca como filtro; vazio (o modal acabou de abrir), sem filtro: vêm os primeiros itens. */
function textFilter(query: string): { q?: string; limit: number } {
  return query ? { q: query, limit: CHOICE_LIMIT } : { limit: CHOICE_LIMIT };
}

/** A busca dos artefatos do usuário pelo texto. */
function searchOwnArtifacts(query: string): Promise<ArtifactDto[]> {
  return listArtifacts(textFilter(query));
}

/** A busca de alimentos da refeição: os do catálogo global e os do usuário, nessa ordem. */
function searchFoods(query: string): Promise<ArtifactDto[]> {
  return Promise.all([listArtifacts({ type: "food", scope: "global", ...textFilter(query) }), listArtifacts({ type: "food", ...textFilter(query) })]).then(
    ([global, own]) => [...global, ...own],
  );
}

/** A busca de exercícios do treino: só o catálogo global, por referência. */
function searchExercises(query: string): Promise<ArtifactDto[]> {
  return listArtifacts({ type: "workout", scope: "global", ...textFilter(query) });
}

/** O conteúdo de uma escolha da busca: nome, tipo, de quem é e, no alimento, as calorias do cálculo. */
function ChoiceView({ artifact }: { artifact: ArtifactDto }) {
  return (
    <>
      <span className={edit.itemName}>{artifact.name}</span>
      <span className={edit.itemMeta}>
        <span className={edit.itemCode}>{artifact.type}</span>
        <span>{artifact.global ? "catálogo global" : "seu artefato"}</span>
        {artifact.type === "food" ? <span>{`${Math.round(artifact.data.totals.totalCaloriesKcal)} kcal`}</span> : null}
      </span>
    </>
  );
}

function ArtifactMeta({ item, hasPosition }: { item: DraftArtifact; hasPosition: boolean }) {
  return (
    <span className={edit.itemMeta}>
      <span className={edit.itemCode}>{item.type}</span>
      <span>{item.global ? "catálogo global" : "seu artefato"}</span>
      <span className={edit.itemCode}>{item.relation}</span>
      {item.copyOf === undefined && item.quantity ? <span>{item.quantity}</span> : null}
      {hasPosition ? null : <span>sem posição na lista</span>}
    </span>
  );
}

interface StepButtonProps {
  item: DraftArtifact;
  list: DraftArtifact[];
  step: -1 | 1;
  label: string;
  onChange: TaskEditArtifactsSectionProps["onChange"];
}

/** Subir ou descer. No começo ou no fim da lista o botão fica desligado: não há para onde ir. */
function StepButton({ item, list, step, label, onChange }: StepButtonProps) {
  const moved = moveDraftArtifact(list, item.id, step);
  const Icon = step === -1 ? ChevronUp : ChevronDown;
  return (
    <button
      type="button"
      className={styles.step}
      aria-label={label}
      disabled={sameArtifactLinks(moved, list)}
      onClick={() => onChange("artifacts", moved)}
    >
      <Icon className={styles.stepIcon} aria-hidden />
    </button>
  );
}
