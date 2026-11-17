package app.braid.mobile.domain.reminder

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

/** A notificação do sistema para um lembrete que venceu. */
interface ReminderNotifier {
    suspend fun show(reminder: Reminder)
}

/** As chaves já disparadas e o instante de referência de cada tarefa, para podar; vive no DataStore. */
interface FiredKeysStore {
    suspend fun read(): Map<String, Instant>

    suspend fun write(fired: Map<String, Instant>)
}
