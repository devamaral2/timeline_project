import type { ArtifactEventLinkDto, ArtifactType } from "@repo/contracts";
import { dateLineOf, minutesBetween } from "@/lib/events/event-detail-format";

/**
 * O que a lista de Notas decide a partir dos artefatos: o rótulo de cada tipo,
 * a ordem dos tipos, o tipo visual (ícone e cor) e as opções de filtro. Fica
 * fora do componente para que o Android copie a regra, linha a linha.
 */

export const ARTIFACT_TYPE_ORDER: readonly ArtifactType[] = [
  "text",
  "food",
  "sleep",
  "training",
  "workout",
  "skill",
  "agent",
  "router",
];

const TYPE_LABELS: Record<ArtifactType, string> = {
  text: "Nota",
  food: "Refeição",
  sleep: "Sono",
  training: "Treino",
  workout: "Exercício",
  skill: "Skill",
  agent: "Agente",
  router: "Roteador",
};

export function artifactTypeLabel(type: ArtifactType): string {
  return TYPE_LABELS[type];
}

/** O tipo que escolhe o ícone e a cor da folha: refeição usa a cor do alimento, exercício a do treino. */
export function artifactVisualType(type: ArtifactType): string {
  if (type === "food") return "meal";
  if (type === "workout") return "training";
  return type;
}

/** Os tipos que aparecem nos artefatos, na ordem de ARTIFACT_TYPE_ORDER. */
export function artifactTypesIn(artifacts: readonly { type: ArtifactType }[]): ArtifactType[] {
  return ARTIFACT_TYPE_ORDER.filter((type) => artifacts.some((artifact) => artifact.type === type));
}

/** As tags de todos os artefatos, das mais usadas para as menos usadas. */
export function artifactTagsByUse(artifacts: readonly { tags: readonly string[] }[]): string[] {
  const uses = new Map<string, number>();
  for (const tag of artifacts.flatMap((artifact) => artifact.tags)) uses.set(tag, (uses.get(tag) ?? 0) + 1);
  return [...uses.keys()].sort((a, b) => (uses.get(b) ?? 0) - (uses.get(a) ?? 0) || a.localeCompare(b, "pt-BR"));
}

/**
 * Uma nota de sono vive na noite do evento a que pertence: o título é o dia (ou os dois dias) dele e, com fim
 * planejado, quanto durou na agenda. Sem evento com início, a nota é só a nota.
 */
export function sleepAgendaOfArtifact(events: readonly ArtifactEventLinkDto[]): { title: string; agendaMinutes: number | null } | null {
  const event = events.find((link) => link.startedAt);
  if (!event?.startedAt) return null;
  return {
    title: dateLineOf(event.startedAt, event.estimatedFinishAt),
    agendaMinutes: event.estimatedFinishAt ? minutesBetween(event.startedAt, event.estimatedFinishAt) : null,
  };
}

/** "3 notas": a legenda no topo da lista. */
export function artifactCountLabel(count: number): string {
  if (count === 0) return "Nenhuma nota";
  return count === 1 ? "1 nota" : `${count} notas`;
}
