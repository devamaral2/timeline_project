import type { Recurrence } from "../../domain";
import type { RecurrenceDto } from "@repo/contracts";

export function toRecurrenceDto(recurrence: Recurrence): RecurrenceDto {
  return {
    ...recurrence.rule,
    id: recurrence.id,
    target: recurrence.target,
    template: structuredClone(recurrence.template) as Record<string, unknown>,
    revision: recurrence.revision,
  };
}
