import { Logger } from "@nestjs/common";
import { RecurrenceRevisionConflictError, type Recurrence } from "../../domain";
import type { ArtifactRepository, RecurrenceRepository } from "../../domain/ports";
import { dayKeyOf, expandOccurrences, shiftDayKey } from "@repo/timeline";
import { buildOccurrence, storedTemplateOf, todayOf } from "./recurrence-templates";

/** Quantos dias a frente uma leitura comum garante gerados. */
export const DEFAULT_HORIZON_DAYS = 60;
/**
 * Teto do horizonte. Navegar para 2050 nao pode materializar nove mil linhas
 * numa leitura: alem de um ano, o dia simplesmente aparece vazio.
 */
export const MAX_HORIZON_DAYS = 365;
/** Teto de ocorrencias por serie numa passada; o resto fica para a proxima leitura. */
export const MAX_OCCURRENCES_PER_PASS = 400;

/** Quem le a agenda ou a lista de tarefas pede para a serie estar gerada ate ali. */
export interface RecurrenceMaterializer {
  materialize(userId: string, until?: Date): Promise<void>;
}

/** Para quem nao tem serie nenhuma a gerar: os testes de leitura, por exemplo. */
export const NO_RECURRENCES: RecurrenceMaterializer = {
  materialize: async () => {},
};

/**
 * Gera as ocorrencias das series do usuario ate o horizonte, preguicosamente:
 * roda no comeco de cada leitura e, no caso comum — tudo ja gerado —, e uma
 * consulta e nenhuma escrita.
 */
export class MaterializeRecurrencesUseCase implements RecurrenceMaterializer {
  private readonly logger = new Logger(MaterializeRecurrencesUseCase.name);

  constructor(
    private readonly recurrences: RecurrenceRepository,
    private readonly artifacts: Pick<ArtifactRepository, "findByIds">,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async materialize(userId: string, until?: Date): Promise<void> {
    const now = this.clock();
    // Uma folga de um dia na busca cobre as regras em fusos a leste; o
    // horizonte exato e recalculado por regra, no fuso dela.
    const searchHorizon = horizonOf("UTC", now, until, 1);
    const pending = await this.recurrences.listPendingMaterialization(userId, searchHorizon);

    for (const recurrence of pending) {
      try {
        await this.materializeOne(recurrence, now, until);
      } catch (error) {
        // A regra mudou no meio: a proxima leitura gera com a regra nova.
        if (error instanceof RecurrenceRevisionConflictError) continue;
        // Uma serie quebrada nao pode derrubar a agenda inteira.
        this.logger.error(`Failed to materialize recurrence ${recurrence.id}`, error as Error);
      }
    }
  }

  private async materializeOne(recurrence: Recurrence, now: Date, until: Date | undefined) {
    const { rule } = recurrence;
    const today = todayOf(rule, now);
    const horizon = horizonOf(rule.timeZone, now, until);
    // Serie nova nao inventa passado: comeca hoje, ou no primeiro dia dela.
    const from = recurrence.materializedThrough
      ? shiftDayKey(recurrence.materializedThrough, 1)
      : today;
    if (from > horizon) return;

    const exceptions = new Set(await this.recurrences.listExceptions(recurrence.id));
    const days = expandOccurrences(rule, from, horizon, exceptions);
    const batch = days.slice(0, MAX_OCCURRENCES_PER_PASS);
    const watermark = batch.length < days.length ? (batch[batch.length - 1] as string) : horizon;

    // Um artefato do template que foi apagado some das ocorrencias novas, em vez de quebrar a serie.
    const template = storedTemplateOf(recurrence);
    const live = new Set((await this.artifacts.findByIds(template.artifactIds)).map((artifact) => artifact.id));
    const occurrences = batch.map((day) => buildOccurrence(recurrence, day, live));

    await this.recurrences.materialize(recurrence.materializedUntil(watermark), occurrences, template.previousEventIds);
  }
}

function horizonOf(timeZone: string, now: Date, until: Date | undefined, slackDays = 0): string {
  const today = dayKeyOf(now, timeZone);
  const wanted = until ? dayKeyOf(until, timeZone) : today;
  const byDefault = shiftDayKey(today, DEFAULT_HORIZON_DAYS);
  const ceiling = shiftDayKey(today, MAX_HORIZON_DAYS);
  const horizon = wanted > byDefault ? wanted : byDefault;
  return shiftDayKey(horizon < ceiling ? horizon : ceiling, slackDays);
}
