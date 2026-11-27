package app.braid.mobile.ui.shell

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.expandHorizontally
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkHorizontally
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
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
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.braid.mobile.core.designsystem.BraidIcons
import app.braid.mobile.core.designsystem.LocalBraidDarkTheme
import app.braid.mobile.core.designsystem.SvgIcon
import app.braid.mobile.core.designsystem.SvgPart
import app.braid.mobile.core.designsystem.braidTokens
import app.braid.mobile.domain.executor.ViewMode
import app.braid.mobile.ui.chat.BotState

/** As três seções do app, na ordem da barra inferior. */
enum class MainTab(
    val label: String,
    val icon: List<SvgPart>,
) {
    Tasks("Tarefas", BraidIcons.tasksNav),
    Agenda("Agenda", BraidIcons.agendaNav),
    Documents("Artefatos", BraidIcons.documentsNav),
}

private val DockHeight = 58.dp
private val AgentButtonGap = 10.dp
private val AgentButtonSize = 58.dp

/**
 * A barra inferior flutua em duas peças: a dock com as três seções e, separado
 * por um respiro de 10dp, o círculo do agente (58dp, a altura da dock). Atrás
 * dela o conteúdo se apaga no chão. O rótulo só aparece na seção atual.
 *
 * Tocar de novo na aba atual abre o menu da seção: a dock cresce para cima, passa por
 * baixo do círculo do agente (que perde o aro) e mostra [menu] acima das abas. [mode]
 * pinta a pílula da aba atual e [filtered] acende o ponto nela.
 */
@Composable
fun BraidBottomBar(
    current: MainTab,
    mode: ViewMode,
    menuOpen: Boolean,
    filtered: Boolean,
    onSelectTab: (MainTab) -> Unit,
    onAgent: () -> Unit,
    modifier: Modifier = Modifier,
    /** O estado do robô do botão do agente, que acompanha o chat mesmo fechado. */
    bot: BotState = BotState.Idle,
    /** Com o chat aberto nenhuma seção é preenchida (a atual fica só contornada) e o botão do agente vira X. */
    chatOpen: Boolean = false,
    menu: @Composable () -> Unit = {},
) {
    val background = MaterialTheme.colorScheme.background
    // Aberto o menu, a dock ocupa a largura toda e as abas ficam no mesmo lugar, ao lado do círculo do agente.
    val reserved = AgentButtonSize + AgentButtonGap
    val dockEnd by animateDpAsState(if (menuOpen) 0.dp else reserved, label = "dockEnd")
    val tabsEnd by animateDpAsState(if (menuOpen) reserved else 0.dp, label = "tabsEnd")
    Box(modifier.fillMaxWidth()) {
        Box(
            Modifier
                .align(Alignment.BottomCenter)
                .fillMaxWidth()
                .height(132.dp)
                .background(Brush.verticalGradient(0f to Color.Transparent, 0.58f to background, 1f to background)),
        )
        Box(
            Modifier
                .align(Alignment.BottomCenter)
                .fillMaxWidth()
                .navigationBarsPadding()
                .padding(start = 16.dp, end = 16.dp, bottom = 16.dp),
            contentAlignment = Alignment.BottomStart,
        ) {
            Dock(
                current = current,
                mode = mode,
                filtered = filtered,
                menuOpen = menuOpen,
                chatOpen = chatOpen,
                menu = menu,
                tabsEnd = tabsEnd,
                onSelectTab = onSelectTab,
                modifier = Modifier.fillMaxWidth().padding(end = dockEnd),
            )
            AgentButton(
                onClick = onAgent,
                bot = bot,
                chatOpen = chatOpen,
                blended = menuOpen,
                modifier = Modifier.align(Alignment.BottomEnd),
            )
        }
    }
}

