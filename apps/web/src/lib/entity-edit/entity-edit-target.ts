import type { ArtifactType, RequestEditEntityType } from "@repo/contracts";

/**
 * O que a barra de edição com IA diz que vai editar: "Peça uma mudança nesta nota" (o "n" vem do campo).
 * As chaves são o conjunto que `POST /api/requests/edit` aceita.
 */
export const EDIT_TARGET_LABELS: Record<RequestEditEntityType, string> = {
  task: "esta tarefa",
  artifact: "esta nota",
  food_artifact: "esta refeição",
  sleep_artifact: "esta nota de sono",
  training_artifact: "este treino",
  skill_artifact: "esta skill",
  agent_artifact: "este agente",
};

/**
 * O tipo que a barra envia para um artefato aberto. `null` quando a barra não se mostra: artefato global (catálogo,
 * sem edição pelo app), roteador (o JEV o gerencia) e exercício (só existe no catálogo global).
 */
export function editEntityTypeOfArtifact(artifact: { type: ArtifactType; global: boolean }): RequestEditEntityType | null {
  if (artifact.global) return null;
  switch (artifact.type) {
    case "text": return "artifact";
    case "food": return "food_artifact";
    case "sleep": return "sleep_artifact";
    case "training": return "training_artifact";
    case "skill": return "skill_artifact";
    case "agent": return "agent_artifact";
    case "router":
    case "workout":
      return null;
  }
}
