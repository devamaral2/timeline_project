package app.braid.mobile

import android.graphics.Color
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.braid.mobile.core.designsystem.BraidTheme
import app.braid.mobile.data.preferences.ThemeChoice
import app.braid.mobile.data.reminders.ReminderNotification
import app.braid.mobile.data.reminders.ReminderScheduler
import app.braid.mobile.ui.navigation.AppNavHost
import app.braid.mobile.ui.theme.ThemeViewModel
import dagger.hilt.android.AndroidEntryPoint

@AndroidEntryPoint
class MainActivity : ComponentActivity() {
    @javax.inject.Inject
    lateinit var reminderScheduler: ReminderScheduler
    private var pendingEventId by mutableStateOf<String?>(null)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        pendingEventId = intent.getStringExtra(ReminderNotification.EVENT_ID_EXTRA)
        setContent {
            val themeViewModel = hiltViewModel<ThemeViewModel>()
            val choice by themeViewModel.choice.collectAsStateWithLifecycle()
            val darkTheme =
                when (choice) {
                    ThemeChoice.Dark -> true
                    ThemeChoice.Light -> false
                    null -> isSystemInDarkTheme()
                }
            // As barras do sistema acompanham o tema do app, não só o do sistema.
            DisposableEffect(darkTheme) {
                enableEdgeToEdge(
                    statusBarStyle = SystemBarStyle.auto(Color.TRANSPARENT, Color.TRANSPARENT) { darkTheme },
                    navigationBarStyle = SystemBarStyle.auto(LIGHT_SCRIM, DARK_SCRIM) { darkTheme },
                )
                onDispose {}
            }
            BraidTheme(darkTheme = darkTheme) {
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

private val LIGHT_SCRIM = Color.argb(0xe6, 0xff, 0xff, 0xff)
private val DARK_SCRIM = Color.argb(0x80, 0x1b, 0x1b, 0x1b)
