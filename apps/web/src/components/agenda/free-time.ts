import { shiftDayKey, zonedDayStart } from "@repo/timeline";

/** Quando um evento ocupa o relógio; `endMs` nulo é um evento sem hora de fim. */
export interface TimeSpan {
  startMs: number;
  endMs: number | null;
}

/** Uma lacuna entre eventos do mesmo dia. Só existe na tela; nada disso é salvo. */
export interface FreeSlot {
  startMs: number;
  endMs: number;
  /** Minutos inteiros da lacuna (sempre ≥ 1). */
  minutes: number;
  /** A lacuna vai até o fim do dia, que se escreve “24:00”. */
  endsAtMidnight: boolean;
}

/**
 * Os intervalos livres de um dia: entre um evento e o seguinte e do fim do
 * último evento até a meia-noite. Nunca atravessam o dia — o que sobra depois
 * da meia-noite pertence ao dia seguinte — e não há lacuna antes do primeiro
 * evento.
 *
 * Eventos sobrepostos contam como um bloco só (vale o fim mais tardio). Um
 * evento sem hora de fim não diz quando termina, então dali em diante não se
 * calcula tempo livre: seria chute.
 */
export function freeTimeSlots(spans: readonly TimeSpan[], dayKey: string): FreeSlot[] {
  const dayEndMs = zonedDayStart(shiftDayKey(dayKey, 1)).getTime();
  const ordered = [...spans].sort((left, right) => left.startMs - right.startMs);
  const slots: FreeSlot[] = [];
  let cursorMs: number | null = null;

  for (const span of ordered) {
    if (cursorMs !== null && span.startMs > cursorMs) {
      pushSlot(slots, cursorMs, Math.min(span.startMs, dayEndMs), dayEndMs);
    }
    if (span.endMs === null) return slots;
    cursorMs = Math.max(cursorMs ?? span.endMs, span.endMs);
  }

  if (cursorMs !== null && cursorMs < dayEndMs) pushSlot(slots, cursorMs, dayEndMs, dayEndMs);
  return slots;
}

function pushSlot(slots: FreeSlot[], startMs: number, endMs: number, dayEndMs: number) {
  const minutes = Math.round((endMs - startMs) / 60_000);
  if (minutes < 1) return;
  slots.push({ startMs, endMs, minutes, endsAtMidnight: endMs === dayEndMs });
}
