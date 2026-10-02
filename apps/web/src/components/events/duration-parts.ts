export interface DurationPart {
  value: number;
  unit: "h" | "min";
}

/** 30 min → [30 min]; 60 → [1 h]; 85 → [1 h, 25 min]. Os numeros grandes do cartao. */
export function durationPartsOf(startedAt: string, finishedAt: string): DurationPart[] {
  const total = Math.max(
    0,
    Math.round((new Date(finishedAt).getTime() - new Date(startedAt).getTime()) / 60_000),
  );
  if (total < 60) return [{ value: total, unit: "min" }];
  const parts: DurationPart[] = [{ value: Math.floor(total / 60), unit: "h" }];
  if (total % 60) parts.push({ value: total % 60, unit: "min" });
  return parts;
}
