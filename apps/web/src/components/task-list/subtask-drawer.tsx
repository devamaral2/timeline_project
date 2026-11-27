import { Bot, ChevronDown } from "lucide-react";
import Link from "next/link";
import type { CSSProperties } from "react";
import { countsAsDone, isClosedStatus } from "@repo/contracts";
import type { AgentTaskStatus, HumanTaskStatus, TaskCardDto } from "@repo/contracts";
import { TaskStatusGlyph, taskStatusName } from "@/components/tasks/task-status-glyph";
import { cardIsOverdue, cardWhenLabel } from "@/lib/tasks/card-text";
import type { SubtaskTree } from "@/lib/tasks/task-groups";
import styles from "./subtasks.module.css";

/** A volta do círculo da pizza (raio 5), para o traço das feitas. */
const PIE_LENGTH = 2 * Math.PI * 5;
/** Feita, cancelada e não realizada: o nome sai riscado no tom apagado. */
/** O rótulo de `cardWhenLabel` para quem não tem dia. */
const NO_DATE = "Sem data";

interface ToggleProps {
  card: TaskCardDto;
  subtasks: readonly TaskCardDto[];
  expanded: boolean;
  onToggle: () => void;
}

/**
 * A fração das subtarefas na ponta da linha (canvas “Lista de tarefas —
 * subtarefas”, modelo A): a pizza das feitas, “1/4” e a seta. Abre e fecha a
 * gaveta logo abaixo da linha.
 */
export function SubtaskToggle({ card, subtasks, expanded, onToggle }: ToggleProps) {
  const done = subtasks.filter((subtask) => countsAsDone(subtask.actor, subtask.status)).length;
  const filled = (done / subtasks.length) * PIE_LENGTH;
  return (
    <button
      type="button"
      className={styles.toggle}
      aria-expanded={expanded}
      aria-label={`Subtarefas de “${card.name}”: ${done} de ${subtasks.length} feitas`}
      onClick={onToggle}
    >
      <svg className={styles.pie} viewBox="0 0 14 14" aria-hidden="true">
        <circle className={styles.pieTrack} cx="7" cy="7" r="5" />
        <circle className={styles.pieFill} cx="7" cy="7" r="5" strokeDasharray={`${filled} ${PIE_LENGTH}`} transform="rotate(-90 7 7)" />
      </svg>
      <span>{done}/{subtasks.length}</span>
      <ChevronDown className={styles.chevron} aria-hidden="true" />
    </button>
  );
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
 * A gaveta: as subtarefas diretas, presas ao glifo da principal por um fio.
 * Cada uma tem o glifo (o de pessoa abre a mesma escolha de status da lista), o
 * nome que leva ao detalhe, o quando e, se tiver as suas, a própria fração.
 */
export function SubtaskDrawer({ parent, tree, userId, now, closedIds, onToggle, onStatusClick }: DrawerProps) {
  return (
    <ul className={styles.tree} aria-label={`Subtarefas de “${parent.name}”`}>
      {tree.subtasksOf(parent.id).map((card, index) => {
        const nested = tree.subtasksOf(card.id);
        const open = !closedIds.includes(card.id);
        const isAgent = card.actor === "agent";
        const humanStatus = (card.status ?? null) as HumanTaskStatus | null;
        // Na gaveta o quando só aparece quando diz alguma coisa: "Sem data" repetido vira ruído.
        const when = cardWhenLabel(card, now);
        return (
          <li key={card.id} className={styles.item} style={{ "--i": index } as CSSProperties}>
            <div className={styles.line}>
              <span className={styles.elbow} aria-hidden="true" />
              {isAgent ? (
                <span className={styles.glyphSlot}>
                  <TaskStatusGlyph actor="agent" status={card.status as AgentTaskStatus} size={18} />
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
              {/* Decorativo: o nome do glifo já diz "Agente". */}
              {isAgent ? <Bot className={styles.agentMark} aria-hidden="true" /> : null}
              {nested.length > 0 ? (
                <SubtaskToggle card={card} subtasks={nested} expanded={open} onToggle={() => onToggle(card.id)} />
              ) : null}
            </div>
            {open && nested.length > 0 ? (
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
  );
}
