package app.braid.mobile.data.reminder

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringSetPreferencesKey
import app.braid.mobile.data.preferences.safeData
import app.braid.mobile.domain.reminder.Reminder
import app.braid.mobile.domain.reminder.ReminderAlarms
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.first
import javax.inject.Inject
import javax.inject.Singleton

private val SCHEDULED = stringSetPreferencesKey("reminders_scheduled")

/**
 * O `AlarmManager` de verdade: um alarme por lembrete, que acorda o aparelho mesmo em Doze. Exato, ele é um despertador
 * (`setAlarmClock`): o Android não adia esse tipo nem com o uso em segundo plano restrito (a bateria do app em
 * "Restrito", a economia da Samsung e de outros fabricantes), que segurava o alarme comum até o app ser aberto. Em
 * troca, o sistema mostra o relógio na barra de status e o próximo lembrete como "próximo alarme". Sem a permissão de
 * alarme exato, inexato, que o sistema pode adiantar ou atrasar um pouco (a janela de 1 h do cálculo cobre o atraso). As
 * chaves agendadas ficam no DataStore para o app saber o que cancelar depois de ser fechado.
 */
@Singleton
class AndroidReminderAlarms
    @Inject
    constructor(
        @ApplicationContext private val context: Context,
        private val store: DataStore<Preferences>,
    ) : ReminderAlarms {
        private val manager get() = context.getSystemService(AlarmManager::class.java)

        override suspend fun canScheduleExact(): Boolean = Build.VERSION.SDK_INT < Build.VERSION_CODES.S || manager.canScheduleExactAlarms()

        override suspend fun schedule(
            reminder: Reminder,
            exact: Boolean,
        ) {
            val operation =
                PendingIntent.getBroadcast(
                    context,
                    reminder.key.hashCode(),
                    ReminderAlarmReceiver.intentFor(context, reminder),
                    FLAGS,
                )
            val at = reminder.triggerAt.toEpochMilli()
            try {
                if (exact) {
                    manager.setAlarmClock(AlarmManager.AlarmClockInfo(at, showIntentFor(reminder)), operation)
                } else {
                    manager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, operation)
                }
            } catch (_: SecurityException) {
                // A permissão de alarme exato foi retirada entre a pergunta e o agendamento.
                manager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, operation)
            }
            store.edit { it[SCHEDULED] = it[SCHEDULED].orEmpty() + reminder.key }
        }

        /** O toque no "próximo alarme" do sistema (configurações rápidas, tela de bloqueio) abre a tarefa do lembrete. */
        private fun showIntentFor(reminder: Reminder): PendingIntent =
            PendingIntent.getActivity(context, reminder.key.hashCode(), taskDetailIntent(context, reminder), FLAGS)

        override suspend fun cancel(key: String) {
            val existing =
                PendingIntent.getBroadcast(
                    context,
                    key.hashCode(),
                    ReminderAlarmReceiver.identityIntentFor(context, key),
                    FLAGS or PendingIntent.FLAG_NO_CREATE,
                )
            if (existing != null) {
                manager.cancel(existing)
                existing.cancel()
            }
            store.edit { it[SCHEDULED] = it[SCHEDULED].orEmpty() - key }
        }

        override suspend fun scheduledKeys(): Set<String> =
            store
                .safeData()
                .first()[SCHEDULED]
                .orEmpty()

        private companion object {
            const val FLAGS = PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        }
    }

/** O endereço único de um lembrete: faz dois alarmes de chaves diferentes nunca serem o mesmo `PendingIntent`, mesmo com o mesmo código. */
internal fun reminderUri(key: String): Uri = Uri.parse("braid-reminder://alarm/${Uri.encode(key)}")

internal fun Intent.withReminderIdentity(key: String): Intent = setData(reminderUri(key))
