import type { Note, Recurrence, RecurrenceRule } from "../../domain";
import type { EventRecurrenceTemplate, TaskRecurrenceTemplate } from "@repo/contracts";
import type { TaskRepository } from "../../domain/ports";
import { shiftDayKey } from "@repo/timeline";
import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";
import type { CreateEventUseCase } from "../events/create-event.usecase";
import { prepareEventTemplate, prepareTaskTemplate, todayOf } from "./recurrence-templates";

export interface RecurrenceRevision {
  /** So o que muda; uma chave com `undefined` remove o campo opcional da regra. */
  rule: Partial<RecurrenceRule>;
  /** Substitui o template inteiro. Ausente, o da serie fica. */
  template?: EventRecurrenceTemplate | TaskRecurrenceTemplate;
  /**
   * O template novo nao traz notes e as da serie devem ficar. O PATCH da API
   * troca o template inteiro (e as notes com ele); o agente altera so o que foi pedido.
   */
  keepNotes?: boolean;
}

export interface RevisedRecurrence {
  recurrence: Recurrence;
  /** As notes novas do template, gravadas antes da serie. */
  notes: Note[];
  /** A serie vale de hoje em diante: as ocorrencias deste dia para frente sao regeradas. */
  fromDay: string;
}

/**
 * Monta a serie revisada, sem gravar. E o que `PATCH /api/recurrences` e o
 * agente compartilham: quem grava decide como (repositorio sozinho, ou no
 * mesmo lote do turno do chat).
 *
 * Editar vale de hoje em diante: as ocorrencias de hoje para frente que ninguem
 * mexeu a mao sao apagadas e regeradas na proxima leitura. O passado fica como
 * aconteceu.
 */
export async function reviseRecurrence(
  deps: {
    createEvent: Pick<CreateEventUseCase, "prepare">;
    tasks: Pick<TaskRepository, "findById">;
  },
  existing: Recurrence,
  revision: RecurrenceRevision,
  actor: AuthenticatedUser,
  now: Date,
): Promise<RevisedRecurrence> {
  // A regra revisada vem primeiro: o template novo e resolvido com a janela dela.
  const withRule = existing.revise({ rule: revision.rule });
  // Trocar o template troca as notes da serie; as que saem continuam existindo, soltas.
  const prepared =
    revision.template === undefined
      ? undefined
      : withRule.target === "event"
        ? await prepareEventTemplate(deps.createEvent, revision.template as EventRecurrenceTemplate, withRule.rule, actor)
        : {
            template: await prepareTaskTemplate(deps.tasks, revision.template as TaskRecurrenceTemplate, withRule.rule, actor),
            notes: [] as Note[],
            noteIds: existing.noteIds as string[],
          };
  const keepNotes = revision.keepNotes && prepared !== undefined && prepared.notes.length === 0;
  let revised: Recurrence = existing.revise({
    rule: revision.rule,
    template: prepared ? { ...prepared.template } : undefined,
    noteIds: keepNotes ? undefined : prepared?.noteIds,
  });

  const fromDay = todayOf(revised.rule, now);
  const yesterday = shiftDayKey(fromDay, -1);
  // A regeracao recomeca em hoje; ontem para tras ja esta gerado e fica.
  if (existing.materializedThrough && yesterday >= revised.rule.startsOn) {
    revised = revised.materializedUntil(yesterday);
  }
  return { recurrence: revised, notes: prepared?.notes ?? [], fromDay };
}
