package app.braid.mobile.data.reminder

import android.app.AlarmManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import app.braid.mobile.domain.reminder.ReminderSync
import app.braid.mobile.domain.session.SessionRepository
import app.braid.mobile.domain.session.SessionState
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull
import javax.inject.Inject

/**
 * Reagenda os alarmes quando o celular reinicia (o sistema os apaga), quando o app é atualizado e quando o usuário
 * concede ou retira a permissão de alarme exato.
 */
@AndroidEntryPoint
class ReminderBootReceiver : BroadcastReceiver() {
    @Inject lateinit var sync: ReminderSync

    @Inject lateinit var session: SessionRepository

    override fun onReceive(
        context: Context,
        intent: Intent,
    ) {
        if (intent.action !in HANDLED) return
        val pending = goAsync()
        CoroutineScope(SupervisorJob() + Dispatchers.Default).launch {
            try {
                // Primeiro o que está guardado (sem rede, e lê a sessão guardada), depois, se der tempo, a releitura da fonte.
                sync.rescheduleFromSaved()
                if (session.state.value is SessionState.SignedIn) withTimeoutOrNull(BUDGET_MS) { sync.refresh() }
            } finally {
                pending.finish()
            }
        }
    }

    private companion object {
        const val BUDGET_MS = 20_000L
        val HANDLED =
            setOf(
                Intent.ACTION_BOOT_COMPLETED,
                Intent.ACTION_MY_PACKAGE_REPLACED,
                AlarmManager.ACTION_SCHEDULE_EXACT_ALARM_PERMISSION_STATE_CHANGED,
            )
    }
}
