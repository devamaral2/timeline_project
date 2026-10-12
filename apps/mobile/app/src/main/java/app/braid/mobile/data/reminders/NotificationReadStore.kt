package app.braid.mobile.data.reminders

import android.content.Context
import dagger.hilt.android.qualifiers.ApplicationContext
import java.time.Instant
import javax.inject.Inject
import javax.inject.Singleton

/**
 * As notificações que a pessoa já viu no sino. Cada entrada guarda a chave e o
 * início do item (`<epochMs>|<chave>`), para podar o que passou de 2 dias.
 */
@Singleton
class NotificationReadStore
    @Inject
    constructor(
        @ApplicationContext context: Context,
    ) {
        private val preferences = context.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)

        fun keys(now: Instant = Instant.now()): Set<String> = entries(now).map { it.substringAfter('|') }.toSet()

        fun markRead(
            items: List<NotificationFeedItem>,
            now: Instant = Instant.now(),
        ) {
            val next = entries(now) + items.map { "${it.startedAt.toEpochMilli()}|${it.key}" }
            preferences.edit().putStringSet(READ_ENTRIES, next).apply()
        }

        private fun entries(now: Instant): Set<String> {
            val cutoff = now.minus(NOTIFICATION_FEED_HISTORY.multipliedBy(2)).toEpochMilli()
            return preferences
                .getStringSet(READ_ENTRIES, emptySet())
                .orEmpty()
                .filter { (it.substringBefore('|').toLongOrNull() ?: 0L) >= cutoff }
                .toSet()
        }

        private companion object {
            const val PREFERENCES_NAME = "notification_read"
            const val READ_ENTRIES = "read_entries"
        }
    }
