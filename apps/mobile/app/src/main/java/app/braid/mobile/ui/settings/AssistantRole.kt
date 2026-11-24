package app.braid.mobile.ui.settings

import android.app.role.RoleManager
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.os.Build
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.compose.LifecycleResumeEffect

/** O Braid como "App assistente digital" do Android: o gesto do assistente (tecla lateral) abre o chat em vez do Gemini. */
@Stable
class AssistantRole internal constructor(
    held: Boolean,
) {
    /** O Braid já é o assistente padrão do aparelho. */
    var held by mutableStateOf(held)
        internal set

    internal var ask: () -> Unit = {}

    /** Pede o papel ao sistema (a pessoa confirma num diálogo dele); sem esse diálogo, abre as configurações de voz. */
    fun request() = ask()
}

/** Pelo [RoleManager] (Android 10+) o app pede o papel; antes disso, ou se o aparelho não o oferece, abre a tela de voz. */
@Composable
fun rememberAssistantRole(): AssistantRole {
    val context = LocalContext.current
    val role = remember { AssistantRole(isHeld(context)) }
    val launcher =
        rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) { role.held = isHeld(context) }
    SideEffect { role.ask = { requestRole(context) { launcher.launch(it) } } }
    LifecycleResumeEffect(role) {
        // Quem trocou o assistente pelas configurações do sistema volta com o estado novo.
        role.held = isHeld(context)
        onPauseOrDispose {}
    }
    return role
}

private fun roleManager(context: Context): RoleManager? =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) context.getSystemService(RoleManager::class.java) else null

private fun isHeld(context: Context): Boolean =
    Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && roleManager(context)?.isRoleHeld(RoleManager.ROLE_ASSISTANT) == true

private fun requestRole(
    context: Context,
    launch: (Intent) -> Unit,
) {
    val manager = roleManager(context)
    val canAsk =
        Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q &&
            manager != null &&
            manager.isRoleAvailable(RoleManager.ROLE_ASSISTANT) &&
            !manager.isRoleHeld(RoleManager.ROLE_ASSISTANT)
    val intent =
        if (canAsk) {
            manager!!.createRequestRoleIntent(RoleManager.ROLE_ASSISTANT)
        } else {
            Intent(Settings.ACTION_VOICE_INPUT_SETTINGS)
        }
    try {
        launch(intent)
    } catch (_: ActivityNotFoundException) {
        // Aparelho sem a tela: nada a abrir.
    }
}
