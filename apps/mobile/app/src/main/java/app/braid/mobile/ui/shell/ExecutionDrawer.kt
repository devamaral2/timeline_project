package app.braid.mobile.ui.shell

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.EnterTransition
import androidx.compose.animation.ExitTransition
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.animation.expandHorizontally
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkHorizontally
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.requiredHeight
import androidx.compose.foundation.layout.requiredSize
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.layout
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import app.braid.mobile.core.designsystem.BraidIcons
import app.braid.mobile.core.designsystem.BraidMonoFont
import app.braid.mobile.core.designsystem.ProjectMark
import app.braid.mobile.core.designsystem.SvgIcon
import app.braid.mobile.core.designsystem.braidTokens
import app.braid.mobile.core.designsystem.scaledSpring
import app.braid.mobile.domain.execution.ExecutionDrawerMode
import app.braid.mobile.ui.chat.rememberReducedMotion
import app.braid.mobile.ui.tasks.AgentStatusIcon
import app.braid.mobile.ui.tasks.agentStatusIcon
import app.braid.mobile.ui.tasks.agentStatusLabel
import app.braid.mobile.ui.tasks.agentToneColor

/**
 * A gaveta de execução: o que os agentes estão fazendo agora, presa acima da barra de navegação nas três abas, em três
 * alturas (uma linha, três e todas). Tocar no cabeçalho alterna três e todas, a seta dupla recolhe a uma linha e tocar na
 * linha recolhida volta a três. Sem execução, ou fora das três abas, não é desenhada. A altura que ela ocupa agora (a
 * animada) vai para [reserve], e cada tela a reserva no fim da sua rolagem.
 *
 * [shown] é falso com o chat aberto ou o menu da seção por cima; a gaveta se apaga em vez de sumir seca, e a reserva fica.
 */
@Composable
fun ExecutionDrawer(
    state: ExecutionDrawerUiState,
    shown: Boolean,
    reserve: ExecutionReserve,
    onSetMode: (ExecutionDrawerMode) -> Unit,
    onOpenTask: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val reduced = rememberReducedMotion()
    val model = if (state.ready) executionDrawerModel(state.runs, state.mode) else null
    val screen = LocalConfiguration.current.screenHeightDp.dp

    val list by animateDpAsState(
        model?.let { ExecutionDrawerLayout.listHeight(it.mode, it.shown, screen) } ?: 0.dp,
        ExecutionDrawerMotion.height(state.grow, reduced),
        label = "executionList",
    )
    // 0 numa linha só (a borda fica), 1 com o cabeçalho: o respiro e o cabeçalho andam juntos.
    val chrome by animateFloatAsState(
        if (model?.mode == ExecutionDrawerMode.One) 0f else 1f,
        ExecutionDrawerMotion.height(state.grow, reduced),
        label = "executionChrome",
    )
    val fade by animateFloatAsState(
        if (shown) 1f else 0f,
        ExecutionDrawerMotion.headerFade(visible = shown, reduced = reduced),
        label = "executionFade",
    )

    SideEffect {
        reserve.height = if (model == null) 0.dp else list + BORDER * 2 + CHROME_EXTRA * chrome + ExecutionDrawerLayout.Seam
    }

    if (model == null || (!shown && fade == 0f)) return
    val background = MaterialTheme.colorScheme.background
    Column(modifier.fillMaxWidth().alpha(fade)) {
        // O fundo sobe junto com a gaveta, e o conteúdo se apaga em vez de cortar seco.
        Box(
            Modifier
                .fillMaxWidth()
                .height(FADE_HEIGHT)
                .background(Brush.verticalGradient(listOf(Color.Transparent, background))),
        )
        Box(Modifier.fillMaxWidth().background(background).padding(start = 16.dp, end = 16.dp, bottom = ExecutionDrawerLayout.DockGap)) {
            Bar(model, list, chrome, state.grow, reduced, onSetMode, onOpenTask)
        }
    }
}

/** A borda de 1 dp de cada lado, e o que o cabeçalho mais o respiro somam: 2 em cima, 44 de cabeçalho e 6 embaixo. */
private val BORDER = 1.dp
private val CHROME_EXTRA = 52.dp
private val FADE_HEIGHT = 56.dp
private val BarShape = RoundedCornerShape(23.dp)

