import type { TaskPriority } from "@repo/contracts";
import styles from "./task-glyphs.module.css";

export const taskPriorityLabels: Record<TaskPriority, string> = {
  urgent: "Urgente",
  high: "Alta",
  medium: "Média",
  low: "Baixa",
};

/** Quantas das quatro barras acendem: urgente acende todas, baixa so a primeira. */
const litBars: Record<TaskPriority, number> = { urgent: 4, high: 3, medium: 2, low: 1 };

/** Alturas das barras, do desenho do quadro Tipos (viewBox 20 x 16). */
const bars = [
  { x: 3, top: 10 },
  { x: 8, top: 7.5 },
  { x: 13, top: 5 },
  { x: 18, top: 2.5 },
] as const;

/**
 * O indicador de prioridade: quatro barras, e quantas acendem dizem o nível.
 * O que fica apagado segue no lugar (opacidade baixa), para as quatro barras
 * terem sempre a mesma posição. A cor sai do `data-priority` no CSS.
 */
export function TaskPriorityMark({ priority, className }: { priority: TaskPriority; className?: string }) {
  const lit = litBars[priority];
  const label = `Prioridade: ${taskPriorityLabels[priority]}`;

  return (
    <svg
      role="img"
      aria-label={label}
      viewBox="0 0 20 16"
      width={18}
      height={14}
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      data-priority={priority}
      className={className ?? styles.priorityMark}
    >
      {bars.map((bar, index) => (
        <path
          key={bar.x}
          data-bar={index + 1}
          data-lit={index < lit ? "true" : "false"}
          d={`M${bar.x} 13V${bar.top}`}
          opacity={index < lit ? 1 : 0.25}
        />
      ))}
    </svg>
  );
}
