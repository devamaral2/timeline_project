import type { AgentChatFieldChange, AgentEntityItem } from "@repo/contracts";

const MAX_TEXT_CHARS = 80;

const PRIORITY_LABELS: Record<string, string> = {
  urgent: "Urgente",
  normal: "Normal",
  flexible: "Flexível",
  high: "Alta",
  medium: "Média",
  low: "Baixa",
};

const STATUS_LABELS: Record<string, string> = {
  todo: "A fazer",
  scheduled: "Agendada",
  toDefine: "A definir",
  inHold: "Em espera",
  done: "Concluída",
  cancel: "Cancelada",
};

/**
 * O que um pedido tirou e pos num registro, para o chat mostrar como diff
 * (`-` o que saiu, `+` o que entrou). So olha o que o usuario enxerga: o
 * horario, o nome, a descricao, a prioridade, o estado e as tags.
 *
 * Criado so tem `after` (o que nasceu preenchido); alterado compara `before`
 * com `after`; apagado nao tem diff.
 */
export function entityChanges(before: AgentEntityItem | undefined, after: AgentEntityItem): AgentChatFieldChange[] {
  const changes: AgentChatFieldChange[] = [];
  const add = (field: AgentChatFieldChange["field"], from: string | undefined, to: string | undefined) => {
    if (from === to) return;
    changes.push({ field, ...(from !== undefined ? { before: from } : {}), ...(to !== undefined ? { after: to } : {}) });
  };

  if (after.kind === "event") {
    const was = before?.kind === "event" ? before : undefined;
    add("time", was && interval(was.startedAt, was.finishedAt), interval(after.startedAt, after.finishedAt));
    if (was) {
      add("name", was.name, after.name);
      add("description", text(was.description), text(after.description));
      add("priority", PRIORITY_LABELS[was.priority], PRIORITY_LABELS[after.priority]);
      add("tags", tags(was.tags), tags(after.tags));
    }
  } else if (after.kind === "task") {
    const was = before?.kind === "task" ? before : undefined;
    add("deadline", was?.estimatedFinishAt, after.estimatedFinishAt);
    if (was) {
      add("name", was.name, after.name);
      add("description", text(was.description), text(after.description));
      add("status", STATUS_LABELS[was.status], STATUS_LABELS[after.status]);
      add("priority", PRIORITY_LABELS[was.priority], PRIORITY_LABELS[after.priority]);
      add("tags", tags(was.tags), tags(after.tags));
    }
  } else if (before?.kind === "note") {
    add("name", before.name, after.name);
  }
  return changes;
}

/** Intervalo ISO 8601 `inicio/fim`; sem fim, termina na barra. */
function interval(startedAt: string, finishedAt?: string): string {
  return `${startedAt}/${finishedAt ?? ""}`;
}

function text(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.length <= MAX_TEXT_CHARS ? trimmed : `${trimmed.slice(0, MAX_TEXT_CHARS - 1)}…`;
}

function tags(value: readonly string[]): string | undefined {
  return value.length > 0 ? value.map((tag) => `#${tag}`).join(" ") : undefined;
}
