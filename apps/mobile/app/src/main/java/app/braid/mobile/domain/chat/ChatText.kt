package app.braid.mobile.domain.chat

import app.braid.mobile.domain.agenda.FreeWindow
import app.braid.mobile.domain.timeline.briefDate
import app.braid.mobile.domain.timeline.formatTime
import java.time.Instant

/** Os textos de falha do chat (`ERROR_TEXTS` do web). */
fun chatFailureText(code: ChatFailureCode): String =
    when (code) {
        ChatFailureCode.InvalidInput -> "Não consegui ler essa mensagem. Tente escrever de outro jeito."
        ChatFailureCode.Forbidden -> "Você não tem permissão para acessar esses dados."
        ChatFailureCode.LimitReached -> "O pedido ficou grande demais e nada foi gravado. Tente dividir em partes menores."
        ChatFailureCode.Conflict -> "Os dados mudaram enquanto eu preparava a resposta. Nada foi gravado; tente de novo."
        ChatFailureCode.Unavailable -> "A IA está indisponível agora. Tente de novo em instantes."
        ChatFailureCode.Cancelled -> "Pedido cancelado."
        ChatFailureCode.Internal -> "Algo deu errado. Tente de novo."
        ChatFailureCode.ConnectionLost -> "A conexão caiu antes da resposta. Se o pedido gravava algo, confira a agenda antes de reenviar."
        ChatFailureCode.ConnectionFailed -> "Não consegui conectar ao assistente. Tente de novo."
        ChatFailureCode.SessionExpired -> "Sua sessão acabou. Entre de novo para continuar."
    }

const val HERMES_DISABLED_TEXT = "O Hermes está desligado neste ambiente (AI_AUTOMATION)."
const val HERMES_ENTER_TEXT = "Agora você está falando com o Hermes. Escreva /app para voltar ao assistente da agenda."
const val HERMES_LEAVE_TEXT = "De volta ao assistente da agenda."
const val HERMES_PENDING_LABEL = "Falando com o Hermes"
const val STEPS_PENDING_LABEL = "Realizando processos"

/** "Tarefa criada", "Nota alterada"…: a linha de um registro que o pedido tocou. Todo documento aparece como "Nota". */
fun chatEntityText(entity: ChatEntity): String {
    val noun = if (entity.kind == ChatEntityKind.Task) "Tarefa" else "Nota"
    val change =
        when (entity.change) {
            ChatEntityChange.Created -> "criada"
            ChatEntityChange.Updated -> "alterada"
            ChatEntityChange.Deleted -> "apagada"
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
