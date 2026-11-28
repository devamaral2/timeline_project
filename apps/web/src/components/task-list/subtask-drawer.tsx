import { ChevronDown } from "lucide-react";
import Link from "next/link";
import type { CSSProperties } from "react";
import { countsAsDone, isClosedStatus } from "@repo/contracts";
import type { AgentTaskStatus, HumanTaskStatus, TaskCardDto } from "@repo/contracts";
import { AgentStatusIcon } from "@/components/tasks/agent-status-icon";
import { TaskStatusGlyph, taskStatusName } from "@/components/tasks/task-status-glyph";
import { cardIsOverdue, cardWhenLabel } from "@/lib/tasks/card-text";
import type { SubtaskTree } from "@/lib/tasks/task-groups";
import styles from "./subtasks.module.css";

/** A volta do círculo da pizza (raio 5), para o traço das feitas. */
const PIE_LENGTH = 2 * Math.PI * 5;
/** O rótulo de `cardWhenLabel` para quem não tem dia. */
const NO_DATE = "Sem data";

/** "1 de 4 feitas"; com uma subtarefa só, "0 de 1 feita". */
function progressText(done: number, total: number): string {
  return `${done} de ${total} ${total === 1 ? "feita" : "feitas"}`;
}

interface DrawerProps {
  parent: TaskCardDto;
  tree: SubtaskTree;
  userId: string;
  now: Date;
  /** As tarefas com a gaveta fechada (a principal e, dentro dela, as subtarefas que têm as suas). Sem estar aqui, a gaveta vem aberta. */
  closedIds: readonly string[];
  onToggle: (taskId: string) => void;
  onStatusClick: (card: TaskCardDto, anchor: HTMLElement) => void;
}

/**
 * A gaveta (canvas “Lista de tarefas · prioridade e projeto à direita”, quadro C): presa ao glifo da principal por um
 * fio. No topo do fio, a pizza das feitas, “1 de 4 feitas” e a seta, que abre e fecha; embaixo, as subtarefas diretas.
 * Cada uma tem à esquerda o glifo (o de pessoa abre a mesma escolha de status da lista; na de agente, um ponto inerte),
 * o nome que leva ao detalhe, o quando, na de agente o ícone quadrado do status na extrema direita e, se tiver as
 * suas, a própria gaveta logo abaixo.
 */
export function SubtaskDrawer({ parent, tree, userId, now, closedIds, onToggle, onStatusClick }: DrawerProps) {
  const subtasks = tree.subtasksOf(parent.id);
  const open = !closedIds.includes(parent.id);
  const done = subtasks.filter((subtask) => countsAsDone(subtask.actor, subtask.status)).length;
  const filled = (done / subtasks.length) * PIE_LENGTH;
  return (
    <div className={styles.tree}>
      <button
        type="button"
        className={styles.toggle}
        aria-expanded={open}
        aria-label={`Subtarefas de “${parent.name}”: ${progressText(done, subtasks.length)}`}
        onClick={() => onToggle(parent.id)}
      >
        <span className={styles.elbow} aria-hidden="true" />
        <svg className={styles.pie} viewBox="0 0 14 14" aria-hidden="true">
          <circle className={styles.pieTrack} cx="7" cy="7" r="5" />
          <circle className={styles.pieFill} cx="7" cy="7" r="5" strokeDasharray={`${filled} ${PIE_LENGTH}`} transform="rotate(-90 7 7)" />
        </svg>
        <span>{progressText(done, subtasks.length)}</span>
        <ChevronDown className={styles.chevron} aria-hidden="true" />
      </button>
      {open ? (
        <ul className={styles.items} aria-label={`Subtarefas de “${parent.name}”`}>
          {subtasks.map((card, index) => {
            const isAgent = card.actor === "agent";
            const humanStatus = (card.status ?? null) as HumanTaskStatus | null;
            // Na gaveta o quando só aparece quando diz alguma coisa: "Sem data" repetido vira ruído.
            const when = cardWhenLabel(card, now);
            return (
              <li key={card.id} className={styles.item} style={{ "--i": index } as CSSProperties}>
                <div className={styles.line}>
                  <span className={styles.elbow} aria-hidden="true" />
                  {isAgent ? (
                    <span className={styles.glyphSlot} data-row-lead aria-hidden="true">
                      <span className={styles.idleDot} />
                    </span>
                  ) : (
                    <button
                      type="button"
                      className={styles.glyphButton}
                      aria-label={`${taskStatusName("human", humanStatus)}. Mudar status de “${card.name}”`}
                      onClick={(event) => onStatusClick(card, event.currentTarget)}
                    >
                      <TaskStatusGlyph actor="human" status={humanStatus} size={18} />
                    </button>
                  )}
                  <Link
                    href={`/${userId}/tarefas/${card.id}`}
                    className={styles.name}
                    data-closed={isClosedStatus(card.actor, card.status) ? "true" : "false"}
                  >
                    {card.name}
                  </Link>
                  <span className={styles.when} data-overdue={cardIsOverdue(card, now) ? "true" : "false"}>
                    {when === NO_DATE ? null : when}
                  </span>
                  {isAgent ? <AgentStatusIcon status={card.status as AgentTaskStatus} size={16} className={styles.agentStatus} /> : null}
                </div>
                {tree.subtasksOf(card.id).length > 0 ? (
                  <SubtaskDrawer
                    parent={card}
                    tree={tree}
                    userId={userId}
                    now={now}
                    closedIds={closedIds}
                    onToggle={onToggle}
                    onStatusClick={onStatusClick}
                  />
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
