"use client";

import { Apple, Bot, Dumbbell, FileCode, FileText, type LucideIcon, Moon, Route } from "lucide-react";
import Link from "next/link";
import type { ArtifactType, TaskArtifactDto, TaskDto } from "@repo/contracts";
import { DetailSection } from "@/components/detail/detail-parts";
import { ICON_STROKE_WIDTH } from "@/components/tasks/task-visuals";
import { mealCaloriesKcal } from "@/lib/tasks/task-read-model";
import styles from "./task-artifacts.module.css";

interface TaskArtifactsSectionProps {
  userId: string;
  task: TaskDto;
}

const TYPE_ICONS: Record<ArtifactType, LucideIcon> = {
  text: FileText,
  food: Apple,
  sleep: Moon,
  training: Dumbbell,
  workout: Dumbbell,
  skill: FileCode,
  agent: Bot,
  router: Route,
};

/**
 * A seção Artefatos do detalhe: os artefatos da tarefa, na ordem em que vieram
 * (`task.artifacts`, sem outra chamada). Cada linha mostra a posição, o nome, o
 * código do tipo, de quem é (“seu artefato” ou “catálogo global”) e a relação. O
 * que a tarefa criou (`creates`) não está na lista: sem posição, com “—”. Tocar
 * numa linha abre o detalhe do artefato. Tarefa sem artefato não mostra a seção.
 * Na refeição, o total de calorias são os alimentos ligados somados (cópias incluídas).
 */
export function TaskArtifactsSection({ userId, task }: TaskArtifactsSectionProps) {
  if (task.artifacts.length === 0) return null;
  const positions = artifactPositions(task.artifacts);

  return (
    <DetailSection title="Artefatos" labelId="task-artifacts" count={task.artifacts.length}>
      <ul className={styles.list}>
        {task.artifacts.map((link, index) => (
          <ArtifactRow key={link.artifact.id} link={link} position={positions[index] ?? null} userId={userId} />
        ))}
      </ul>
      {task.kind === "meal" ? (
        <p className={styles.total}>
          <span>Total de calorias</span>
          <strong>{`${Math.round(mealCaloriesKcal(task.artifacts))} kcal`}</strong>
        </p>
      ) : null}
    </DetailSection>
  );
}

/** 1, 2, … para os artefatos da lista; `null` para o que a tarefa criou. */
function artifactPositions(artifacts: readonly TaskArtifactDto[]): (number | null)[] {
  let next = 0;
  return artifacts.map((link) => (link.relation === "creates" ? null : ++next));
}

function ArtifactRow({ link, position, userId }: { link: TaskArtifactDto; position: number | null; userId: string }) {
  const { artifact } = link;
  const Icon = TYPE_ICONS[artifact.type];
  return (
    <li className={styles.row}>
      <span className={styles.position}>{position ?? "—"}</span>
      <Link href={`/${userId}/notas/${artifact.id}`} className={styles.body}>
        <span className={styles.name}>{artifact.name}</span>
        <span className={styles.meta}>
          <span className={styles.type}>
            <Icon size={14} strokeWidth={ICON_STROKE_WIDTH} aria-hidden />
            {artifact.type}
          </span>
          <span>{artifact.global ? "catálogo global" : "seu artefato"}</span>
          {position === null ? <span>sem posição na lista</span> : null}
        </span>
      </Link>
      <span className={styles.relation}>{link.relation}</span>
    </li>
  );
}
