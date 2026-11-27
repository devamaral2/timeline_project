import type { AgentTaskStatus, TaskActor, HumanTaskStatus } from "@repo/contracts";
import { AgentStatusIcon } from "./agent-status-icon";
import { agentStatusAccessibleName, agentStatusNames } from "./agent-status-names";
import styles from "./task-glyphs.module.css";

export { agentStatusNames };

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

/** O nome que um leitor de tela anuncia para o glifo. */
export function taskStatusName(actor: TaskActor, status: HumanStatusOrNone | AgentTaskStatus): string {
  if (actor === "agent") return agentStatusAccessibleName(status as AgentTaskStatus);
  if (status === null) return "Só agenda";
  return humanNames[status as HumanTaskStatus];
}

/**
 * O glifo do status. O de pessoa e um circulo, e o que fica dentro diz qual: nao
 * tem moldura nem fundo, e a cor sai do `data-status` no CSS. Tarefa de pessoa sem
 * status (`null`) e o ponto azul "Só agenda". O de agente e o icone quadrado
 * (`AgentStatusIcon`), nos mesmos lugares em que o de pessoa seria desenhado.
 */
export function TaskStatusGlyph(props: TaskStatusGlyphProps) {
  if (props.actor === "agent") return <AgentStatusIcon status={props.status} size={props.size} className={props.className} />;
  const { status, size = 22, className } = props;
  const label = taskStatusName("human", status);
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
      data-actor="human"
      className={className ?? styles.statusGlyph}
    >
      {dataStatus === "reference" ? (
        <circle cx="12" cy="12" r="4.5" fill="currentColor" stroke="none" />
      ) : (
        <circle cx="12" cy="12" r="9" strokeDasharray={dataStatus === "toDefine" ? "2.4 2.31" : undefined} />
      )}
      {dataStatus === "doing" ? <path d="M12 6a6 6 0 0 1 0 12Z" fill="currentColor" stroke="none" /> : null}
      {dataStatus === "inHold" ? (
        <>
          <path d="M10 9v6" />
          <path d="M14 9v6" />
        </>
      ) : null}
      {dataStatus === "done" ? <path d="m8.5 12.2 2.4 2.4 4.6-4.9" /> : null}
      {dataStatus === "cancel" ? (
        <>
          <path d="m9.5 9.5 5 5" />
          <path d="m14.5 9.5-5 5" />
        </>
      ) : null}
      {dataStatus === "missed" ? <path d="m9 15 6-6" /> : null}
      {dataStatus === "doing" ? <circle cx="19" cy="5" r="3" className={styles.activeDot} stroke="none" /> : null}
    </svg>
  );
}
