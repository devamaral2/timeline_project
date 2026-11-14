import type { Artifact } from "../entities/artifact.entity";

/**
 * Os artefatos que viajam com um evento na mesma transacao: os novos e os
 * editados. A `expectedRevision` e a revisao lida quando a edicao foi montada.
 * `derivations` registra de qual original cada copia nova saiu.
 */
export interface ArtifactWrites {
  created?: readonly Artifact[];
  updated?: readonly { artifact: Artifact; expectedRevision: number }[];
  derivations?: readonly { originalId: string; copyId: string }[];
}
