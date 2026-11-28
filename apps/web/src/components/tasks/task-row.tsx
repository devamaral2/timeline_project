import Link from "next/link";
import { useState, type ReactNode } from "react";
import type { AgentTaskStatus, TaskCardDto, HumanTaskStatus, TaskSituation } from "@repo/contracts";
import { cardDurationLabel, cardIsOverdue, cardWhenLabel } from "@/lib/tasks/card-text";
import { ProviderMark, providerNames } from "@/components/hub/provider-marks";
import { ProjectMark } from "@/components/projects/project-line";
import { TaskKindMark } from "./task-kind-mark";
import { TaskPriorityMark } from "./task-priority-mark";
import { SituationMenu } from "./situation-menu";
import { TaskSituationGlyph, situationNames } from "./task-situation";
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
  /**
   * A lista trata a situação do pedido de agente: o glifo da esquerda mostra a situação e abre as três opções na
   * própria linha. Sem isto (a agenda), o lugar fica com o ponto inerte.
   */
  onSituationPick?: (card: TaskCardDto, situation: TaskSituation) => void;
  /** O que vem embaixo da linha, na largura dela (a gaveta das subtarefas na lista). */
  children?: ReactNode;
}

/**
 * A linha única das listas. À esquerda, o glifo; no resto, três linhas: a do título, que leva sempre na ponta direita a
 * marca do projeto, com a prioridade à esquerda dela na tarefa de pessoa e o símbolo do provedor na de agente (quando o
 * pedido levou a escolha); a do tipo, com o "quando", a duração (quando a tarefa tem) e, na de agente, o ícone quadrado
 * e o nome do status, que não se edita; e, quando há, a das tags.
 * O glifo de pessoa é um botão; à esquerda da tarefa de agente fica o glifo da situação, que abre as três
 * opções na própria linha, ou um ponto inerte (esperando você, execução agendada e a linha sem quem trate a situação).
 */
export function TaskRow({ card, userId, now, ruleInPlaceOfTime, onStatusClick, onSituationPick, children }: TaskRowProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const isAgent = card.actor === "agent";
  const overdue = !isAgent && cardIsOverdue(card, now);
  const when = cardWhenLabel(card, now, { ruleInPlaceOfTime });
  const duration = cardDurationLabel(card);
  // O contrato garante que o status e de agente quando o ator e agente, e de pessoa (ou ausente) no outro caso.
  const agentStatus = card.status as AgentTaskStatus;
  const humanStatus = (card.status ?? null) as HumanTaskStatus | null;
  // O contrato só traz a situação quando a tarefa a aceita (pedido de agente que terminou).
  const situation = isAgent && onSituationPick ? card.situation : undefined;

  return (
    <li className={styles.row} data-actor={card.actor} data-status={card.status ?? "reference"}>
      {situation ? (
        <button
          type="button"
          className={styles.glyphButton}
          aria-label={`${situationNames[situation]}. Mudar situação de “${card.name}”`}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((current) => !current)}
        >
          <TaskSituationGlyph situation={situation} />
        </button>
      ) : isAgent ? (
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
        <span className={styles.head} data-row-head>
          <span className={styles.title}>{card.name}</span>
          <span className={styles.marks} data-row-marks>
            {isAgent && card.model ? (
              <span className={styles.provider} role="img" aria-label={providerNames[card.model.provider]}>
                <ProviderMark provider={card.model.provider} />
              </span>
            ) : null}
            {isAgent ? null : <TaskPriorityMark priority={card.priority} />}
            <ProjectMark project={card.project} labelled />
          </span>
        </span>
        <span className={styles.meta} data-row-meta>
          <TaskKindMark kind={card.kind} />
          <span className={styles.when} data-overdue={overdue ? "true" : "false"}>
            {when}
          </span>
          {duration ? <span className={styles.duration}>{duration}</span> : null}
          {isAgent ? (
            <span className={styles.status} data-status={agentStatus}>
              <AgentStatusIcon status={agentStatus} size={16} />
              {/* O ícone já diz o nome por inteiro ("Agente, na fila"); o texto é só para quem enxerga. */}
              <span aria-hidden="true">{agentStatusNames[agentStatus]}</span>
            </span>
          ) : null}
        </span>
        {card.tags.length > 0 ? (
          <span className={styles.tags} data-row-tags>
            {card.tags.map((tag) => (
              <span key={tag} className={styles.tag}>
                #{tag}
              </span>
            ))}
          </span>
        ) : null}
      </Link>
      {menuOpen && situation ? (
        <SituationMenu
          value={situation}
          onPick={(next) => {
            setMenuOpen(false);
            onSituationPick?.(card, next);
          }}
        />
      ) : null}
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
