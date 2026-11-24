package app.braid.mobile.data.reminder

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import app.braid.mobile.domain.reminder.Reminder
import app.braid.mobile.domain.reminder.ReminderSync
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull
import javax.inject.Inject

/** O alarme de um lembrete: mostra a notificação (se ainda vale) e, com o app acordado, relê a fonte para agendar os próximos. */
@AndroidEntryPoint
class ReminderAlarmReceiver : BroadcastReceiver() {
    @Inject lateinit var sync: ReminderSync

    override fun onReceive(
        context: Context,
        intent: Intent,
    ) {
        val reminder = intent.reminderOrNull() ?: return
        val pending = goAsync()
        CoroutineScope(SupervisorJob() + Dispatchers.Default).launch {
            try {
                sync.fire(reminder)
                // Melhor esforço: o `goAsync` dá poucos segundos, e o que não coube espera a próxima releitura.
                withTimeoutOrNull(REFRESH_BUDGET_MS) { sync.refresh() }
            } finally {
                pending.finish()
            }
        }
    }

    companion object {
        private const val ACTION = "app.braid.mobile.REMINDER"
        private const val REFRESH_BUDGET_MS = 8_000L

        /** Leva o lembrete inteiro: o alarme dispara com o app fechado e sem rede, então o que se mostra viaja no intent. */
        fun intentFor(
            context: Context,
            reminder: Reminder,
        ): Intent = identityIntentFor(context, reminder.key).putReminder(reminder)

        /** O intent que identifica o alarme de [key], sem o conteúdo; basta para cancelá-lo. */
        fun identityIntentFor(
            context: Context,
            key: String,
        ): Intent =
            Intent(ACTION).setPackage(context.packageName).setClass(context, ReminderAlarmReceiver::class.java).withReminderIdentity(key)
    }
}
