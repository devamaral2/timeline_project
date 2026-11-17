package app.braid.mobile.ui.shell

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.expandHorizontally
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkHorizontally
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.braid.mobile.core.designsystem.BraidIcons
import app.braid.mobile.core.designsystem.LocalBraidDarkTheme
import app.braid.mobile.core.designsystem.SvgIcon
import app.braid.mobile.core.designsystem.SvgPart
import app.braid.mobile.core.designsystem.braidTokens

/** As três seções do app, na ordem da barra inferior. */
enum class MainTab(
    val label: String,
    val icon: List<SvgPart>,
) {
    Tasks("Tarefas", BraidIcons.tasksNav),
    Agenda("Agenda", BraidIcons.agendaNav),
    Documents("Documentos", BraidIcons.documentsNav),
}

private val DockHeight = 66.dp
private val AgentButtonGap = 10.dp

/**
 * A barra inferior flutua em duas peças: a dock com as três seções e, separado
 * por um respiro de 10dp, o círculo do agente (66dp, a altura da dock). Atrás
 * dela o conteúdo se apaga no chão. O rótulo só aparece na seção atual.
 */
@Composable
fun BraidBottomBar(
    current: MainTab,
    onSelectTab: (MainTab) -> Unit,
    onAgent: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val background = MaterialTheme.colorScheme.background
    Box(modifier.fillMaxWidth()) {
        Box(
            Modifier
                .align(Alignment.BottomCenter)
                .fillMaxWidth()
                .height(140.dp)
                .background(Brush.verticalGradient(0f to Color.Transparent, 0.58f to background, 1f to background)),
        )
        Row(
            Modifier
                .align(Alignment.BottomCenter)
                .fillMaxWidth()
                .navigationBarsPadding()
                .padding(start = 16.dp, end = 16.dp, bottom = 16.dp),
            verticalAlignment = Alignment.Bottom,
        ) {
            Dock(current, onSelectTab, Modifier.weight(1f))
            Spacer(Modifier.width(AgentButtonGap))
            AgentButton(onClick = onAgent)
        }
    }
}

@Composable
private fun Dock(
    current: MainTab,
    onSelectTab: (MainTab) -> Unit,
    modifier: Modifier,
) {
    val scheme = MaterialTheme.colorScheme
    Row(
        modifier =
            modifier
                .height(DockHeight)
                .clip(RoundedCornerShape(33.dp))
                .background(scheme.surface)
                .border(1.dp, scheme.outline, RoundedCornerShape(33.dp))
                .padding(6.dp)
                .semantics { role = Role.Tab },
        horizontalArrangement = Arrangement.spacedBy(4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        for (tab in MainTab.entries) {
            DockTab(tab = tab, selected = tab == current, onClick = { onSelectTab(tab) })
        }
    }
}

@Composable
private fun RowScope.DockTab(
    tab: MainTab,
    selected: Boolean,
    onClick: () -> Unit,
) {
    val scheme = MaterialTheme.colorScheme
    // Com "Todas as tarefas", o modo padrão do web, a pílula da seção atual é o âmbar do modo.
    val pill = braidTokens().modeAll
    val pillInk = if (LocalBraidDarkTheme.current) scheme.surface else scheme.onBackground
    val background by animateColorAsState(if (selected) pill else Color.Transparent, label = "tabPill")
    val ink by animateColorAsState(if (selected) pillInk else scheme.onSurfaceVariant, label = "tabInk")
    val iconScale by animateFloatAsState(if (selected) 1f else 0.9f, label = "tabIconScale")
    val grow by animateFloatAsState(if (selected) 1.8f else 1f, label = "tabGrow")

    Box(
        modifier =
            Modifier
                .weight(grow)
                .height(52.dp)
                .clip(RoundedCornerShape(26.dp))
                .background(background)
                .clickable(role = Role.Tab, onClick = onClick)
                .semantics {
                    contentDescription = tab.label
                    this.selected = selected
                },
        contentAlignment = Alignment.Center,
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            SvgIcon(tab.icon, size = 24.dp, color = ink, strokeWidth = 1.75f, modifier = Modifier.scale(iconScale))
            AnimatedVisibility(
                visible = selected,
                enter = expandHorizontally() + fadeIn(),
                exit = shrinkHorizontally() + fadeOut(),
            ) {
                Text(
                    text = tab.label,
                    modifier = Modifier.padding(start = 8.dp).clearAndSetSemantics {},
                    color = ink,
                    fontSize = 14.sp,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
    }
}
