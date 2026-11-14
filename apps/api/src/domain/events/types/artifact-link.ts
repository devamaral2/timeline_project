import type { EventArtifactRelationKind } from "../../sets";
import { EventValidationError } from "../errors/event.errors";

/** Teto de `position` (smallint) na relacao entre evento e artefato. */
export const MAX_ARTIFACT_LINKS = 32767;

/**
 * A relacao de um evento com um artefato. A ordem do array e a posicao do
 * artefato no evento; `fromRecurrence` marca a relacao que veio da serie, para
 * que editar a serie e editar uma ocorrencia nao mexam uma na outra.
 */
export interface ArtifactLink {
  artifactId: string;
  relation: EventArtifactRelationKind;
  fromRecurrence: boolean;
}

/** Um evento tem uma relacao so com cada artefato. */
export function normalizeArtifactLinks(links: readonly ArtifactLink[]): ArtifactLink[] {
  if (links.length > MAX_ARTIFACT_LINKS) {
    throw new EventValidationError(`An event accepts at most ${MAX_ARTIFACT_LINKS} artifacts`);
  }
  const seen = new Set<string>();
  for (const link of links) {
    if (seen.has(link.artifactId)) {
      throw new EventValidationError(`Duplicate artifact link: ${link.artifactId}`);
    }
    seen.add(link.artifactId);
  }
  return links.map((link) => ({
    artifactId: link.artifactId,
    relation: link.relation,
    fromRecurrence: link.fromRecurrence,
  }));
}
