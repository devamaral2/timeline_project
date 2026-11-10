import { CalendarDays, ChevronRight, FileText, ListChecks } from "lucide-react";
import Link from "next/link";
import type { AgentChatEntityRef, AiProcessEntityDto } from "@/lib/api/contracts";
import styles from "@/components/shell/shell.module.css";

export const CHANGE_LABELS: Record<AgentChatEntityRef["kind"], Record<AgentChatEntityRef["change"], string>> = {
  event: { created: "Evento criado", updated: "Evento alterado", deleted: "Evento apagado" },
  task: { created: "Tarefa criada", updated: "Tarefa alterada", deleted: "Tarefa apagada" },
  note: { created: "Nota criada", updated: "Nota alterada", deleted: "Nota apagada" },
};

const ENTITY_ICONS: Record<AgentChatEntityRef["kind"], typeof ListChecks> = {
  event: CalendarDays,
  task: ListChecks,
  note: FileText,
};

/** A entidade que um processo tocou, na forma da linha do chat (`Tarefa criada · Comprar faixa`). */
export function processEntityRef(entity: AiProcessEntityDto): AgentChatEntityRef {
  return {
    kind: entity.kind,
    id: entity.id,
    change: entity.operation === "create" ? "created" : "updated",
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
              <span className={styles.chatEntityChange}>
                {CHANGE_LABELS[entity.kind][entity.change]}
                {entity.label ? " · " : ""}
              </span>
              {entity.label}
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
