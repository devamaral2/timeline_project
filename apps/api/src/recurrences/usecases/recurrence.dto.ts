import type { Recurrence } from "@repo/entities";
import type { RecurrenceDto } from "@repo/entities/contracts";

export function toRecurrenceDto(recurrence: Recurrence): RecurrenceDto {
  return {
    ...recurrence.rule,
    id: recurrence.id,
    target: recurrence.target,
    template: structuredClone(recurrence.template) as Record<string, unknown>,
    revision: recurrence.revision,
  };
}
