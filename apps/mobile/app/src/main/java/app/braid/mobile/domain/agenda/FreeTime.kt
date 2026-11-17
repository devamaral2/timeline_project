package app.braid.mobile.domain.agenda

import app.braid.mobile.domain.timeline.shiftDayKey
import app.braid.mobile.domain.timeline.zonedDayStart
import kotlin.math.roundToInt

/** Quando uma tarefa ocupa o relógio; [endMs] nulo é uma tarefa sem hora de fim. */
data class TimeSpan(
    val startMs: Long,
    val endMs: Long?,
)

/** A menor janela que entra na lista: abaixo de 15 minutos não é tempo livre que se planeje. */
const val MIN_FREE_WINDOW_MINUTES = 15

/** Uma lacuna entre tarefas do mesmo dia. Só existe na tela; nada disso é salvo. */
data class FreeSlot(
    val startMs: Long,
    val endMs: Long,
    /** Minutos inteiros da lacuna (sempre 1 ou mais). */
    val minutes: Int,
    /** A lacuna vai até o fim do dia, que se escreve "24:00". */
    val endsAtMidnight: Boolean,
)

private const val MILLIS_PER_MINUTE = 60_000.0

/**
 * Os intervalos livres de um dia (`freeTimeSlots` do web): entre uma tarefa e a seguinte e do fim da última até a
 * meia-noite. Nunca atravessam o dia e não há lacuna antes da primeira tarefa. Tarefas sobrepostas contam como um
 * bloco só (vale o fim mais tardio); uma tarefa sem hora de fim interrompe o cálculo dali em diante.
 */
fun freeTimeSlots(
    spans: List<TimeSpan>,
    dayKey: String,
): List<FreeSlot> {
    val dayEndMs = zonedDayStart(shiftDayKey(dayKey, 1)).toEpochMilli()
    val slots = mutableListOf<FreeSlot>()
    var cursorMs: Long? = null

    for (span in spans.sortedBy { it.startMs }) {
        val cursor = cursorMs
        if (cursor != null && span.startMs > cursor) pushSlot(slots, cursor, minOf(span.startMs, dayEndMs), dayEndMs)
        val end = span.endMs ?: return slots
        cursorMs = maxOf(cursor ?: end, end)
    }

    val last = cursorMs
    if (last != null && last < dayEndMs) pushSlot(slots, last, dayEndMs, dayEndMs)
    return slots
}

private fun pushSlot(
    slots: MutableList<FreeSlot>,
    startMs: Long,
    endMs: Long,
    dayEndMs: Long,
) {
    // `Math.round` do JS arredonda a metade para cima, também nos negativos; aqui a lacuna nunca é negativa.
    val minutes = Math.floor((endMs - startMs) / MILLIS_PER_MINUTE + 0.5).roundToInt()
    if (minutes < 1) return
    slots += FreeSlot(startMs, endMs, minutes, endsAtMidnight = endMs == dayEndMs)
}

/** Quanto a cor de uma janela anda na régua, em porcentagem para a mistura de cores. */
data class FreeWindowGrade(
    val low: Int,
    val high: Int,
)

private const val LOW_RAMP_START_MINUTES = 15.0
private const val LOW_RAMP_SPAN_MINUTES = 105.0
private const val HIGH_RAMP_START_MINUTES = 120.0
private const val HIGH_RAMP_SPAN_MINUTES = 120.0
private const val PERCENT = 100

/**
 * `freeWindowGrade` do web: `low` vai do tom apagado (15 min) ao verde-água (2 h) e `high`, dali ao verde-água claro
 * (4 h ou mais).
 */
fun freeWindowGrade(minutes: Int): FreeWindowGrade {
    fun clamp(value: Double): Int = Math.floor(value.coerceIn(0.0, 1.0) * PERCENT + 0.5).toInt()
    return FreeWindowGrade(
        low = clamp((minutes - LOW_RAMP_START_MINUTES) / LOW_RAMP_SPAN_MINUTES),
        high = clamp((minutes - HIGH_RAMP_START_MINUTES) / HIGH_RAMP_SPAN_MINUTES),
    )
}
