import { useCallback, useEffect, useState } from "react";
import type { EventDto } from "@repo/contracts";
import { createEvent, listSubtasks, updateEvent } from "@/lib/api/events";
import { type SubtaskPlan, type SubtaskRow, rebaseSubtaskRows } from "./event-subtask-draft";

/**
 * As linhas de subtarefa do formulário de edição, lidas de `listSubtasks` e
 * recarregadas quando a revisão do evento muda. Quem Salva chama
 * `applyChanges` depois de gravar o pai: a renomeação e a criação saem aqui.
 */
export function useSubtaskDraft(event: EventDto | null) {
  const eventId = event?.id ?? null;
  const revision = event?.revision ?? null;
  const [rows, setRows] = useState<SubtaskRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);

  const refresh = useCallback(async () => {
    if (eventId === null) return;
    try {
      const cards = await listSubtasks(eventId);
      setRows((previous) => rebaseSubtaskRows(previous, cards));
      setLoaded(true);
      setLoadFailed(false);
    } catch {
      setLoadFailed(true);
    }
  }, [eventId]);

  useEffect(() => {
    void refresh();
  }, [refresh, revision]);

  /**
   * Renomeia, depois cria. Cada criação leva `parentEventIds` com o pai, então
   * sobe a revisão dele: por isso o `PATCH` do pai sai antes, com a revisão lida.
   */
  const applyChanges = useCallback(
    async (parentId: string, plan: SubtaskPlan) => {
      for (const rename of plan.renames) {
        await updateEvent(rename.id, { expectedRevision: rename.revision, name: rename.name });
      }
      for (const create of plan.creates) {
        const id = await createEvent(
          { kind: "routine", status: "todo", name: create.name, parentEventIds: [parentId] },
          { idempotencyKey: create.key },
        );
        setRows((current) => current.map((row) => (row.key === create.key ? { ...row, id, loadedName: create.name } : row)));
      }
    },
    [],
  );

  return { rows, setRows, loaded, loadFailed, refresh, applyChanges };
}
