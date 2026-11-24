package app.braid.mobile.ui.settings

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.braid.mobile.core.designsystem.BraidIcons
import app.braid.mobile.core.designsystem.LocalBraidDarkTheme
import app.braid.mobile.core.designsystem.SvgIcon
import app.braid.mobile.core.designsystem.SvgPart

/** Quanto a barra inferior (dock de 66dp com o respiro de baixo) ocupa: a tela termina logo acima dela, como o chat. */
private val DockReserve = 90.dp

/**
 * "Configurações", aberta pelo `/configuracoes` do chat: o interruptor de tema (claro/escuro), o assistente do celular e o "Sair da conta".
 * [onBack] volta ao chat; ao sair, a sessão perdida leva ao login pela navegação.
 */
@Composable
fun SettingsScreen(
    viewModel: SettingsViewModel,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    // A tela mostra o que o tema ativo é: o escolhido, ou o do sistema enquanto não há escolha.
    val dark = LocalBraidDarkTheme.current
    val assistant = rememberAssistantRole()
    SettingsContent(
        dark = dark,
        assistantHeld = assistant.held,
        onAssistant = assistant::request,
        signedIn = state.signedIn,
        signingOut = state.signingOut,
        onBack = onBack,
        onToggleTheme = { viewModel.toggleTheme(currentlyDark = dark) },
        onSignOut = viewModel::signOut,
        modifier = modifier,
    )
}

@Composable
fun SettingsContent(
    dark: Boolean,
    assistantHeld: Boolean,
    onAssistant: () -> Unit,
    signedIn: Boolean,
    signingOut: Boolean,
    onBack: () -> Unit,
    onToggleTheme: () -> Unit,
    onSignOut: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val scheme = MaterialTheme.colorScheme
    val density = LocalDensity.current
    val bottom = DockReserve + with(density) { WindowInsets.navigationBars.getBottom(density).toDp() }
    Column(
        modifier
            .fillMaxSize()
            .background(scheme.background)
            .pointerInput(Unit) { detectTapGestures { } }
            .windowInsetsPadding(WindowInsets.statusBars)
            .padding(start = 16.dp, end = 16.dp, bottom = bottom)
            .semantics { contentDescription = "Configurações" },
    ) {
        Box(
            Modifier
                .padding(top = 8.dp)
                .size(44.dp)
                .clickable(role = Role.Button, onClick = onBack)
                .semantics { contentDescription = "Voltar para o chat" },
            contentAlignment = Alignment.Center,
        ) {
            SvgIcon(BraidIcons.arrowLeft, size = 22.dp, color = scheme.onBackground, modifier = Modifier.clearAndSetSemantics {})
        }
        Text(
            text = "Configurações",
            modifier = Modifier.padding(start = 8.dp, top = 12.dp, bottom = 12.dp),
            color = scheme.onBackground,
            fontSize = 15.sp,
            lineHeight = 20.sp,
            fontWeight = FontWeight.SemiBold,
        )
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            SettingsRow(
                icon = if (dark) SettingsIcons.sun else SettingsIcons.moon,
                label = if (dark) "Tema claro" else "Tema escuro",
                enabled = true,
                onClick = onToggleTheme,
            )
            SettingsRow(
                icon = SettingsIcons.mic,
                label = if (assistantHeld) "Assistente do celular: Braid" else "Usar como assistente do celular",
                enabled = true,
                onClick = onAssistant,
            )
            if (signedIn) {
                SettingsRow(icon = SettingsIcons.logOut, label = "Sair da conta", enabled = !signingOut, onClick = onSignOut)
            }
        }
    }
}

@Composable
private fun SettingsRow(
    icon: List<SvgPart>,
    label: String,
    enabled: Boolean,
    onClick: () -> Unit,
) {
    val scheme = MaterialTheme.colorScheme
    val shape = RoundedCornerShape(14.dp)
    Row(
        Modifier
            .fillMaxWidth()
            .heightIn(min = 48.dp)
            .alpha(if (enabled) 1f else 0.5f)
            .border(1.dp, scheme.outline, shape)
            .clickable(enabled = enabled, role = Role.Button, onClick = onClick)
            .padding(horizontal = 12.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        SvgIcon(icon, size = 18.dp, color = scheme.onSurfaceVariant, modifier = Modifier.clearAndSetSemantics {})
        Text(text = label, color = scheme.onBackground, fontSize = 15.sp, lineHeight = 20.sp)
    }
}
