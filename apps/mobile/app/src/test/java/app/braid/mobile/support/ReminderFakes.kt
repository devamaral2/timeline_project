package app.braid.mobile.support

import app.braid.mobile.domain.reminder.FiredKeysStore
import app.braid.mobile.domain.reminder.ReadKeysStore
import app.braid.mobile.domain.reminder.Reminder
import app.braid.mobile.domain.reminder.ReminderAlarms
import app.braid.mobile.domain.reminder.ReminderNotifier
import app.braid.mobile.domain.time.AppClock
import java.time.Duration
import java.time.Instant

/** O relógio dos testes: só anda quando o teste manda. */
class MutableClock(
    var current: Instant,
) : AppClock {
    override fun now(): Instant = current

    fun advance(by: Duration) {
        current = current.plus(by)
    }
}

/** O AlarmManager trocado: guarda o que foi agendado e se foi exato ou inexato. */
class FakeReminderAlarms(
    var exactAllowed: Boolean = true,
) : ReminderAlarms {
    data class Scheduled(
        val reminder: Reminder,
        val exact: Boolean,
    )

    val scheduled = linkedMapOf<String, Scheduled>()
    val cancelled = mutableListOf<String>()

    override suspend fun canScheduleExact() = exactAllowed

    override suspend fun schedule(
        reminder: Reminder,
        exact: Boolean,
    ) {
        scheduled[reminder.key] = Scheduled(reminder, exact)
    }

    override suspend fun cancel(key: String) {
        scheduled.remove(key)
        cancelled += key
    }

    override suspend fun scheduledKeys(): Set<String> = scheduled.keys.toSet()
}

class FakeReminderNotifier : ReminderNotifier {
    val shown = mutableListOf<Reminder>()

    override suspend fun show(reminder: Reminder) {
        shown += reminder
    }
}

/** As chaves disparadas na memória; "fechar o app" é reabrir a mesma instância. */
class InMemoryFiredKeys : FiredKeysStore {
    var stored: Map<String, Instant> = emptyMap()

    override suspend fun read(): Map<String, Instant> = stored

    override suspend fun write(fired: Map<String, Instant>) {
        stored = fired
    }
}

/** As chaves lidas do feed na memória; "fechar o app" é criar outro ViewModel sobre a mesma instância. */
class InMemoryReadKeys(
    var stored: Map<String, Instant> = emptyMap(),
) : ReadKeysStore {
    override suspend fun read(): Map<String, Instant> = stored

    override suspend fun write(read: Map<String, Instant>) {
        stored = read
    }
}
