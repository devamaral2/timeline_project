package app.braid.mobile.data.reminder

import android.Manifest
import android.app.KeyguardManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.os.PowerManager
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import app.braid.mobile.R
import app.braid.mobile.ReminderAlertActivity
import app.braid.mobile.domain.reminder.Reminder
import app.braid.mobile.domain.reminder.ReminderNotifier
import app.braid.mobile.domain.reminder.offsetLabel
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton

private const val CHANNEL_ID = "reminders"

/**
 * A notificação de um lembrete: título é o nome da tarefa, texto "Tarefa · 30 minutos antes", como no web; tocar abre
 * o detalhe da tarefa. Com o aparelho apagado ou bloqueado ela leva também a tela cheia ([ReminderAlertActivity]).
 */
@Singleton
class AndroidReminderNotifier
    @Inject
    constructor(
        @ApplicationContext private val context: Context,
    ) : ReminderNotifier {
        override suspend fun show(reminder: Reminder) {
            val manager = NotificationManagerCompat.from(context)
            createChannel()
            if (!canPost()) return
            val open =
                PendingIntent.getActivity(
                    context,
                    reminder.key.hashCode(),
                    taskDetailIntent(context, reminder),
                    PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
                )
            val builder =
                NotificationCompat
                    .Builder(context, CHANNEL_ID)
                    .setSmallIcon(R.drawable.ic_stat_reminder)
                    .setContentTitle(reminder.name)
                    .setContentText("Tarefa · ${offsetLabel(reminder.offsetMinutes)}")
                    .setCategory(NotificationCompat.CATEGORY_REMINDER)
                    .setWhen(reminder.triggerAt.toEpochMilli())
                    .setAutoCancel(true)
                    .setContentIntent(open)
            if (screenIsAway()) {
                val alert =
                    PendingIntent.getActivity(
                        context,
                        reminder.key.hashCode(),
                        ReminderAlertActivity.intentFor(context, reminder),
                        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
                    )
                builder.setFullScreenIntent(alert, true)
            }
            val notification = builder.build()
            // A chave é a etiqueta: o mesmo lembrete nunca vira duas notificações.
            try {
                manager.notify(reminder.key, 0, notification)
            } catch (_: SecurityException) {
                // A permissão foi retirada entre a verificação e o envio: sem notificação, sem falha.
            }
        }

        /**
         * Apagado ou bloqueado, o aparelho abre a tela cheia do lembrete no lugar do aviso. Em uso, não: o sistema
         * manteria o aviso preso no topo da tela, e o aviso comum já basta para quem está olhando.
         */
        private fun screenIsAway(): Boolean {
            val interactive = context.getSystemService(PowerManager::class.java)?.isInteractive ?: true
            val locked = context.getSystemService(KeyguardManager::class.java)?.isKeyguardLocked ?: false
            return !interactive || locked
        }

        private fun canPost(): Boolean =
            Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
                ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED

        private fun createChannel() {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
            val channel = NotificationChannel(CHANNEL_ID, "Lembretes", NotificationManager.IMPORTANCE_HIGH)
            channel.description = "Avisos antes do horário das suas tarefas."
            context.getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
        }
    }