@Composable
private fun Bar(
    model: ExecutionDrawerModel,
    list: Dp,
    chrome: Float,
    grow: Boolean,
    reduced: Boolean,
    onSetMode: (ExecutionDrawerMode) -> Unit,
    onOpenTask: (String) -> Unit,
) {
    val scheme = MaterialTheme.colorScheme
    Box(
        Modifier
            .fillMaxWidth()
            .clip(BarShape)
            .background(scheme.surface)
            .border(BORDER, scheme.outline, BarShape)
            .padding(BORDER),
    ) {
        Column(Modifier.padding(start = 16.dp, end = 16.dp, top = 2.dp * chrome, bottom = 6.dp * chrome)) {
            Header(model, chrome, reduced, onSetMode)
            Column(
                Modifier
                    .fillMaxWidth()
                    .height(list)
                    .clipToBounds()
                    .then(if (model.mode == ExecutionDrawerMode.All) Modifier.verticalScroll(rememberScrollState()) else Modifier),
            ) {
                model.rows.forEach { row ->
                    RunRow(row, model.mode, grow, reduced, onOpen = { onOpenTask(row.card.id) })
                }
            }
        }
        // Tocar na linha recolhida volta a três: o botão cobre a gaveta inteira.
        if (model.mode == ExecutionDrawerMode.One) {
            Box(
                Modifier
                    .matchParentSize()
                    .clickable(role = Role.Button) { onSetMode(model.expandTarget) }
                    .semantics { contentDescription = model.expandLabel },
            )
        }
    }
}

