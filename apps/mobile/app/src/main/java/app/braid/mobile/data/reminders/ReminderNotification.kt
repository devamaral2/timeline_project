package app.braid.mobile.data.reminders

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import app.braid.mobile.MainActivity

object ReminderNotification {
    const val CHANNEL_ID = "reminders"
    const val EVENT_ID_EXTRA = "app.braid.mobile.reminders.EVENT_ID"

    fun ensureChannel(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val channel =
            NotificationChannel(
                CHANNEL_ID,
                "Lembretes",
                NotificationManager.IMPORTANCE_DEFAULT,
            ).apply {
                description = "Avisos dos eventos agendados"
            }
        context.getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
    }

    fun contentIntent(
        context: Context,
        eventId: String,
    ): PendingIntent =
        PendingIntent.getActivity(
            context,
            eventId.hashCode(),
            Intent(context, MainActivity::class.java).apply {
                putExtra(EVENT_ID_EXTRA, eventId)
                addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
            },
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
}
