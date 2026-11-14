import type { Artifact, Recurrence, RecurrenceRule } from "../../domain";
import type { RecurrenceTemplate } from "@repo/contracts";
import { shiftDayKey } from "@repo/timeline";
import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";
import type { PrepareEventOptions } from "../events/create-event.usecase";
import type { RecurrenceTemplateDeps } from "./prepare-recurrence";
import { prepareTemplate, storedTemplateOf, todayOf } from "./recurrence-templates";

export interface RecurrenceRevision {
  /** So o que muda; uma chave com `undefined` remove o campo opcional da regra. */
  rule: Partial<RecurrenceRule>;
  /** Substitui o template inteiro. Ausente, o da serie fica. */
  template?: RecurrenceTemplate;
  /**
   * O template novo nao traz artefatos e os da serie devem ficar. O PATCH da API
   * troca o template inteiro (e os artefatos com ele); o agente altera so o que foi pedido.
   */
  keepArtifacts?: boolean;
}

export interface RevisedRecurrence {
  recurrence: Recurrence;
  /** Os artefatos novos do template, gravados antes da serie. */
  artifacts: Artifact[];
  derivations: { originalId: string; copyId: string }[];
  /** A serie vale de hoje em diante: as ocorrencias deste dia para frente sao regeradas. */
  fromDay: string;
}

/**
 * Monta a serie revisada, sem gravar. E o que `PATCH /api/recurrences` e o
 * agente compartilham: quem grava decide como (repositorio sozinho, ou no
 * mesmo lote do passo do agente).
 *
 * Editar vale de hoje em diante: as ocorrencias de hoje para frente que ninguem
 * mexeu a mao sao apagadas e regeradas na proxima leitura. O passado fica como
 * aconteceu.
 */
export async function reviseRecurrence(
  deps: RecurrenceTemplateDeps,
  existing: Recurrence,
  revision: RecurrenceRevision,
  actor: AuthenticatedUser,
  now: Date,
  options?: PrepareEventOptions,
): Promise<RevisedRecurrence> {
  // A regra revisada vem primeiro: o template novo e resolvido com a janela dela.
  const withRule = existing.revise({ rule: revision.rule });
  // Trocar o template troca os artefatos da serie; os que saem continuam existindo, soltos.
  const prepared =
    revision.template === undefined
      ? undefined
      : await prepareTemplate(deps, revision.template, withRule.rule, actor, options);
  const template =
    prepared && revision.keepArtifacts && prepared.template.artifactIds.length === 0
      ? { ...prepared.template, artifactIds: storedTemplateOf(existing).artifactIds }
      : prepared?.template;

  let revised: Recurrence = existing.revise({
    rule: revision.rule,
    template: template ? { ...template } : undefined,
  });

  const fromDay = todayOf(revised.rule, now);
  const yesterday = shiftDayKey(fromDay, -1);
  // A regeracao recomeca em hoje; ontem para tras ja esta gerado e fica.
  if (existing.materializedThrough && yesterday >= revised.rule.startsOn) {
    revised = revised.materializedUntil(yesterday);
  }
  return { recurrence: revised, artifacts: prepared?.artifacts ?? [], derivations: prepared?.derivations ?? [], fromDay };
}
