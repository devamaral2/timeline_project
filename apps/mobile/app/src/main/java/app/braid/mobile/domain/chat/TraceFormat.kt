package app.braid.mobile.domain.chat

import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min

/** Um passo do Hermes na conversa: uma ferramenta que ele usou ou um pensamento, tirado do rastro do pedido. */
data class HermesStep(
    val id: String,
    val kind: TraceKind,
    val label: String,
    /** O que o Hermes mostrou (comando, busca) ou o texto do pensamento. */
    val detail: String?,
    val status: TraceStatus,
)

/**
 * Os passos do Hermes a partir do rastro do pedido (`hermesStepsOf`): pensamentos e ferramentas, na ordem em que
 * aconteceram. O que ainda não começou (`pending`) não entra.
 */
fun hermesStepsOf(entries: List<TraceEntry>): List<HermesStep> =
    entries.mapNotNull { entry ->
        if ((entry.kind != TraceKind.Thought && entry.kind != TraceKind.Tool) || entry.status == TraceStatus.Pending) return@mapNotNull null
        val status = if (entry.status == TraceStatus.Done || entry.status == TraceStatus.Failed) entry.status else TraceStatus.Running
        val text = if (entry.kind == TraceKind.Thought) entry.sections.joinToString("\n\n") { it.text } else null
        HermesStep(entry.id, entry.kind, entry.label, text?.ifEmpty { null } ?: entry.summary?.ifEmpty { null }, status)
    }

private const val MS_PER_SECOND = 1000.0
private const val MS_PER_MINUTE = 60_000.0
private const val SECONDS_PER_MINUTE = 60

/** "850 ms", "1,2 s" ou "1 min 05 s". */
fun traceDuration(ms: Double): String {
    if (ms < MS_PER_SECOND) return "${jsRound(ms)} ms"
    if (ms < MS_PER_MINUTE) return "${jsToFixed1(ms / MS_PER_SECOND).replace('.', ',')} s"
    val seconds = jsRound(ms / MS_PER_SECOND)
    return "${seconds / SECONDS_PER_MINUTE} min ${(seconds % SECONDS_PER_MINUTE).toString().padStart(2, '0')} s"
}

fun traceDuration(ms: Long): String = traceDuration(ms.toDouble())

/** `Math.round` do JS: a metade vai para cima. */
private fun jsRound(value: Double): Long = floor(value + 0.5).toLong()

/** `toFixed(1)` do JS, que arredonda a metade para cima sobre o valor binário exato. */
private fun jsToFixed1(value: Double): String =
    java.math
        .BigDecimal(value)
        .setScale(1, java.math.RoundingMode.HALF_UP)
        .toPlainString()

/** As raias da linha do tempo: a conversa (o que entrou e o que saiu), o modelo e as ferramentas. */
enum class TraceLane(
    val code: String,
    val title: String,
) {
    Talk("talk", "Conversa"),
    Model("model", "Modelo"),
    Tool("tool", "Ferramentas"),
}

private fun laneOf(kind: TraceKind): TraceLane =
    when (kind) {
        TraceKind.Request, TraceKind.Answer -> TraceLane.Talk
        TraceKind.Routing, TraceKind.Thought, TraceKind.Agent, TraceKind.Message -> TraceLane.Model
        TraceKind.Tool -> TraceLane.Tool
    }

/** Onde um passo cai no tempo do pedido, em fração do pedido inteiro. */
data class TimelineBar(
    val entry: TraceEntry,
    val lane: TraceLane,
    val left: Double,
    val width: Double,
)

data class Timeline(
    val bars: List<TimelineBar>,
    val totalMs: Double,
)

/**
 * Onde cada passo cai no tempo do pedido (`timelineBars`). Um passo sem início (ainda na fila) não entra; um passo em curso
 * vai até agora, que é até onde o pedido já andou.
 */
fun timelineBars(
    trace: ChatTrace,
    nowMs: Long,
): Timeline {
    val origin = trace.startedAtMs ?: return Timeline(emptyList(), 0.0)
    val placed =
        trace.entries.mapNotNull { entry ->
            entry.startedAtMs?.let { entry to max(0.0, (it - origin).toDouble()) }
        }
    val known = placed.maxOfOrNull { (entry, start) -> start + (entry.durationMs ?: 0.0) }?.coerceAtLeast(0.0) ?: 0.0
    val elapsed = if (trace.status == TraceRunStatus.Running) (nowMs - origin).toDouble() else 0.0
    val total = max(max(trace.durationMs ?: 0.0, known), elapsed)
    if (total <= 0) return Timeline(emptyList(), 0.0)
    return Timeline(
        placed.map { (entry, start) ->
            val length = entry.durationMs ?: if (entry.status == TraceStatus.Running) total - start else 0.0
            TimelineBar(entry, laneOf(entry.kind), min(1.0, start / total), min(1.0, length / total))
        },
        total,
    )
}
