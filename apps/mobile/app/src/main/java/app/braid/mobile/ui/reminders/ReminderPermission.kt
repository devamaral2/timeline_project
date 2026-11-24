package app.braid.mobile.ui.reminders

import android.Manifest
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.annotation.RequiresApi
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.core.app.NotificationManagerCompat
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.LifecycleResumeEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle

/** O que a tela diz ao usuário que negou a permissão. */
const val REMINDER_PERMISSION_EXPLANATION = "Para receber os lembretes das tarefas, ative as notificações do app."

/**
 * Pede a permissão de notificação uma vez, depois que o usuário entrou, e, se ela foi negada, mostra uma faixa no
 * topo que explica o motivo e leva às configurações de notificação do app (o sistema não pergunta de novo).
 */
@Composable
fun ReminderPermissionPrompt(
    modifier: Modifier = Modifier,
    viewModel: ReminderPermissionViewModel = hiltViewModel(),
) {
    val context = LocalContext.current
    val asked by viewModel.asked.collectAsStateWithLifecycle()
    var enabled by remember { mutableStateOf(notificationsEnabled(context)) }
    var dismissed by rememberSaveable { mutableStateOf(false) }
    val launcher =
        rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
            enabled = granted
            viewModel.markAsked()
        }

    // Voltar das configurações com a permissão dada some com a faixa.
    LifecycleResumeEffect(Unit) {
        enabled = notificationsEnabled(context)
        onPauseOrDispose { }
    }
    LaunchedEffect(asked, enabled) {
        if (!enabled && asked == false && Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            launcher.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
    }

    val explain = !enabled && !dismissed && (asked == true || Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU)
    if (explain) {
        PromptBanner(
            text = REMINDER_PERMISSION_EXPLANATION,
            actionLabel = "Ativar",
            onAction = { context.startActivity(notificationSettingsIntent(context)) },
            onDismiss = { dismissed = true },
            modifier = modifier,
        )
    }
}

/** O que a faixa diz a quem ainda não deu a permissão de alarme exato. */
const val EXACT_ALARM_EXPLANATION =
    "Para os lembretes tocarem na hora certa, permita alarmes e lembretes ao app. Sem isso eles podem atrasar um pouco."

/**
 * Convida a dar a permissão de alarme exato (Android 12+, que o sistema não pergunta num diálogo: ela fica numa tela das
 * configurações). Só aparece quando há lembretes guardados e a permissão falta; sem ela os lembretes seguem inexatos.
 */
@Composable
fun ExactAlarmPrompt(
    modifier: Modifier = Modifier,
    viewModel: ExactAlarmViewModel = hiltViewModel(),
) {
    val context = LocalContext.current
    val explain by viewModel.explain.collectAsStateWithLifecycle()

    // Voltar das configurações com a permissão dada some com a faixa.
    LifecycleResumeEffect(Unit) {
        viewModel.refresh()
        onPauseOrDispose { }
    }
    if (explain && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        PromptBanner(
            text = EXACT_ALARM_EXPLANATION,
            actionLabel = "Permitir",
            onAction = { context.startActivity(exactAlarmSettingsIntent(context)) },
            onDismiss = viewModel::dismiss,
            modifier = modifier,
        )
    }
}

/** O que a faixa diz a quem ainda não deixou o app aparecer sobre outros apps. */
const val OVERLAY_EXPLANATION =
    "Para o lembrete abrir em tela cheia também com o celular em uso, permita ao Braid aparecer sobre outros apps."

/**
 * Convida a dar a permissão de aparecer sobre outros apps: sem ela, com o aparelho em uso, o Android só deixa o
 * lembrete mostrar o aviso no topo da tela (apagado ou bloqueado, a tela cheia abre de qualquer jeito).
 */
@Composable
fun OverlayPrompt(modifier: Modifier = Modifier) {
    val context = LocalContext.current
    var allowed by remember { mutableStateOf(Settings.canDrawOverlays(context)) }
    var dismissed by rememberSaveable { mutableStateOf(false) }

    // Voltar das configurações com a permissão dada some com a faixa.
    LifecycleResumeEffect(Unit) {
        allowed = Settings.canDrawOverlays(context)
        onPauseOrDispose { }
    }
    if (!allowed && !dismissed) {
        PromptBanner(
            text = OVERLAY_EXPLANATION,
            actionLabel = "Permitir",
            onAction = { context.startActivity(overlaySettingsIntent(context)) },
            onDismiss = { dismissed = true },
            modifier = modifier,
        )
    }
}

/** As faixas de permissão dos lembretes, uma sobre a outra no topo. */
@Composable
fun ReminderPrompts(modifier: Modifier = Modifier) {
    Column(modifier) {
        ReminderPermissionPrompt()
        ExactAlarmPrompt()
        OverlayPrompt()
    }
}

@Composable
private fun PromptBanner(
    text: String,
    actionLabel: String,
    onAction: () -> Unit,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Surface(
        modifier = modifier.fillMaxWidth().statusBarsPadding().padding(horizontal = 16.dp, vertical = 8.dp),
        shape = MaterialTheme.shapes.medium,
        color = MaterialTheme.colorScheme.surfaceVariant,
        tonalElevation = 2.dp,
    ) {
        Column(Modifier.padding(horizontal = 16.dp, vertical = 12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(text, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurface)
            Row(horizontalArrangement = Arrangement.End, modifier = Modifier.fillMaxWidth()) {
                TextButton(onClick = onDismiss) { Text("Dispensar") }
                TextButton(onClick = onAction) { Text(actionLabel) }
            }
        }
    }
}

private fun notificationsEnabled(context: Context): Boolean = NotificationManagerCompat.from(context).areNotificationsEnabled()

private fun notificationSettingsIntent(context: Context): Intent =
    Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
        .putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)

@RequiresApi(Build.VERSION_CODES.S)
private fun exactAlarmSettingsIntent(context: Context): Intent =
    Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:${context.packageName}"))
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)

private fun overlaySettingsIntent(context: Context): Intent =
    Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:${context.packageName}"))
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
