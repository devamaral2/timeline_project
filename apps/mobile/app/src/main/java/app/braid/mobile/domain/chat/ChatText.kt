package app.braid.mobile.domain.chat

import app.braid.mobile.domain.agenda.FreeWindow
import app.braid.mobile.domain.request.EntityKind
import app.braid.mobile.domain.request.RequestEntity
import app.braid.mobile.domain.request.RequestOperation
import app.braid.mobile.domain.request.agentFailureText
import app.braid.mobile.domain.timeline.briefDate
import app.braid.mobile.domain.timeline.formatTime
import java.time.Instant

/** O texto de falha do chat: o mesmo `ERROR_TEXTS` do web, que o detalhe da tarefa de agente também usa. */
fun chatFailureText(code: ChatFailureCode): String = agentFailureText(code.code)

const val HERMES_DISABLED_TEXT = "O Hermes está desligado neste ambiente (AI_AUTOMATION)."
const val HERMES_ENTER_TEXT = "Agora você está falando com o Hermes. Escreva /app para voltar ao assistente da agenda."
const val HERMES_LEAVE_TEXT = "De volta ao assistente da agenda."
const val HERMES_PENDING_LABEL = "Falando com o Hermes"
const val STEPS_PENDING_LABEL = "Realizando processos"

/** "Tarefa criada", "Nota alterada"…: a linha de um registro que o pedido tocou. Todo documento aparece como "Nota". */
fun chatEntityText(entity: RequestEntity): String {
    val noun = if (entity.kind == EntityKind.Task) "Tarefa" else "Nota"
    val change =
        when (entity.operation) {
            RequestOperation.Create -> "criada"
            RequestOperation.Update -> "alterada"
            RequestOperation.Delete -> "apagada"
        }
    return "$noun $change"
}

/** "10:30": quando a janela livre começa. */
val FreeWindow.start: String get() = formatTime(Instant.ofEpochMilli(startMs))

/** "12:30" (ou "24:00" no fim do dia): quando a janela livre termina. */
val FreeWindow.end: String get() = if (endsAtMidnight) "24:00" else formatTime(Instant.ofEpochMilli(endMs))

/** "2 h 30 min": quanto dura a janela, por extenso, para o pedido. */
fun windowDuration(minutes: Int): String {
    val hours = minutes / MINUTES_PER_HOUR
    val rest = minutes % MINUTES_PER_HOUR
    return listOfNotNull(if (hours > 0) "$hours h" else null, if (rest > 0) "$rest min" else null).joinToString(" ")
}

private const val MINUTES_PER_HOUR = 60

/** O pedido com a janela anexada: o agente só recebe texto, então a janela vai escrita na frente. */
fun requestWithWindow(
    window: FreeWindow,
    text: String,
): String =
    "Sobre a janela livre de ${briefDate(window.dayKey)}, das ${window.start} às ${window.end} " +
        "(${windowDuration(window.minutes)}): ${text.trim()}"
