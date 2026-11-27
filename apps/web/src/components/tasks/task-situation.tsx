import type { TaskSituation } from "@repo/contracts";
import styles from "./task-glyphs.module.css";

/** As três situações do pedido de agente que terminou, na ordem em que o menu as mostra. */
export const TASK_SITUATIONS: readonly TaskSituation[] = ["to_review", "reviewed", "bookmarked"];

export const situationNames: Record<TaskSituation, string> = {
  to_review: "Para revisar",
  reviewed: "Revisada",
  bookmarked: "Guardada",
};

/**
 * O glifo da situação, no desenho do canvas: Para revisar é o círculo vazio de "A fazer" (cor apagada), Revisada é um
 * círculo com dois vistos (sucesso) e Guardada, um marcador (informação). Sem moldura: a cor sai do `data-situation`.
 */
export function TaskSituationGlyph({ situation, size = 22, className }: { situation: TaskSituation; size?: number; className?: string }) {
  return (
    <svg
      role="img"
      aria-label={situationNames[situation]}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      data-situation={situation}
      className={className ?? styles.situationGlyph}
    >
      {situation === "bookmarked" ? (
        <path d="m18 20.5-6-3.8-6 3.8V5.5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2Z" />
      ) : (
        <circle cx="12" cy="12" r="9" />
      )}
      {situation === "reviewed" ? <path d="m6.6 12.4 2.2 2.2 4.4-4.7M12.3 14.6l4.5-4.8" /> : null}
    </svg>
  );
}

/** O ponto inerte da tarefa de agente que ainda não tem situação (esperando você) e da execução agendada. */
export function TaskInertDot({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" data-inert-dot className={styles.inertDot}>
      <path d="M12 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z" fill="currentColor" />
    </svg>
  );
}
