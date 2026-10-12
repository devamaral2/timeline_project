package app.braid.mobile.ui.agenda

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import app.braid.mobile.core.designsystem.BraidWordmark
import app.braid.mobile.core.designsystem.LocalBraidDarkTheme
import app.braid.mobile.core.designsystem.LucideIcons

/**
 * O cabeçalho do web no celular (`.header`/`.headerInner` de `mockup-shell.tsx`):
 * a assinatura “braid” (só o texto, sem o símbolo) à esquerda e, à direita, o sino de notificações (`notifications`) e o menu da
 * conta, com fio embaixo. O menu da conta traz “Tema escuro/claro” e “Sair da
 * conta”, no lugar do antigo menu lateral.
 */
@Composable
@Suppress("ktlint:standard:function-naming")
fun AgendaHeader(
    onToggleTheme: () -> Unit,
    onSignOut: () -> Unit,
    modifier: Modifier = Modifier,
    notifications: @Composable () -> Unit = { DisabledNotificationsBell() },
    below: @Composable () -> Unit = {},
) {
    val colors = MaterialTheme.colorScheme
    Column(modifier = modifier.fillMaxWidth().background(colors.background).statusBarsPadding()) {
        Row(
            modifier = Modifier.fillMaxWidth().height(64.dp).padding(start = 20.dp, end = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            BraidWordmark(style = MaterialTheme.typography.headlineMedium, showLogo = false)
            Spacer(modifier = Modifier.weight(1f))
            notifications()
            AccountMenu(onToggleTheme = onToggleTheme, onSignOut = onSignOut)
        }
        HorizontalDivider(color = colors.outline)
        below()
    }
}

@Composable
@Suppress("ktlint:standard:function-naming")
private fun DisabledNotificationsBell() {
    IconButton(onClick = {}, enabled = false, modifier = Modifier.size(44.dp)) {
        Icon(
            imageVector = LucideIcons.bell(),
            contentDescription = "Notificações",
            modifier = Modifier.size(21.dp),
            tint = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
@Suppress("ktlint:standard:function-naming")
private fun AccountMenu(
    onToggleTheme: () -> Unit,
    onSignOut: () -> Unit,
) {
    var open by remember { mutableStateOf(false) }
    val dark = LocalBraidDarkTheme.current
    val colors = MaterialTheme.colorScheme
    Box {
        IconButton(onClick = { open = true }, modifier = Modifier.size(44.dp)) {
            Icon(
                imageVector = LucideIcons.circleUserRound(),
                contentDescription = "Minha conta",
                modifier = Modifier.size(21.dp),
                tint = colors.onSurfaceVariant,
            )
        }
        DropdownMenu(
            expanded = open,
            onDismissRequest = { open = false },
            shape = RoundedCornerShape(12.dp),
            containerColor = colors.surface,
            border = BorderStroke(1.dp, colors.outline),
        ) {
            DropdownMenuItem(
                text = { Text(if (dark) "Tema claro" else "Tema escuro") },
                onClick = {
                    open = false
                    onToggleTheme()
                },
            )
            DropdownMenuItem(
                text = { Text("Sair da conta") },
                onClick = {
                    open = false
                    onSignOut()
                },
            )
        }
    }
}

@Composable
@Suppress("ktlint:standard:function-naming")
internal fun AgendaViewOptions(
    infinite: Boolean,
    onSelectMode: (Boolean) -> Unit,
) {
    var open by remember { mutableStateOf(false) }
    Row(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 18.dp, vertical = 12.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text("Agenda", style = MaterialTheme.typography.headlineLarge)
        Box {
            IconButton(onClick = { open = true }) {
                Icon(LucideIcons.slidersHorizontal(), contentDescription = "Opções de visualização")
            }
            DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
                listOf(false to "Lista por dia", true to "Lista infinita").forEach { (mode, label) ->
                    DropdownMenuItem(
                        modifier = Modifier.semantics { selected = infinite == mode },
                        text = { Text(label) },
                        onClick = {
                            open = false
                            onSelectMode(mode)
                        },
                    )
                }
            }
        }
    }
}