@Composable
private fun Dock(
    current: MainTab,
    mode: ViewMode,
    filtered: Boolean,
    menuOpen: Boolean,
    chatOpen: Boolean,
    menu: @Composable () -> Unit,
    tabsEnd: Dp,
    onSelectTab: (MainTab) -> Unit,
    modifier: Modifier,
) {
    val scheme = MaterialTheme.colorScheme
    val shape = RoundedCornerShape(29.dp)
    Column(
        modifier =
            modifier
                .clip(shape)
                .background(scheme.surface)
                .border(1.dp, scheme.outline, shape),
    ) {
        AnimatedVisibility(
            visible = menuOpen,
            enter = expandVertically(expandFrom = Alignment.Bottom) + fadeIn(),
            exit = shrinkVertically(shrinkTowards = Alignment.Bottom) + fadeOut(),
        ) {
            Column {
                menu()
                HorizontalHairline()
            }
        }
        Row(
            modifier =
                Modifier
                    .fillMaxWidth()
                    .height(DockHeight)
                    .padding(start = 5.dp, top = 5.dp, bottom = 5.dp, end = 5.dp + tabsEnd)
                    .semantics { role = Role.Tab },
            horizontalArrangement = Arrangement.spacedBy(4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            for (tab in MainTab.entries) {
                DockTab(
                    tab = tab,
                    selected = tab == current,
                    mode = mode,
                    filtered = filtered && tab == current && !chatOpen,
                    menuOpen = menuOpen,
                    chatOpen = chatOpen,
                    onClick = { onSelectTab(tab) },
                )
            }
        }
    }
}

@Composable
private fun HorizontalHairline() {
    Box(Modifier.fillMaxWidth().height(1.dp).background(MaterialTheme.colorScheme.outline))
}

/** A pílula da aba atual: a cor do modo de executor e a tinta do texto sobre ela, como as `--mode-*` do web. */
@Composable
private fun pillOf(mode: ViewMode): Pair<Color, Color> {
    val scheme = MaterialTheme.colorScheme
    return when (mode) {
        ViewMode.Human -> scheme.primary to scheme.onPrimary
        ViewMode.Agent -> braidTokens().brandSoft to scheme.onBackground
        ViewMode.All -> braidTokens().modeAll to if (LocalBraidDarkTheme.current) scheme.surface else scheme.onBackground
    }
}

@Composable
private fun RowScope.DockTab(
    tab: MainTab,
    selected: Boolean,
    mode: ViewMode,
    filtered: Boolean,
    menuOpen: Boolean,
    chatOpen: Boolean,
    onClick: () -> Unit,
) {
    val scheme = MaterialTheme.colorScheme
    val (pill, pillInk) = pillOf(mode)
    // Com o chat aberto nenhuma seção é preenchida: a pílula se apaga e a de onde se veio fica só contornada.
    val filled = selected && !chatOpen
    val background by animateColorAsState(if (filled) pill else Color.Transparent, label = "tabPill")
    val ink by animateColorAsState(
        when {
            filled -> pillInk
            selected -> scheme.onBackground
            else -> scheme.onSurfaceVariant
        },
        label = "tabInk",
    )
    val iconScale by animateFloatAsState(if (selected) 1f else 0.9f, label = "tabIconScale")
    val grow by animateFloatAsState(if (selected) 1.8f else 1f, label = "tabGrow")

    Box(
        modifier =
            Modifier
                .weight(grow)
                .height(46.dp)
                .clip(RoundedCornerShape(23.dp))
                .background(background)
                .then(if (selected && chatOpen) Modifier.border(1.dp, scheme.outlineVariant, RoundedCornerShape(23.dp)) else Modifier)
                .clickable(role = Role.Tab, onClick = onClick)
                .semantics {
                    contentDescription = tab.label
                    this.selected = selected
                    // Na aba atual o toque abre ou fecha o menu da seção.
                    if (selected) stateDescription = if (menuOpen) "Menu aberto" else "Menu fechado"
                },
        contentAlignment = Alignment.Center,
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box {
                SvgIcon(
                    tab.icon,
                    size = if (chatOpen) 20.dp else 24.dp,
                    color = ink,
                    strokeWidth = 1.75f,
                    modifier = Modifier.scale(iconScale),
                )
                FilterDot(visible = filtered, ring = pill, modifier = Modifier.offset(x = 11.dp, y = (-7).dp))
            }
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

/** O ponto da aba atual: há busca ou filtro ativo na tela (7dp, com um aro da cor da pílula). */
@Composable
private fun FilterDot(
    visible: Boolean,
    ring: Color,
    modifier: Modifier = Modifier,
) {
    val scale by animateFloatAsState(if (visible) 1f else 0f, label = "filterDot")
    Box(
        modifier
            .size(11.dp)
            .scale(scale)
            .background(ring, CircleShape)
            .padding(2.dp)
            .background(MaterialTheme.colorScheme.tertiary, CircleShape)
            .semantics { if (visible) contentDescription = "Filtro ativo" },
    )
}
