import type { TaskArtifactRelationKind } from "../../sets";
import { TaskValidationError } from "../errors/task.errors";

/** Teto de `position` (smallint) na relacao entre tarefa e artefato. */
export const MAX_ARTIFACT_LINKS = 32767;

/**
 * A relacao de uma tarefa com um artefato. A ordem do array e a posicao do
 * artefato na tarefa; `fromRecurrence` marca a relacao que veio da serie, para
 * que editar a serie e editar uma ocorrencia nao mexam uma na outra.
 */
export interface ArtifactLink {
  artifactId: string;
  relation: TaskArtifactRelationKind;
  fromRecurrence: boolean;
}

/** Uma tarefa tem uma relacao so com cada artefato. */
export function normalizeArtifactLinks(links: readonly ArtifactLink[]): ArtifactLink[] {
  if (links.length > MAX_ARTIFACT_LINKS) {
    throw new TaskValidationError(`A task accepts at most ${MAX_ARTIFACT_LINKS} artifacts`);
  }
  const seen = new Set<string>();
  for (const link of links) {
    if (seen.has(link.artifactId)) {
      throw new TaskValidationError(`Duplicate artifact link: ${link.artifactId}`);
    }
    seen.add(link.artifactId);
  }
  return links.map((link) => ({
    artifactId: link.artifactId,
    relation: link.relation,
    fromRecurrence: link.fromRecurrence,
  }));
}
