package app.braid.mobile

import android.content.Intent
import android.graphics.Color
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import app.braid.mobile.core.designsystem.BraidTheme
import app.braid.mobile.domain.reminder.ReminderSync
import app.braid.mobile.domain.session.SessionRepository
import app.braid.mobile.domain.task.TaskChanges
import app.braid.mobile.ui.navigation.AppNavHost
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.launch
import javax.inject.Inject

@AndroidEntryPoint
class MainActivity : ComponentActivity() {
    @Inject lateinit var reminders: ReminderSync

    @Inject lateinit var session: SessionRepository

    @Inject lateinit var taskChanges: TaskChanges

    /** A tarefa que a notificação tocada quer abrir, até a navegação consumi-la. */
    private var requestedTask by mutableStateOf<String?>(null)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        requestedTask = intent.requestedTaskId()
        enableEdgeToEdge(
            statusBarStyle = SystemBarStyle.auto(Color.TRANSPARENT, Color.TRANSPARENT),
            navigationBarStyle = SystemBarStyle.auto(Color.TRANSPARENT, Color.TRANSPARENT),
        )
        // Com o app aberto a fonte dos lembretes é relida ao abrir, a cada 5 min e a cada mudança de tarefa.
        lifecycleScope.launch {
            repeatOnLifecycle(Lifecycle.State.STARTED) { reminders.runWhileSignedIn(session.state, taskChanges.signals) }
        }
        setContent {
            BraidTheme(darkTheme = isSystemInDarkTheme()) {
                AppNavHost(openTaskId = requestedTask, onOpenTaskHandled = { requestedTask = null })
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        intent.requestedTaskId()?.let { requestedTask = it }
    }

    private fun Intent.requestedTaskId(): String? = getStringExtra(EXTRA_TASK_ID)

    companion object {
        /** O extra que a notificação do lembrete leva: o id da tarefa cujo detalhe abrir. */
        const val EXTRA_TASK_ID = "app.braid.mobile.TASK_ID"
    }
}
