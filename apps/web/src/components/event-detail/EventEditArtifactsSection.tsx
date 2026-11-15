"use client";

import { ChevronDown, ChevronUp, X } from "lucide-react";
import type { ArtifactDto } from "@repo/contracts";
import { DetailSection, detailIcon } from "@/components/detail/detail-parts";
import { listArtifacts } from "@/lib/api/artifacts";
import {
  type DraftArtifact,
  addDraftArtifact,
  draftArtifactPositions,
  moveDraftArtifact,
  removeDraftArtifact,
  sameArtifactLinks,
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
 * e a relação, e os botões Subir, Descer e Remover (por teclado e por toque; não há arrastar). Buscar um artefato
 * seu acrescenta-o ao fim com a relação `uses`. Nada vai à API aqui: a lista segue no rascunho até o Salvar.
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
      <SearchPicker<ArtifactDto>
        label="Buscar artefato para ligar"
        search={searchOwnArtifacts}
        keyOf={(artifact) => artifact.id}
        nameOf={(artifact) => artifact.name}
        exclude={(artifact) => list.some((item) => item.id === artifact.id)}
        renderItem={(artifact) => (
          <>
            <span className={styles.name}>{artifact.name}</span>
            <span className={styles.meta}>
              <span className={styles.type}>{artifact.type}</span>
              <span>{artifact.global ? "catálogo global" : "seu artefato"}</span>
            </span>
          </>
        )}
        onPick={(artifact) => onChange("artifacts", addDraftArtifact(list, artifact))}
        failedMessage="Não foi possível buscar artefatos. Tente de novo."
      />
    </DetailSection>
  );
}

/** A busca dos artefatos do usuário pelo texto. O catálogo global entra no ticket de alimento e exercício. */
function searchOwnArtifacts(query: string): Promise<ArtifactDto[]> {
  return listArtifacts({ q: query });
}

function ArtifactMeta({ item, hasPosition }: { item: DraftArtifact; hasPosition: boolean }) {
  return (
    <span className={styles.meta}>
      <span className={styles.type}>{item.type}</span>
      <span>{item.global ? "catálogo global" : "seu artefato"}</span>
      <span>{item.relation}</span>
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
