package app.braid.mobile.data.reminders

import android.Manifest
import android.app.AlarmManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import dagger.hilt.android.qualifiers.ApplicationContext
import java.time.Instant
import javax.inject.Inject
import javax.inject.Singleton

data class ReminderEventSource(
    val id: String,
    val name: String,
    val startedAt: Instant,
    val notifyOffsetsMinutes: List<Double>,
)

data class ReminderTrigger(
    val key: String,
    val eventId: String,
    val eventName: String,
    val offsetMinutes: Double,
    val triggerAt: Instant,
)

data class ReminderScheduleResult(
    val scheduledCount: Int,
    val usedInexactFallback: Boolean,
)

fun reminderTriggersFor(
    events: List<ReminderEventSource>,
    now: Instant,
): List<ReminderTrigger> =
    events
        .flatMap { event ->
            event.notifyOffsetsMinutes.mapNotNull { offsetMinutes ->
                val triggerAt = event.startedAt.minusMillis((offsetMinutes * 60_000).toLong())
                if (!triggerAt.isAfter(now)) return@mapNotNull null
                ReminderTrigger(
                    key = "${event.id}:$offsetMinutes",
                    eventId = event.id,
                    eventName = event.name,
                    offsetMinutes = offsetMinutes,
                    triggerAt = triggerAt,
                )
            }
        }.sortedBy(ReminderTrigger::triggerAt)

@Singleton
class ReminderScheduler
    @Inject
    constructor(
        @ApplicationContext private val context: Context,
    ) {
        private val alarmManager = context.getSystemService(AlarmManager::class.java)
        private val preferences = context.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)

        fun schedule(
            events: List<ReminderEventSource>,
            now: Instant = Instant.now(),
        ): ReminderScheduleResult {
            events.forEach { cancel(it.id) }
            val triggers = reminderTriggersFor(events, now)
            val exact = canScheduleExactAlarms()
            triggers.forEach { trigger -> schedule(trigger, exact) }
            return ReminderScheduleResult(
                scheduledCount = triggers.size,
                usedInexactFallback = triggers.isNotEmpty() && !exact,
            )
        }

        /** Sincronização completa usada depois de um reboot, sem deixar alarmes órfãos. */
        fun reschedule(
            events: List<ReminderEventSource>,
            now: Instant = Instant.now(),
        ): ReminderScheduleResult {
            cancelAll()
            return schedule(events, now)
        }

        fun cancel(eventId: String) {
            val keys = scheduledKeys().filter { it.startsWith("$eventId:") }
            keys.forEach(::cancelKey)
        }

        fun cancelAll() {
            scheduledKeys().toList().forEach(::cancelKey)
        }

        fun canScheduleExactAlarms(): Boolean = Build.VERSION.SDK_INT < Build.VERSION_CODES.S || alarmManager.canScheduleExactAlarms()

        private fun schedule(
            trigger: ReminderTrigger,
            exact: Boolean,
        ) {
            val pendingIntent = pendingIntentFor(trigger)
            val triggerAtMillis = trigger.triggerAt.toEpochMilli()
            if (exact) {
                alarmManager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAtMillis, pendingIntent)
            } else {
                alarmManager.setWindow(
                    AlarmManager.RTC_WAKEUP,
                    triggerAtMillis,
                    INEXACT_WINDOW_MILLIS,
                    pendingIntent,
                )
            }
            preferences.edit().putStringSet(SCHEDULED_KEYS, scheduledKeys() + trigger.key).apply()
        }

        private fun cancelKey(key: String) {
            val pendingIntent =
                PendingIntent.getBroadcast(
                    context,
                    requestCodeFor(key),
                    Intent(context, ReminderAlarmReceiver::class.java),
                    PendingIntent.FLAG_NO_CREATE or PendingIntent.FLAG_IMMUTABLE,
                )
            if (pendingIntent != null) alarmManager.cancel(pendingIntent)
            preferences.edit().putStringSet(SCHEDULED_KEYS, scheduledKeys() - key).apply()
        }

        private fun pendingIntentFor(trigger: ReminderTrigger): PendingIntent =
            PendingIntent.getBroadcast(
                context,
                requestCodeFor(trigger.key),
                Intent(context, ReminderAlarmReceiver::class.java).apply {
                    putExtra(EXTRA_EVENT_ID, trigger.eventId)
                    putExtra(EXTRA_EVENT_NAME, trigger.eventName)
                    putExtra(EXTRA_OFFSET_MINUTES, trigger.offsetMinutes)
                },
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )

        private fun scheduledKeys(): Set<String> = preferences.getStringSet(SCHEDULED_KEYS, emptySet()).orEmpty()

        private fun requestCodeFor(key: String): Int = key.hashCode()

        private companion object {
            const val EXTRA_EVENT_ID = "app.braid.mobile.reminders.EVENT_ID"
            const val EXTRA_EVENT_NAME = "app.braid.mobile.reminders.EVENT_NAME"
            const val EXTRA_OFFSET_MINUTES = "app.braid.mobile.reminders.OFFSET_MINUTES"
            const val INEXACT_WINDOW_MILLIS = 5 * 60 * 1000L
            const val PREFERENCES_NAME = "reminders"
            const val SCHEDULED_KEYS = "scheduled_keys"
        }
    }

class ReminderAlarmReceiver : BroadcastReceiver() {
    override fun onReceive(
        context: Context,
        intent: Intent,
    ) {
        if (
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) !=
            PackageManager.PERMISSION_GRANTED
        ) {
            return
        }
        val eventName = intent.getStringExtra("app.braid.mobile.reminders.EVENT_NAME") ?: "Evento"
        val eventId = intent.getStringExtra(ReminderNotification.EVENT_ID_EXTRA) ?: return
        ReminderNotification.ensureChannel(context)
        val notification =
            NotificationCompat
                .Builder(context, ReminderNotification.CHANNEL_ID)
                .setSmallIcon(android.R.drawable.ic_dialog_info)
                .setContentTitle("Lembrete")
                .setContentText(eventName)
                .setAutoCancel(true)
                .setContentIntent(ReminderNotification.contentIntent(context, eventId))
                .setPriority(NotificationCompat.PRIORITY_DEFAULT)
                .build()
        NotificationManagerCompat.from(context).notify(eventId.hashCode(), notification)
    }
}