/** O cabeçalho: o divisor em mono da lista com a contagem e o "+N" das escondidas, e a seta dupla que recolhe. */
@Composable
private fun Header(
    model: ExecutionDrawerModel,
    chrome: Float,
    reduced: Boolean,
    onSetMode: (ExecutionDrawerMode) -> Unit,
) {
    val muted = MaterialTheme.colorScheme.onSurfaceVariant
    val faint = braidTokens().faint
    val hidden = model.headerHidden
    val alpha by animateFloatAsState(
        if (hidden) 0f else 1f,
        ExecutionDrawerMotion.headerFade(visible = !hidden, reduced = reduced),
        label = "headerAlpha",
    )
    val turn by animateFloatAsState(
        if (model.expanded) 180f else 0f,
        ExecutionDrawerMotion.height(grow = true, reduced = reduced),
        label = "headerChevron",
    )
    Box(
        Modifier
            .fillMaxWidth()
            .height(44.dp * chrome)
            .clipToBounds()
            .alpha(alpha)
            .then(if (hidden) Modifier.clearAndSetSemantics {} else Modifier),
    ) {
        Row(Modifier.fillMaxWidth().requiredHeight(44.dp), verticalAlignment = Alignment.CenterVertically) {
            Row(
                Modifier
                    .weight(1f)
                    .height(44.dp)
                    .clip(RoundedCornerShape(8.dp))
                    .then(if (hidden) Modifier else Modifier.clickable(role = Role.Button) { onSetMode(model.toggleTarget) })
                    .semantics {
                        contentDescription = model.toggleLabel
                        stateDescription = if (model.expanded) "Todas à mostra" else "Só três à mostra"
                    },
                horizontalArrangement = Arrangement.spacedBy(12.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                SvgIcon(BraidIcons.chevronUp, size = 16.dp, color = muted, modifier = Modifier.rotate(turn))
                Text("EM ANDAMENTO", style = monoLabel(muted))
                Text(model.total.toString(), style = monoLabel(faint))
                Box(Modifier.weight(1f).height(1.dp).background(MaterialTheme.colorScheme.outline))
                if (model.rest.isNotEmpty()) Text(model.rest, style = monoLabel(faint))
            }
            // A seta dupla entra 14 dp na margem, como o `margin-right: -14px` do web.
            Box(Modifier.width(30.dp), contentAlignment = Alignment.CenterStart) {
                Box(
                    Modifier
                        .requiredSize(44.dp)
                        .clip(RoundedCornerShape(8.dp))
                        .then(if (hidden) Modifier else Modifier.clickable(role = Role.Button) { onSetMode(ExecutionDrawerMode.One) })
                        .semantics { contentDescription = model.collapseLabel },
                    contentAlignment = Alignment.Center,
                ) {
                    SvgIcon(BraidIcons.chevronsDown, size = 16.dp, color = muted)
                }
            }
        }
    }
}

@Composable
private fun monoLabel(color: Color) =
    MaterialTheme.typography.bodySmall.copy(
        color = color,
        fontFamily = BraidMonoFont,
        fontWeight = FontWeight.Medium,
        fontSize = 12.sp,
        lineHeight = 16.sp,
        letterSpacing = 0.08.em,
    )

@Composable
private fun RunRow(
    row: ExecutionRowModel,
    mode: ExecutionDrawerMode,
    grow: Boolean,
    reduced: Boolean,
    onOpen: () -> Unit,
) {
    val scheme = MaterialTheme.colorScheme
    val one = mode == ExecutionDrawerMode.One
    val visible =
        when (row.tier) {
            RowTier.First -> true
            RowTier.Peek -> mode != ExecutionDrawerMode.One
            RowTier.More -> mode == ExecutionDrawerMode.All
        }
    val step = row.step ?: 0
    val fade by animateFloatAsState(if (visible) 1f else 0f, ExecutionDrawerMotion.rowFade(visible, step, grow, reduced), label = "rowFade")
    val slide by animateFloatAsState(
        if (visible) 1f else 0f,
        ExecutionDrawerMotion.rowSlide(visible, step, grow, reduced),
        label = "rowSlide",
    )
    val rowHeight by animateDpAsState(
        if (row.tier == RowTier.First && one) ExecutionDrawerLayout.One else ExecutionDrawerLayout.Row,
        ExecutionDrawerMotion.height(grow = false, reduced = reduced),
        label = "rowHeight",
    )
    val upWidth by animateDpAsState(
        if (row.tier == RowTier.First && one) UP_WIDTH else 0.dp,
        ExecutionDrawerMotion.height(grow = false, reduced = reduced),
        label = "rowUp",
    )
    val muted = scheme.onSurfaceVariant
    val line = scheme.outline
    val status = row.card.status
    val tone = agentToneColor(remember(status) { agentStatusIcon(status) }.tone)
    Row(
        Modifier
            .fillMaxWidth()
            .height(rowHeight)
            .graphicsLayer {
                alpha = fade
                translationY = (1f - slide) * 8.dp.toPx()
            }.then(
                if (row.tier == RowTier.First) {
                    Modifier
                } else {
                    Modifier.drawBehind { drawRect(line, size = Size(size.width, 1.dp.toPx())) }
                },
            ).then(
                if (row.hidden) {
                    // Fora das linhas à mostra (ou coberta pelo botão da linha recolhida): sem leitor de tela e sem toque.
                    Modifier.clearAndSetSemantics {}
                } else {
                    Modifier
                        .clickable(
                            role = Role.Button,
                            onClickLabel = "Abrir a tarefa",
                            onClick = onOpen,
                        ).semantics(mergeDescendants = true) {}
                },
            ),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.width(upWidth).clipToBounds()) {
            SvgIcon(BraidIcons.chevronUp, size = 14.dp, color = muted)
        }
        ProjectMark(row.card.project, labelled = true)
        Spacer(Modifier.width(10.dp))
        Text(
            text = row.card.name,
            modifier = Modifier.weight(1f),
            color = scheme.onSurface,
            fontSize = 14.sp,
            lineHeight = 20.sp,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        // Na altura de uma linha, a primeira ganha a seta de abrir e a contagem das outras.
        AnimatedVisibility(
            visible = one && row.count != null,
            enter = if (reduced) EnterTransition.None else expandHorizontally(tweenOf(grow = false)) + fadeIn(FadeSpring),
            exit = if (reduced) ExitTransition.None else shrinkHorizontally(tweenOf(grow = false)) + fadeOut(FadeSpring),
        ) {
            Text(
                text = row.count.orEmpty(),
                modifier = Modifier.padding(start = 10.dp),
                color = braidTokens().faint,
                fontFamily = BraidMonoFont,
                fontSize = 12.sp,
                lineHeight = 16.sp,
                maxLines = 1,
            )
        }
        Spacer(Modifier.width(10.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
            // O ícone já diz o nome por inteiro ("Agente, trabalhando"); o texto é só para quem enxerga.
            agentStatusLabel(status)?.let { label ->
                Text(
                    text = label,
                    modifier = Modifier.clearAndSetSemantics {},
                    color = tone,
                    fontSize = 13.sp,
                    lineHeight = 22.sp,
                    maxLines = 1,
                )
            }
            AgentStatusIcon(status = status)
        }
    }
}

private val UP_WIDTH = 24.dp

/** A mola padrão do `fadeIn` e do `fadeOut` (`StiffnessMediumLow`), na escala do Motion. */
private val FadeSpring = scaledSpring<Float>(Spring.StiffnessMediumLow)

private fun <T> tweenOf(grow: Boolean) =
    tween<T>(
        if (grow) ExecutionDrawerMotion.GROW_MS else ExecutionDrawerMotion.SHRINK_MS,
        easing = if (grow) ExecutionDrawerMotion.GrowEasing else ExecutionDrawerMotion.ShrinkEasing,
    )

/**
 * O espaço que cada tela reserva no fim da rolagem: a altura atual da gaveta de execução, que anda junto com ela. Lida na
 * fase de layout, então a animação não recompõe a lista. Sem gaveta é zero.
 */
@Composable
fun ExecutionReserveSpacer(modifier: Modifier = Modifier) {
    val reserve = LocalExecutionReserve.current
    Spacer(
        modifier.layout { _, constraints ->
            val width = if (constraints.hasBoundedWidth) constraints.maxWidth else 0
            layout(width, reserve.height.roundToPx()) {}
        },
    )
}

val LocalExecutionReserve = staticCompositionLocalOf { ExecutionReserve() }
