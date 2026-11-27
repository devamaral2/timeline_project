import type { AgentTaskStatus } from "@repo/contracts";
import { agentStatusAccessibleName } from "./agent-status-names";
import styles from "./agent-status-icon.module.css";

export interface AgentStatusIconProps {
  status: AgentTaskStatus;
  /** Lado em pixels; o desenho é sempre o da grade de 20. */
  size?: number;
  className?: string;
}

/** O desenho de dentro de cada status, centrado em (10, 10) na grade de 20. */
function Inside({ status }: { status: AgentTaskStatus }) {
  switch (status) {
    case "queued":
      return <circle data-part="dot" cx="10" cy="10" r="1.75" />;
    case "preparing":
      return null;
    case "starting":
      return <circle data-part="spin" cx="10" cy="10" r="4.25" />;
    case "running":
      return <rect data-part="pulse" x="6" y="6" width="8" height="8" rx="1.5" />;
    case "waiting":
      return (
        <>
          <circle data-part="dot" cx="6" cy="10" r="1.2" />
          <circle data-part="dot" cx="10" cy="10" r="1.2" />
          <circle data-part="dot" cx="14" cy="10" r="1.2" />
        </>
      );
    case "completed":
      return <path data-part="tick" d="m6.2 10.2 2.6 2.6 5-5.4" />;
    case "interrupted":
      return <path d="M6.5 10h7" />;
    case "failed":
      return (
        <>
          <path d="M10 5.8v5" />
          <circle data-part="dot" cx="10" cy="14.1" r="1.05" />
        </>
      );
    case "cancelled":
      return <path d="m6.8 6.8 6.4 6.4M13.2 6.8l-6.4 6.4" />;
    case "rolled_back":
      return <path d="m9.4 6.6-3.4 3.4 3.4 3.4M14 6.6l-3.4 3.4 3.4 3.4" />;
  }
}

/** O contorno do quadrado: tracejado em `preparing`, a 40% em `starting`, cheio em `completed`. */
function Square({ status }: { status: AgentTaskStatus }) {
  const part = status === "preparing" ? "dashed" : status === "starting" ? "dim" : status === "completed" ? "solid" : undefined;
  return <rect data-part={part} x="1" y="1" width="18" height="18" rx="5" />;
}

/**
 * O ícone quadrado do status de agente: um SVG só, numa grade de 20, com um
 * quadrado de canto arredondado (18 de lado, raio 5, traço 1,6) e o desenho de
 * dentro centrado em (10, 10). A cor sai do `data-status` no CSS; o giro e o pulso
 * param quando o sistema pede menos movimento.
 */
export function AgentStatusIcon({ status, size = 20, className }: AgentStatusIconProps) {
  return (
    <svg
      role="img"
      aria-label={agentStatusAccessibleName(status)}
      width={size}
      height={size}
      viewBox="0 0 20 20"
      data-status={status}
      data-actor="agent"
      className={className ? `${styles.icon} ${className}` : styles.icon}
    >
      <Square status={status} />
      <Inside status={status} />
    </svg>
  );
}
