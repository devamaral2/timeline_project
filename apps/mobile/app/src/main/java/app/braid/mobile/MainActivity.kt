package app.braid.mobile

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import app.braid.mobile.core.designsystem.BraidTheme
import app.braid.mobile.data.reminders.ReminderNotification
import app.braid.mobile.data.reminders.ReminderScheduler
import app.braid.mobile.ui.navigation.AppNavHost
import dagger.hilt.android.AndroidEntryPoint

@AndroidEntryPoint
class MainActivity : ComponentActivity() {
    @javax.inject.Inject
    lateinit var reminderScheduler: ReminderScheduler
    private var pendingEventId by mutableStateOf<String?>(null)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        pendingEventId = intent.getStringExtra(ReminderNotification.EVENT_ID_EXTRA)
        enableEdgeToEdge()
        setContent {
            BraidTheme {
                AppNavHost(reminderScheduler, pendingEventId)
            }
        }
    }

    override fun onNewIntent(intent: android.content.Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        pendingEventId = intent.getStringExtra(ReminderNotification.EVENT_ID_EXTRA)
    }
}
