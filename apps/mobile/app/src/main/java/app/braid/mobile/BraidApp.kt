package app.braid.mobile

import android.app.Application
import app.braid.mobile.domain.reminder.ReminderSync
import app.braid.mobile.domain.session.SessionRepository
import dagger.hilt.android.HiltAndroidApp
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltAndroidApp
class BraidApp : Application() {
    @Inject lateinit var reminders: ReminderSync

    @Inject lateinit var session: SessionRepository

    override fun onCreate() {
        super.onCreate()
        // A sessão pode cair com o app parado (um alarme que releu a fonte e teve o refresh recusado): os alarmes
        // de quem saiu são cancelados enquanto o processo viver, não só com a tela à vista.
        CoroutineScope(SupervisorJob() + Dispatchers.Default).launch { reminders.clearWhenSignedOut(session.state) }
    }
}
