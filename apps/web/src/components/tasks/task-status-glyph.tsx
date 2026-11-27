import type { AgentTaskStatus, TaskActor, HumanTaskStatus } from "@repo/contracts";
import styles from "./task-glyphs.module.css";

type HumanStatusOrNone = HumanTaskStatus | null;

export type TaskStatusGlyphProps =
  | { actor: "human"; status: HumanStatusOrNone; size?: number; className?: string }
  | { actor: "agent"; status: AgentTaskStatus; size?: number; className?: string };

const humanNames: Record<HumanTaskStatus, string> = {
  todo: "A fazer",
  toDefine: "Sem data",
  doing: "Em curso",
  inHold: "Em espera",
  done: "Feito",
  cancel: "Cancelado",
  missed: "Não realizado",
};

/** Os dez nomes de status de agente (na lista e no detalhe); o nome acessível é "Agente, " e o nome em minúscula. */
export const agentStatusNames: Record<AgentTaskStatus, string> = {
  preparing: "Preparando",
  queued: "Na fila",
  starting: "Iniciando",
  running: "Trabalhando",
  waiting: "Esperando",
  completed: "Concluído",
  interrupted: "Interrompido",
  failed: "Falhou",
  cancelled: "Cancelado",
  rolled_back: "Revertido",
};

/** O nome que um leitor de tela anuncia para o glifo. */
export function taskStatusName(actor: TaskActor, status: HumanStatusOrNone | AgentTaskStatus): string {
  if (actor === "agent") return `Agente, ${agentStatusNames[status as AgentTaskStatus].toLowerCase()}`;
  if (status === null) return "Só agenda";
  return humanNames[status as HumanTaskStatus];
}

/**
 * O glifo do status: um circulo, e o que fica dentro diz qual. Nao tem moldura
 * nem fundo: a cor sai do `data-status` no CSS. Tarefa de pessoa sem status
 * (`null`) e o ponto azul "Só agenda". Os status de agente usam o mesmo
 * contorno e reaproveitam o desenho de pessoa (o icone proprio vem na linha da
 * tarefa de agente); o que muda e o nome, e o `running` ganha um ponto verde-agua.
 */
export function TaskStatusGlyph(props: TaskStatusGlyphProps) {
  const { actor, status, size = 22, className } = props;
  const label = taskStatusName(actor, status);
  const dataStatus = status ?? "reference";

  return (
    <svg
      role="img"
      aria-label={label}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      data-status={dataStatus}
      data-actor={actor}
      className={className ?? styles.statusGlyph}
    >
      {dataStatus === "reference" ? (
        <circle cx="12" cy="12" r="4.5" fill="currentColor" stroke="none" />
      ) : (
        <circle cx="12" cy="12" r="9" strokeDasharray={dataStatus === "toDefine" ? "2.4 2.31" : undefined} />
      )}
      {dataStatus === "doing" || dataStatus === "running" ? (
        <path d="M12 6a6 6 0 0 1 0 12Z" fill="currentColor" stroke="none" />
      ) : null}
      {dataStatus === "inHold" || dataStatus === "waiting" ? (
        <>
          <path d="M10 9v6" />
          <path d="M14 9v6" />
        </>
      ) : null}
      {dataStatus === "done" || dataStatus === "completed" ? <path d="m8.5 12.2 2.4 2.4 4.6-4.9" /> : null}
      {dataStatus === "failed" ? (
        <>
          <path d="M12 8v5" />
          <path d="M12 16.2h.01" />
        </>
      ) : null}
      {dataStatus === "interrupted" ? <path d="M9 12h6" /> : null}
      {dataStatus === "rolled_back" ? <path d="m13.5 9-3.5 3 3.5 3" /> : null}
      {dataStatus === "cancel" || dataStatus === "cancelled" || dataStatus === "missed" ? (
        dataStatus === "cancel" || dataStatus === "cancelled" ? (
          <>
            <path d="m9.5 9.5 5 5" />
            <path d="m14.5 9.5-5 5" />
          </>
        ) : (
          <path d="m9 15 6-6" />
        )
      ) : null}
      {dataStatus === "running" || dataStatus === "doing" ? (
        <circle cx="19" cy="5" r="3" className={styles.activeDot} stroke="none" />
      ) : null}
    </svg>
  );
}
