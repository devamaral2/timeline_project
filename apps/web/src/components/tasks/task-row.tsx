import Link from "next/link";
import type { ReactNode } from "react";
import type { AgentTaskStatus, TaskCardDto, HumanTaskStatus } from "@repo/contracts";
import { cardDurationLabel, cardIsOverdue, cardWhenLabel } from "@/lib/tasks/card-text";
import { ProviderMark, providerNames } from "@/components/hub/provider-marks";
import { ProjectLine } from "@/components/projects/project-line";
import { TaskKindMark } from "./task-kind-mark";
import { AgentStatusIcon } from "./agent-status-icon";
import { agentStatusNames } from "./agent-status-names";
import { TaskStatusGlyph, taskStatusName } from "./task-status-glyph";
import styles from "./task-row.module.css";

export interface TaskRowProps {
  /** O cartao de tarefa do contrato: a linha nao le nenhum campo fora dele. */
  card: TaskCardDto;
  /** Dono da timeline: o toque no resto da linha leva a `/{userId}/tarefas/{id}`. */
  userId: string;
  /** O instante atual: os textos calculados (quando, atrasado, "há 12 min") saem dele. */
  now: Date;
  /** A lista pede a regra da serie no lugar do horario, quando a ocorrencia tem uma. */
  ruleInPlaceOfTime?: boolean;
  /** Toque no glifo de uma tarefa de pessoa (a tela abre a escolha de status). */
  onStatusClick?: (card: TaskCardDto, anchor: HTMLElement) => void;
  /** Controle na ponta direita da linha, fora do link (a fração das subtarefas na lista). */
  aside?: ReactNode;
  /** O que vem embaixo da linha, na largura dela (a gaveta das subtarefas na lista). */
  children?: ReactNode;
}

/**
 * A linha única das listas: glifo de status, título, a linha do projeto (marca e
 * nome), uma linha com o tipo, o "quando" e as tags, e a duração à direita. Pessoa e agente usam a
 * mesma grade. A tarefa de agente leva à direita o nome do status, o ícone quadrado dele e, abaixo,
 * o símbolo do provedor (quando o pedido levou a escolha); o status do agente não se edita.
 * O glifo de pessoa é um botão; à esquerda da tarefa de agente fica um ponto inerte, que é o
 * lugar do controle de situação.
 */
export function TaskRow({ card, userId, now, ruleInPlaceOfTime, onStatusClick, aside, children }: TaskRowProps) {
  const isAgent = card.actor === "agent";
  const overdue = !isAgent && cardIsOverdue(card, now);
  const when = cardWhenLabel(card, now, { ruleInPlaceOfTime });
  const duration = cardDurationLabel(card);
  // O contrato garante que o status e de agente quando o ator e agente, e de pessoa (ou ausente) no outro caso.
  const agentStatus = card.status as AgentTaskStatus;
  const humanStatus = (card.status ?? null) as HumanTaskStatus | null;

  return (
    <li className={styles.row} data-actor={card.actor} data-status={card.status ?? "reference"}>
      {isAgent ? (
        <AgentLead />
      ) : (
        <button
          type="button"
          className={styles.glyphButton}
          aria-label={`${taskStatusName("human", humanStatus)}. Mudar status de “${card.name}”`}
          onClick={(event) => onStatusClick?.(card, event.currentTarget)}
        >
          <TaskStatusGlyph actor="human" status={humanStatus} />
        </button>
      )}
      <Link href={`/${userId}/tarefas/${card.id}`} className={styles.body}>
        <span className={styles.text}>
          <span className={styles.title}>{card.name}</span>
          {/* A mesma linha para pessoa e agente, abaixo do título e acima da linha do tipo. */}
          <ProjectLine project={card.project} />
          <span className={styles.meta}>
            <TaskKindMark kind={card.kind} />
            <span className={styles.when} data-overdue={overdue ? "true" : "false"}>
              {when}
            </span>
            {card.tags.map((tag) => (
              <span key={tag} className={styles.tag}>
                #{tag}
              </span>
            ))}
          </span>
        </span>
        {duration ? <span className={styles.duration}>{duration}</span> : null}
        {isAgent ? <AgentSide status={agentStatus} model={card.model} /> : null}
      </Link>
      {aside}
      {children}
    </li>
  );
}

/**
 * O que ocupa a esquerda da tarefa de agente: um ponto inerte, na caixa de 24px do glifo de pessoa. O
 * controle de situação entra neste lugar.
 */
function AgentLead() {
  return (
    <span className={styles.glyphSlot} data-row-lead>
      <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" className={styles.idleDot}>
        <path d="M12 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z" fill="currentColor" />
      </svg>
    </span>
  );
}

/** A ponta direita da tarefa de agente: o nome e o ícone do status, e o provedor que rodou a tarefa embaixo. */
function AgentSide({ status, model }: { status: AgentTaskStatus; model: TaskCardDto["model"] }) {
  return (
    <span className={styles.side} data-row-side>
      <span className={styles.status} data-status={status}>
        {/* O ícone já diz o nome por inteiro ("Agente, na fila"); o texto é só para quem enxerga. */}
        <span aria-hidden="true">{agentStatusNames[status]}</span>
        <AgentStatusIcon status={status} />
      </span>
      {model ? (
        <span className={styles.provider} role="img" aria-label={providerNames[model.provider]}>
          <ProviderMark provider={model.provider} />
        </span>
      ) : null}
    </span>
  );
}
