"use client";

import { ChevronDown, ChevronUp, X } from "lucide-react";
import type { ArtifactDto } from "@repo/contracts";
import { DetailSection, detailIcon } from "@/components/detail/detail-parts";
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
} from "./event-artifact-draft";
import type { EventDraft, EventDraftField } from "./event-draft";
import { SearchPicker } from "./SearchPicker";
import styles from "./event-edit-artifacts.module.css";

interface EventEditArtifactsSectionProps {
  draft: EventDraft;
  onChange: <K extends EventDraftField>(field: K, value: EventDraft[K]) => void;
}

/**
 * "Artefatos" na edição: a lista do evento, na ordem da tela. Cada linha tem a posição, o nome, o tipo, de quem é
 * e a relação, e os botões Subir, Descer e Remover (por teclado e por toque; não há arrastar). A busca depende do
 * tipo do evento: numa refeição oferece os alimentos (do catálogo global e os seus), que entram como cópia com
 * quantidade; num treino oferece os exercícios do catálogo global, por referência; nos outros tipos, os seus
 * artefatos, com a relação `uses`. Nada vai à API aqui: a lista segue no rascunho até o Salvar.
 */
export function EventEditArtifactsSection({ draft, onChange }: EventEditArtifactsSectionProps) {
  const list = draft.artifacts;
  const positions = draftArtifactPositions(list);

  return (
    <DetailSection title="Artefatos" labelId="event-edit-artifacts" count={list.length}>
      {list.length === 0 ? <p className={styles.empty}>nenhum artefato</p> : null}
      {list.length > 0 ? (
        <ul className={styles.list} aria-label="Artefatos ligados">
          {list.map((item, index) => (
            <li key={item.id} className={styles.row}>
              <span className={styles.position}>{positions[index] ?? "—"}</span>
              <div className={styles.body}>
                <span className={styles.name}>{item.name}</span>
                <ArtifactMeta item={item} hasPosition={positions[index] !== null} />
                {item.copyOf !== undefined ? (
                  <input
                    type="text"
                    className={styles.quantity}
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
              <button
                type="button"
                className={styles.remove}
                aria-label={`Remover artefato “${item.name}”`}
                onClick={() => onChange("artifacts", removeDraftArtifact(list, item.id))}
              >
                <X {...detailIcon} />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <LinkPicker kind={draft.kind} list={list} onChange={onChange} />
    </DetailSection>
  );
}

interface LinkPickerProps {
  kind: EventDraft["kind"];
  list: DraftArtifact[];
  onChange: EventEditArtifactsSectionProps["onChange"];
}

/** A busca da lista, conforme o tipo do evento. Cada uma tem a sua fonte e o seu jeito de entrar na lista. */
function LinkPicker({ kind, list, onChange }: LinkPickerProps) {
  if (kind === "meal") {
    return (
      <SearchPicker<ArtifactDto>
        label="Buscar alimento para a refeição"
        search={searchFoods}
        keyOf={(food) => food.id}
        nameOf={(food) => food.name}
        renderItem={(food) => <ChoiceView artifact={food} />}
        onPick={(food) => onChange("artifacts", addFoodCopy(list, food, crypto.randomUUID()))}
        failedMessage="Não foi possível buscar alimentos. Tente de novo."
      />
    );
  }
  if (kind === "training") {
    return (
      <SearchPicker<ArtifactDto>
        label="Buscar exercício para o treino"
        search={searchExercises}
        keyOf={(exercise) => exercise.id}
        nameOf={(exercise) => exercise.name}
        renderItem={(exercise) => <ChoiceView artifact={exercise} />}
        exclude={(exercise) => list.some((item) => item.id === exercise.id)}
        onPick={(exercise) => onChange("artifacts", addDraftArtifact(list, exercise))}
        failedMessage="Não foi possível buscar exercícios. Tente de novo."
      />
    );
  }
  return (
    <SearchPicker<ArtifactDto>
      label="Buscar artefato para ligar"
      search={searchOwnArtifacts}
      keyOf={(artifact) => artifact.id}
      nameOf={(artifact) => artifact.name}
      exclude={(artifact) => list.some((item) => item.id === artifact.id)}
      renderItem={(artifact) => <ChoiceView artifact={artifact} />}
      onPick={(artifact) => onChange("artifacts", addDraftArtifact(list, artifact))}
      failedMessage="Não foi possível buscar artefatos. Tente de novo."
    />
  );
}

/** A busca dos artefatos do usuário pelo texto. */
function searchOwnArtifacts(query: string): Promise<ArtifactDto[]> {
  return listArtifacts({ q: query });
}

/** A busca de alimentos da refeição: os do catálogo global e os do usuário, nessa ordem. */
function searchFoods(query: string): Promise<ArtifactDto[]> {
  return Promise.all([listArtifacts({ type: "food", scope: "global", q: query }), listArtifacts({ type: "food", q: query })]).then(
    ([global, own]) => [...global, ...own],
  );
}

/** A busca de exercícios do treino: só o catálogo global, por referência. */
function searchExercises(query: string): Promise<ArtifactDto[]> {
  return listArtifacts({ type: "workout", scope: "global", q: query });
}

/** O conteúdo de uma escolha da busca: nome, tipo, de quem é e, no alimento, as calorias do cálculo. */
function ChoiceView({ artifact }: { artifact: ArtifactDto }) {
  return (
    <>
      <span className={styles.name}>{artifact.name}</span>
      <span className={styles.meta}>
        <span className={styles.type}>{artifact.type}</span>
        <span>{artifact.global ? "catálogo global" : "seu artefato"}</span>
        {artifact.type === "food" ? <span>{`${Math.round(artifact.data.totals.totalCaloriesKcal)} kcal`}</span> : null}
      </span>
    </>
  );
}

function ArtifactMeta({ item, hasPosition }: { item: DraftArtifact; hasPosition: boolean }) {
  return (
    <span className={styles.meta}>
      <span className={styles.type}>{item.type}</span>
      <span>{item.global ? "catálogo global" : "seu artefato"}</span>
      <span>{item.relation}</span>
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
  onChange: EventEditArtifactsSectionProps["onChange"];
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
      <Icon {...detailIcon} />
    </button>
  );
}
