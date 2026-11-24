package app.braid.mobile.data.reminder

import android.Manifest
import android.app.ActivityManager
import android.app.KeyguardManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.pm.PackageManager
import android.media.AudioAttributes
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.core.net.toUri
import app.braid.mobile.R
import app.braid.mobile.ReminderAlertActivity
import app.braid.mobile.domain.reminder.Reminder
import app.braid.mobile.domain.reminder.ReminderNotifier
import app.braid.mobile.domain.reminder.offsetLabel
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton

private const val CHANNEL_ID = "reminders_chime"
private const val LEGACY_CHANNEL_ID = "reminders"

/**
 * A notificação de um lembrete: título é o nome da tarefa, texto "Tarefa · 30 minutos antes", como no web; tocar abre
 * o detalhe da tarefa. Ela toca o som do Braid e sempre vem com a tela cheia ([ReminderAlertActivity]).
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
            val alertIntent = ReminderAlertActivity.intentFor(context, reminder)
            // Em uso e podendo abrir por conta própria, o app abre a tela cheia direto; nos outros casos quem a abre
            // é o sistema, pelo `fullScreenIntent` (com o aparelho apagado ou bloqueado ele acende a tela).
            val opensDirectly = !screenIsAway() && canOpenOverOtherApps()
            if (!opensDirectly) {
                val alert =
                    PendingIntent.getActivity(
                        context,
                        reminder.key.hashCode(),
                        alertIntent,
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
            if (opensDirectly) runCatching { context.startActivity(alertIntent) }
        }

        private fun screenIsAway(): Boolean {
            val interactive = context.getSystemService(PowerManager::class.java)?.isInteractive ?: true
            val locked = context.getSystemService(KeyguardManager::class.java)?.isKeyguardLocked ?: false
            return !interactive || locked
        }

        /**
         * O Android só deixa um app abrir uma tela sem ser chamado se ele já está à vista ou se o usuário permitiu
         * "aparecer sobre outros apps". Sem nenhum dos dois, resta o aviso do sistema no topo da tela.
         */
        private fun canOpenOverOtherApps(): Boolean {
            if (Settings.canDrawOverlays(context)) return true
            val state = ActivityManager.RunningAppProcessInfo()
            ActivityManager.getMyMemoryState(state)
            return state.importance == ActivityManager.RunningAppProcessInfo.IMPORTANCE_FOREGROUND
        }

        private fun canPost(): Boolean =
            Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
                ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED

        /**
         * O canal leva o som do Braid. O som de um canal não muda depois de criado, então o canal tem id novo e o
         * antigo (`reminders`, com o som padrão do sistema) é apagado.
         */
        private fun createChannel() {
            val system = context.getSystemService(NotificationManager::class.java)
            system.deleteNotificationChannel(LEGACY_CHANNEL_ID)
            val channel = NotificationChannel(CHANNEL_ID, "Lembretes", NotificationManager.IMPORTANCE_HIGH)
            channel.description = "Avisos antes do horário das suas tarefas."
            channel.setSound(
                "android.resource://${context.packageName}/${R.raw.reminder_chime}".toUri(),
                AudioAttributes
                    .Builder()
                    .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build(),
            )
            channel.enableVibration(true)
            channel.lockscreenVisibility = Notification.VISIBILITY_PUBLIC
            system.createNotificationChannel(channel)
        }
    }
