import type { AiProcessEditEntityType, NoteDto } from "@/lib/api/contracts";

/** O tipo de edicao por IA de uma nota; notas do roteador (`router`) seguem o JEV e nao se editam. */
export function editEntityTypeOfNote(note: Pick<NoteDto, "type">): AiProcessEditEntityType | null {
  switch (note.type) {
    case "text": return "note";
    case "meal": return "meal_note";
    case "sleep": return "sleep_note";
    case "training": return "training_note";
    case "skill": return "skill_note";
    case "agent": return "agent_note";
    default: return null;
  }
}

/** O que o campo diz que vai editar: "Peça ao Hermes para editar este evento". */
export const EDIT_TARGET_LABELS: Record<AiProcessEditEntityType, string> = {
  event: "este evento",
  task: "esta tarefa",
  note: "esta nota",
  meal_note: "esta refeição",
  sleep_note: "esta nota de sono",
  training_note: "este treino",
  skill_note: "esta skill",
  agent_note: "este agente",
};
