package app.braid.mobile.ui.settings

import android.app.role.RoleManager
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.os.Build
import android.provider.Settings
import android.widget.Toast
import androidx.compose.runtime.Composable
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
    private val context: Context,
) {
    /** O Braid já é o assistente padrão do aparelho. */
    var held by mutableStateOf(held)
        internal set

    /**
     * Abre a tela do sistema onde se escolhe o assistente digital. O pedido do papel pelo `RoleManager` não serve aqui: o
     * sistema o cancela sem mostrar nada quando recusa o app, e a pessoa fica sem resposta nenhuma.
     */
    fun request() {
        Toast.makeText(context, "Escolha o Braid em \"App assistente digital\"", Toast.LENGTH_LONG).show()
        val screens = listOf(Settings.ACTION_VOICE_INPUT_SETTINGS, Settings.ACTION_MANAGE_DEFAULT_APPS_SETTINGS, Settings.ACTION_SETTINGS)
        for (action in screens) {
            try {
                context.startActivity(Intent(action).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                return
            } catch (_: ActivityNotFoundException) {
                // Aparelho sem essa tela: tenta a próxima.
            }
        }
    }
}

@Composable
fun rememberAssistantRole(): AssistantRole {
    val context = LocalContext.current
    val role = remember { AssistantRole(isHeld(context), context) }
    LifecycleResumeEffect(role) {
        // Quem trocou o assistente pelas configurações do sistema volta com o estado novo.
        role.held = isHeld(context)
        onPauseOrDispose {}
    }
    return role
}

private fun isHeld(context: Context): Boolean =
    Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q &&
        context.getSystemService(RoleManager::class.java)?.isRoleHeld(RoleManager.ROLE_ASSISTANT) == true
