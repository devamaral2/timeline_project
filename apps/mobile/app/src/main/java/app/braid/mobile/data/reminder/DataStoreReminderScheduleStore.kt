package app.braid.mobile.data.reminder

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import app.braid.mobile.core.network.BraidJson
import app.braid.mobile.data.preferences.safeData
import app.braid.mobile.domain.reminder.Reminder
import app.braid.mobile.domain.reminder.ReminderKind
import app.braid.mobile.domain.reminder.ReminderScheduleStore
import kotlinx.coroutines.flow.first
import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.ListSerializer
import java.time.Instant
import javax.inject.Inject
import javax.inject.Singleton

private val SCHEDULE = stringPreferencesKey("reminders_schedule")

@Serializable
private data class StoredReminder(
    val key: String,
    val kind: String,
    val taskId: String,
    val name: String,
    val offsetMinutes: Int,
    val triggerAt: Long,
    val anchor: Long,
)

/** O cronograma dos lembretes no DataStore (`reminders_schedule`), em JSON; um valor ilegível vale cronograma vazio. */
@Singleton
class DataStoreReminderScheduleStore
    @Inject
    constructor(
        private val store: DataStore<Preferences>,
    ) : ReminderScheduleStore {
        private val serializer = ListSerializer(StoredReminder.serializer())

        override suspend fun read(): List<Reminder> {
            val raw = store.safeData().first()[SCHEDULE] ?: return emptyList()
            val stored = runCatching { BraidJson.decodeFromString(serializer, raw) }.getOrDefault(emptyList())
            return stored.map { it.toReminder() }
        }

        override suspend fun write(schedule: List<Reminder>) {
            store.edit { it[SCHEDULE] = BraidJson.encodeToString(serializer, schedule.map(::StoredReminder)) }
        }
    }

private fun StoredReminder(reminder: Reminder) =
    StoredReminder(
        key = reminder.key,
        kind = reminder.kind.name,
        taskId = reminder.taskId,
        name = reminder.name,
        offsetMinutes = reminder.offsetMinutes,
        triggerAt = reminder.triggerAt.toEpochMilli(),
        anchor = reminder.anchor.toEpochMilli(),
    )

private fun StoredReminder.toReminder() =
    Reminder(
        key = key,
        kind = runCatching { ReminderKind.valueOf(kind) }.getOrDefault(ReminderKind.Tracked),
        taskId = taskId,
        name = name,
        offsetMinutes = offsetMinutes,
        triggerAt = Instant.ofEpochMilli(triggerAt),
        anchor = Instant.ofEpochMilli(anchor),
    )
