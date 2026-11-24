package app.braid.mobile

import android.app.KeyguardManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.graphics.Color
import android.os.Build
import android.os.Bundle
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.braid.mobile.core.designsystem.BraidTheme
import app.braid.mobile.data.reminder.putReminder
import app.braid.mobile.data.reminder.reminderOrNull
import app.braid.mobile.data.reminder.reminderUri
import app.braid.mobile.data.reminder.taskDetailIntent
import app.braid.mobile.domain.reminder.Reminder
import app.braid.mobile.domain.settings.ThemeRepository
import app.braid.mobile.domain.settings.isDark
import app.braid.mobile.domain.time.AppClock
import app.braid.mobile.ui.reminders.ReminderAlertScreen
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import javax.inject.Inject

/**
 * A tela cheia do lembrete: o sistema a abre no lugar da notificação quando o aparelho está apagado ou bloqueado
 * (o `fullScreenIntent` de `AndroidReminderNotifier`). Ela acende a tela e fica por cima do bloqueio; quando a tela
 * apaga de novo ela se fecha, e a notificação continua na gaveta.
 */
@AndroidEntryPoint
class ReminderAlertActivity : ComponentActivity() {
    @Inject lateinit var clock: AppClock

    @Inject lateinit var themes: ThemeRepository

    private var reminder by mutableStateOf<Reminder?>(null)

    private var screenOffRegistered = false

    /** A tela apagou: quem acender o aparelho horas depois vê o bloqueio de sempre, não um lembrete velho. */
    private val screenOff =
        object : BroadcastReceiver() {
            override fun onReceive(
                context: Context,
                intent: Intent,
            ) {
                finish()
            }
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val first = intent.reminderOrNull()
        if (first == null) {
            finish()
            return
        }
        reminder = first
        showOverLockScreen()
        ContextCompat.registerReceiver(this, screenOff, IntentFilter(Intent.ACTION_SCREEN_OFF), ContextCompat.RECEIVER_NOT_EXPORTED)
        screenOffRegistered = true

        // Lida antes do primeiro quadro, como na MainActivity: quem escolheu um tema não vê o do sistema piscar.
        val savedTheme = runBlocking { themes.choice.first() }
        setContent {
            val choice by themes.choice.collectAsStateWithLifecycle(initialValue = savedTheme)
            val dark = choice.isDark(isSystemInDarkTheme())
            DisposableEffect(dark) {
                // A barra de status fica sobre o campo colorido, que é claro no tema escuro e fechado no claro.
                enableEdgeToEdge(
                    statusBarStyle =
                        if (dark) SystemBarStyle.light(Color.TRANSPARENT, Color.TRANSPARENT) else SystemBarStyle.dark(Color.TRANSPARENT),
                    navigationBarStyle = SystemBarStyle.auto(Color.TRANSPARENT, Color.TRANSPARENT) { dark },
                )
                onDispose {}
            }
            BraidTheme(darkTheme = dark) {
                reminder?.let { shown ->
                    ReminderAlertScreen(
                        reminder = shown,
                        clock = clock,
                        onDismiss = { dismiss(shown) },
                        onOpenTask = { openTask(shown) },
                    )
                }
            }
        }
    }

    /** Outro lembrete venceu com a tela ainda acesa: ela passa a mostrar o mais novo. */
    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        intent.reminderOrNull()?.let { reminder = it }
    }

    override fun onDestroy() {
        if (screenOffRegistered) unregisterReceiver(screenOff)
        super.onDestroy()
    }

    private fun showOverLockScreen() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
        } else {
            @Suppress("DEPRECATION")
            window.addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON)
        }
    }

    private fun dismiss(shown: Reminder) {
        clearNotification(shown)
        finish()
    }

    /** O detalhe da tarefa fica atrás do bloqueio: o sistema pede o desbloqueio e só então o app abre. */
    private fun openTask(shown: Reminder) {
        val keyguard = getSystemService(KeyguardManager::class.java)
        if (keyguard == null || !keyguard.isKeyguardLocked) {
            openTaskNow(shown)
            return
        }
        keyguard.requestDismissKeyguard(
            this,
            object : KeyguardManager.KeyguardDismissCallback() {
                override fun onDismissSucceeded() = openTaskNow(shown)
            },
        )
    }

    private fun openTaskNow(shown: Reminder) {
        clearNotification(shown)
        startActivity(taskDetailIntent(this, shown))
        finish()
    }

    /** A mesma etiqueta e o mesmo id com que `AndroidReminderNotifier` a publicou. */
    private fun clearNotification(shown: Reminder) = NotificationManagerCompat.from(this).cancel(shown.key, 0)

    companion object {
        /** O intent da tela cheia de [reminder]; o lembrete inteiro viaja nele, porque ela abre sem rede e sem o app. */
        fun intentFor(
            context: Context,
            reminder: Reminder,
        ): Intent =
            Intent(context, ReminderAlertActivity::class.java)
                .setData(reminderUri(reminder.key))
                .putReminder(reminder)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_NO_USER_ACTION)
    }
}
