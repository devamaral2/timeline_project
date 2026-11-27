"use client";

import { CalendarDays, FileText } from "lucide-react";
import type { RequestEntityDto } from "@repo/contracts";
import { DetailSection, LinkList, LinkRow, detailIcon } from "@/components/detail/detail-parts";
import { noteTypeIcon } from "@/components/notes/NoteSheet";
import { artifactVisualType } from "@/lib/artifacts/artifact-model";
import { entityHref, entityKindLabel, entityOperationLabel } from "@/lib/tasks/agent-request-model";

interface AgentProducedSectionProps {
  userId: string;
  entities: RequestEntityDto[];
}

/**
 * A seção "Produziu" do pedido: as tarefas e os artefatos que ele criou, alterou ou apagou. Tocar num que
 * ainda existe abre o detalhe dele; o apagado aparece só como leitura. Sem entidades, a seção não aparece.
 */
export function AgentProducedSection({ userId, entities }: AgentProducedSectionProps) {
  if (entities.length === 0) return null;

  return (
    <DetailSection title="Produziu" count={entities.length} labelId="agent-produced">
      <LinkList>
        {entities.map((entity) => (
          <LinkRow
            key={`${entity.kind}-${entity.id}`}
            kind={entity.kind === "task" ? "task" : "note"}
            icon={entity.kind === "task" ? <CalendarDays {...detailIcon} /> : <ArtifactIcon entity={entity} />}
            title={entity.name}
            sub={`${entityOperationLabel(entity.operation)} · ${entityKindLabel(entity)}`}
            href={entity.operation === "delete" ? undefined : entityHref(userId, entity)}
          />
        ))}
      </LinkList>
    </DetailSection>
  );
}

/** O ícone do artefato produzido: o do tipo, quando o contrato o diz; sem tipo, a folha de texto. */
function ArtifactIcon({ entity }: { entity: RequestEntityDto }) {
  const Icon = entity.artifactType ? noteTypeIcon(artifactVisualType(entity.artifactType)) : FileText;
  return <Icon {...detailIcon} />;
}
