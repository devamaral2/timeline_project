import type { EventCardDto } from "@repo/contracts";
import { newIdempotencyKey } from "@/lib/api/events";

/**
 * As subtarefas do formulário de edição. Não são campos do `EventDraft`: cada
 * uma é um evento próprio, com a revisão dela, e cada uma vai por uma chamada.
 * Uma linha guarda o que foi lido (`loadedName`, `revision`) e o que a pessoa
 * digitou (`name`), para dizer o que mudou ao Salvar.
 */
export interface SubtaskRow {
  /** Chave estável da linha: o id da subtarefa, ou a chave de idempotência da nova. */
  key: string;
  /** `null` enquanto a subtarefa é nova e ainda não foi criada. */
  id: string | null;
  /** Revisão da subtarefa como foi lida; a renomeação a envia. */
  revision: number;
  /** O nome como foi lido; `name` diferente dele é uma renomeação. */
  loadedName: string;
  name: string;
  /** Subtarefa existente que a pessoa tirou da lista. O evento dela não é apagado. */
  removed: boolean;
}

export interface SubtaskPlan {
  /** Ids que continuam ligados ao evento aberto: a lista que o `PATCH` do pai leva quando há remoção. */
  keptIds: string[];
  removedIds: string[];
  renames: { id: string; revision: number; name: string }[];
  creates: { key: string; name: string }[];
}

export const SUBTASK_NAME_MESSAGE = "Dê um nome à subtarefa.";

export function newSubtaskRow(): SubtaskRow {
  return { key: newIdempotencyKey(), id: null, revision: 0, loadedName: "", name: "", removed: false };
}

/**
 * Casa as linhas com as subtarefas lidas agora. Uma linha cuja subtarefa sumiu
 * sai; uma subtarefa nova na lista entra; o nome que a pessoa digitou fica, e o
 * que ela não tocou passa a valer o da versão lida. Linhas novas (sem id) ficam.
 */
export function rebaseSubtaskRows(rows: SubtaskRow[], cards: EventCardDto[]): SubtaskRow[] {
  const byId = new Map(cards.map((card) => [card.id, card]));
  const kept: SubtaskRow[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    if (row.id === null) {
      kept.push(row);
      continue;
    }
    const card = byId.get(row.id);
    if (!card) continue;
    seen.add(card.id);
    kept.push({
      ...row,
      revision: card.revision,
      loadedName: card.name,
      name: row.name === row.loadedName ? card.name : row.name,
    });
  }
  for (const card of cards) {
    if (seen.has(card.id)) continue;
    kept.push({ key: card.id, id: card.id, revision: card.revision, loadedName: card.name, name: card.name, removed: false });
  }
  return kept;
}

/** O que mudou em relação ao lido, separado por chamada. */
export function planSubtaskChanges(rows: SubtaskRow[]): SubtaskPlan {
  const plan: SubtaskPlan = { keptIds: [], removedIds: [], renames: [], creates: [] };
  for (const row of rows) {
    if (row.id === null) {
      if (!row.removed) plan.creates.push({ key: row.key, name: row.name.trim() });
      continue;
    }
    if (row.removed) {
      plan.removedIds.push(row.id);
      continue;
    }
    plan.keptIds.push(row.id);
    if (row.name.trim() !== row.loadedName.trim()) {
      plan.renames.push({ id: row.id, revision: row.revision, name: row.name.trim() });
    }
  }
  return plan;
}

export function subtaskPlanHasWork(plan: SubtaskPlan): boolean {
  return plan.removedIds.length + plan.renames.length + plan.creates.length > 0;
}

/** Uma linha que vai ser gravada precisa de nome. Linhas removidas não contam. */
export function validateSubtaskRows(rows: SubtaskRow[]): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const row of rows) {
    if (!row.removed && !row.name.trim()) errors[row.key] = SUBTASK_NAME_MESSAGE;
  }
  return errors;
}
