package app.braid.mobile.domain.reminder

import kotlinx.coroutines.flow.Flow
import java.time.Instant

/** O AlarmManager, atrás de uma interface para os testes: um alarme por lembrete, identificado pela chave. */
interface ReminderAlarms {
    /** Falso quando o usuário não deu a permissão de alarme exato (Android 12+). */
    suspend fun canScheduleExact(): Boolean

    /** Agenda (ou reagenda, trocando o que já existe para a chave) o alarme em [Reminder.triggerAt]. */
    suspend fun schedule(
        reminder: Reminder,
        exact: Boolean,
    )

    suspend fun cancel(key: String)

    /** As chaves dos alarmes que o app agendou e ainda não cancelou. */
    suspend fun scheduledKeys(): Set<String>
}

/**
 * A releitura da fonte com o app fechado (o WorkManager, de 15 em 15 min com rede): a tarefa criada ou mudada fora do
 * aparelho (no web, pelo Hermes) ganha o alarme sem o app precisar ser aberto.
 */
interface BackgroundRefresh {
    /** Liga a releitura periódica; ligar de novo não reinicia a contagem. */
    fun start()

    fun stop()
}

/** A notificação do sistema para um lembrete que venceu. */
interface ReminderNotifier {
    suspend fun show(reminder: Reminder)
}

/** As chaves já disparadas e o instante de referência de cada tarefa, para podar; vive no DataStore. */
interface FiredKeysStore {
    suspend fun read(): Map<String, Instant>

    suspend fun write(fired: Map<String, Instant>)
}

/** As chaves dos avisos que o usuário já viu no feed e o instante de referência de cada tarefa, para podar; vive no DataStore. */
interface ReadKeysStore {
    suspend fun read(): Map<String, Instant>

    suspend fun write(read: Map<String, Instant>)
}

/**
 * Os lembretes que a última releitura agendou, guardados no aparelho: o sistema apaga os alarmes ao reiniciar, e sem rede
 * o app ainda sabe o que reagendar. Vive no DataStore.
 */
interface ReminderScheduleStore {
    suspend fun read(): List<Reminder>

    suspend fun write(schedule: List<Reminder>)
}

/** Se o usuário dispensou o aviso que explica a permissão de alarme exato; vive no DataStore. */
interface ExactAlarmPromptRepository {
    /** `true` depois que o usuário dispensou o aviso. */
    val dismissed: Flow<Boolean>

    suspend fun markDismissed()
}

/** Se o app já pediu a permissão de notificação: o sistema só pergunta duas vezes, então o app pergunta uma e depois explica. */
interface NotificationPermissionRepository {
    /** `false` até o app pedir a primeira vez. */
    val asked: Flow<Boolean>

    suspend fun markAsked()
}
