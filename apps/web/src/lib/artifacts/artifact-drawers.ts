import type { AgentTaskStatus, ArtifactDto, ArtifactType } from "@repo/contracts";
import { whenLabel } from "@/lib/notes/notes-model";
import { formatDecimal, formatMinutes } from "@/lib/tasks/task-detail-format";
import { ARTIFACT_TYPE_ORDER } from "./artifact-model";

/**
 * As gavetas da lista de Artefatos, uma por tipo, e o que a linha de cada tipo mostra. Funções puras, sem rede:
 * quem chama passa o `now`. Ficam fora do componente para que o Android copie a regra, linha a linha.
 */

/** `other` junta o artefato de um tipo que este app não conhece: ele não some da lista. */
export type ArtifactDrawerKey = ArtifactType | "other";

export interface ArtifactDrawer {
  key: ArtifactDrawerKey;
  title: string;
  /** Na ordem recebida: a da API, do mais recente para o mais antigo. */
  artifacts: ArtifactDto[];
}

const DRAWER_TITLES: Record<ArtifactDrawerKey, string> = {
  text: "Notas",
  news: "Notícias",
  email_summary: "Resumos de e-mail",
  youtube_transcript: "Transcrições",
  food: "Refeições",
  sleep: "Sono",
  training: "Treinos",
  workout: "Exercícios",
  skill: "Skills",
  agent: "Agentes",
  router: "Roteadores",
  other: "Outros",
};

function drawerKeyOf(type: ArtifactType): ArtifactDrawerKey {
  return ARTIFACT_TYPE_ORDER.includes(type) ? type : "other";
}

/** As gavetas com algum artefato, na ordem de ARTIFACT_TYPE_ORDER e, por último, a dos tipos desconhecidos. */
export function artifactDrawersOf(artifacts: readonly ArtifactDto[]): ArtifactDrawer[] {
  const keys: ArtifactDrawerKey[] = [...ARTIFACT_TYPE_ORDER, "other"];
  return keys
    .map((key) => ({ key, title: DRAWER_TITLES[key], artifacts: artifacts.filter((artifact) => drawerKeyOf(artifact.type) === key) }))
    .filter((drawer) => drawer.artifacts.length > 0);
}

/**
 * Se a gaveta começa aberta. Na lista inteira só Notas abre, para a primeira tela mostrar todos os tipos. Com filtro
 * (tipo, tag ou texto) o que foi pedido aparece sem outro toque, e a gaveta sozinha também abre.
 */
export function artifactDrawerStartsOpen(key: ArtifactDrawerKey, drawerCount: number, narrowed: boolean): boolean {
  return narrowed || drawerCount === 1 || key === "text";
}

/** Um trecho da linha de apoio. `mono` é número ou código, `fill` ocupa o que sobra e corta, `alert` é um aviso. */
export interface ArtifactRowPart {
  text: string;
  style?: "mono" | "fill" | "alert";
}

export interface ArtifactRowFacts {
  support: ArtifactRowPart[];
  tags: string[];
  /** O número do tipo na ponta direita: calorias da refeição, duração do treino. */
  figure: string | null;
  /** No lugar do número, enquanto o agente calcula a refeição ou quando o cálculo falhou. */
  agentStatus: AgentTaskStatus | null;
}

export const MISSING_AGENT_FILE_LINE = "O arquivo não está mais na pasta.";

/** "Hoje, 09:00", "Ontem, 21:12" ou "11 set., 09:00": o rótulo das telas de nota, com a inicial maiúscula. */
function updatedLabel(artifact: ArtifactDto, now: Date): string {
  const label = whenLabel(artifact.updatedAt, now);
  return label.charAt(0).toLocaleUpperCase("pt-BR") + label.slice(1);
}

/** A linha de apoio, as tags e a ponta direita de um artefato na lista. */
export function artifactRowFacts(artifact: ArtifactDto, now: Date): ArtifactRowFacts {
  const when: ArtifactRowPart = { text: updatedLabel(artifact, now) };
  const plain: ArtifactRowFacts = { support: [when], tags: artifact.tags, figure: null, agentStatus: null };
  switch (artifact.type) {
    case "food": {
      const status = artifact.data.generation?.status;
      if (status === "pending") return { ...plain, agentStatus: "running" };
      if (status === "failed") return { ...plain, agentStatus: "failed" };
      const kcal = Math.round(artifact.data.totals.totalCaloriesKcal);
      return { ...plain, figure: kcal > 0 ? `${formatDecimal(kcal)} kcal` : null };
    }
    case "sleep": {
      // O título do sono já é longo: a linha leva a duração e a pontuação no lugar da data.
      const slept: ArtifactRowPart[] = artifact.data.trackedSleepTime > 0 ? [{ text: formatMinutes(artifact.data.trackedSleepTime), style: "mono" }] : [];
      return { ...plain, support: [...slept, { text: `Pontuação ${formatDecimal(artifact.data.score)}` }] };
    }
    case "training": {
      const names = [...new Set(artifact.data.workouts.map((workout) => workout.workoutName))].join(", ");
      const minutes = artifact.data.workouts.reduce((sum, workout) => sum + workout.duration, 0);
      return {
        ...plain,
        support: names ? [when, { text: names, style: "fill" }] : [when],
        figure: minutes > 0 ? formatMinutes(minutes) : null,
      };
    }
    case "workout":
      return { ...plain, support: [{ text: artifact.data.category, style: "mono" }], tags: [] };
    case "skill":
    case "agent": {
      if (artifact.data.missing) return { ...plain, support: [{ text: MISSING_AGENT_FILE_LINE, style: "alert" }], tags: [] };
      const description = artifact.data.description?.trim();
      return { ...plain, support: [description ? { text: description, style: "fill" } : when], tags: [] };
    }
    default:
      return plain;
  }
}
