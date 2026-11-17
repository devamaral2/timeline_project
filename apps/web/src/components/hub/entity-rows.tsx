import { CalendarDays, ChevronRight, FileText, ListChecks } from "lucide-react";
import Link from "next/link";
import type { RequestEntityDto } from "@repo/contracts";
import type { AgentChatEntityRef } from "@/lib/agent-chat/use-agent-chat";
import styles from "@/components/shell/shell.module.css";

export const CHANGE_LABELS: Record<AgentChatEntityRef["kind"], Record<AgentChatEntityRef["change"], string>> = {
  task: { created: "Tarefa criada", updated: "Tarefa alterada", deleted: "Tarefa apagada" },
  note: { created: "Nota criada", updated: "Nota alterada", deleted: "Nota apagada" },
};

const ENTITY_ICONS: Record<AgentChatEntityRef["kind"], typeof ListChecks> = {
  task: CalendarDays,
  note: FileText,
};

/**
 * A entidade que um pedido tocou, na forma da linha do chat (`Tarefa criada · Comprar faixa`). Um artefato
 * aparece como nota: a linha do chat só conhece esses três tipos.
 */
export function requestEntityRef(entity: RequestEntityDto): AgentChatEntityRef {
  const change = entity.operation === "create" ? "created" : entity.operation === "delete" ? "deleted" : "updated";
  return {
    kind: entity.kind === "task" ? "task" : "note",
    id: entity.id,
    change,
    label: entity.name,
  };
}

interface EntityRowsProps {
  entities: readonly AgentChatEntityRef[];
  entityHref?: (entity: AgentChatEntityRef) => string | undefined;
  onOpenEntity?: () => void;
}

/**
 * A prévia de cada registro que um pedido criou, alterou ou apagou: o ícone do tipo, o que
 * aconteceu e o nome, com a seta quando abre a página dele. Serve ao chat e à caixa de processo.
 */
export function EntityRows({ entities, entityHref, onOpenEntity }: EntityRowsProps) {
  if (entities.length === 0) return null;
  return (
    <ul className={styles.chatEntities} aria-label="Registros desta resposta">
      {entities.map((entity) => {
        const href = entity.change === "deleted" ? undefined : entityHref?.(entity);
        const Icon = ENTITY_ICONS[entity.kind];
        const content = (
          <>
            <Icon aria-hidden />
            <span className={styles.chatEntityText}>
              <span className={styles.chatEntityChange}>{CHANGE_LABELS[entity.kind][entity.change]}</span>
              {entity.label ? <span className={styles.chatEntityName}>{entity.label}</span> : null}
            </span>
            {href && <ChevronRight aria-hidden className={styles.chatEntityGo} />}
          </>
        );
        return (
          <li key={`${entity.change}:${entity.id}`} data-change={entity.change}>
            {href ? (
              <Link href={href} className={styles.chatEntityRow} onClick={onOpenEntity}>
                {content}
              </Link>
            ) : (
              <span className={styles.chatEntityRow}>{content}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
