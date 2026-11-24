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
private const val WAKE_TAG = "braid:reminder"
private const val WAKE_MILLIS = 10_000L

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
            // Dois caminhos até a tela cheia. O do sistema é o `fullScreenIntent`: com o aparelho apagado ou bloqueado
            // ele acende a tela e abre a tela cheia. O do app é abrir por conta própria, que o Android só deixa a quem
            // está à vista ou pode aparecer sobre outros apps. Apagado ou bloqueado vão os dois: há aparelho que não
            // segue o do sistema (permissão negada, Não Perturbe, regra do fabricante), e a tela cheia é uma só.
            val away = screenIsAway()
            val opensDirectly = canOpenOverOtherApps()
            if (away || !opensDirectly) {
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
            if (!isInteractive()) wakeScreen()
            // A chave é a etiqueta: o mesmo lembrete nunca vira duas notificações.
            try {
                manager.notify(reminder.key, 0, notification)
            } catch (_: SecurityException) {
                // A permissão foi retirada entre a verificação e o envio: sem notificação, sem falha.
            }
            if (opensDirectly) runCatching { context.startActivity(alertIntent) }
        }

        private fun isInteractive(): Boolean = context.getSystemService(PowerManager::class.java)?.isInteractive ?: true

        /**
         * Acende a tela por conta do app, por alguns segundos: mesmo que nada abra a tela cheia, o lembrete aparece
         * com a tela acesa. Onde o sistema não deixa, a chamada não tem efeito.
         */
        private fun wakeScreen() {
            val power = context.getSystemService(PowerManager::class.java) ?: return
            runCatching {
                @Suppress("DEPRECATION")
                power
                    .newWakeLock(PowerManager.SCREEN_BRIGHT_WAKE_LOCK or PowerManager.ACQUIRE_CAUSES_WAKEUP, WAKE_TAG)
                    .acquire(WAKE_MILLIS)
            }
        }

        private fun screenIsAway(): Boolean {
            val locked = context.getSystemService(KeyguardManager::class.java)?.isKeyguardLocked ?: false
            return !isInteractive() || locked
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
