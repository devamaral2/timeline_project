package app.braid.mobile.ui.chat

import android.provider.Settings
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.FiniteAnimationSpec
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.VisibilityThreshold
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.snap
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.ime
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.layout
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.paneTitle
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import app.braid.mobile.core.designsystem.BraidIcons
import app.braid.mobile.core.designsystem.BraidMonoFont
import app.braid.mobile.core.designsystem.Motion
import app.braid.mobile.core.designsystem.SvgIcon
import app.braid.mobile.core.designsystem.SvgPart
import app.braid.mobile.core.designsystem.braidBrand
import app.braid.mobile.core.designsystem.braidTokens
import app.braid.mobile.core.designsystem.scaledSpring
import app.braid.mobile.core.designsystem.svgCircle
import app.braid.mobile.domain.chat.ModelPicker
import app.braid.mobile.domain.chat.ModelRow
import app.braid.mobile.domain.chat.ModelTab
import app.braid.mobile.domain.chat.emptyModelListMessage
import app.braid.mobile.domain.chat.modelFooter
import app.braid.mobile.domain.chat.modelRows
import app.braid.mobile.domain.request.ModelEffort
import app.braid.mobile.domain.request.ModelOptions
import app.braid.mobile.domain.request.ModelProvider
import app.braid.mobile.domain.request.ModelSelection
import kotlin.math.max

// A escolha do modelo (canvas "Modal de provedor, modelo e esforço", opção A · Folha): uma folha que sobe de baixo, por cima
// da tela inteira (a barra de baixo também). Os provedores são abas (visões, não escolhas), a lista tem busca e estrela de
// favorito, e só tocar numa linha troca o modelo. O campo não mostra o modelo (canvas "Input do detalhe da entidade"): o chat e
// a barra de edição dos detalhes abrem a folha quando se envia `/model` (`isModelCommand`), e quem os monta guarda se está aberta.

/** Os três pedidos da folha: cada troca vale já, em todas as telas, e fica no aparelho. */
class ModelActions(
    /** Uma linha foi tocada: o provedor e o modelo mudam juntos (a aba só decide qual lista se vê). */
    val onModel: (ModelProvider, String) -> Unit = { _, _ -> },
    val onEffort: (ModelEffort) -> Unit = {},
    /** A estrela de uma linha: guarda ou tira o favorito, sem escolher o modelo. */
    val onFavorite: (ModelProvider, String) -> Unit = { _, _ -> },
)

private val OpenEasing = CubicBezierEasing(0.2f, 0.8f, 0.2f, 1f)
private val CloseEasing = CubicBezierEasing(0.4f, 0f, 0.2f, 1f)
private const val SHEET_OPEN_MS = Motion.SHEET_OPEN_MS
private const val SHEET_CLOSE_MS = Motion.SHEET_CLOSE_MS
private const val SCRIM_OPEN_MS = Motion.SCRIM_OPEN_MS
private const val SCRIM_CLOSE_MS = Motion.SCRIM_CLOSE_MS
private const val BLOCK_MS = Motion.SHEET_BLOCK_MS
private const val STAR_MS = Motion.SHEET_TOGGLE_MS
private const val RADIO_MS = Motion.SHEET_TOGGLE_MS
private const val SCRIM_ALPHA = 0.5f
private const val HAIRLINE_ALPHA = 0.7f
private const val STAR_OFF_SCALE = 0.88f

/** O atraso de cada um dos três blocos da folha ao abrir. */
private val BlockDelays = List(3) { Motion.SHEET_BLOCK_DELAY_MS + it * Motion.SHEET_BLOCK_STEP_MS }

private val SheetTopCorner = 24.dp
private val SheetSide = 20.dp
private val SheetTopGap = 28.dp
private val BlockRise = 18.dp

/** A lista de modelos tem 216 dp (quatro linhas e meia, a meia insinua que há mais) e nunca menos de 96 dp. */
private val ListHeight = 216.dp
private val ListMinHeight = 96.dp
private val RowHeight = 48.dp

/** Quem desligou as animações no sistema (escala 0) não vê a folha subir: ela aparece e some de uma vez. */
@Composable
private fun rememberPickerReducedMotion(): Boolean {
    val resolver = LocalContext.current.contentResolver
    return remember(resolver) {
        runCatching { Settings.Global.getFloat(resolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) == 0f }.getOrDefault(false)
    }
}

private fun <T> spec(
    reduced: Boolean,
    durationMs: Int,
    easing: androidx.compose.animation.core.Easing,
    delayMs: Int = 0,
): FiniteAnimationSpec<T> = if (reduced) snap() else tween(durationMs, delayMillis = delayMs, easing = easing)

/**
 * A folha da escolha do modelo. Fechada ([open] falso e a saída terminada) não ocupa nada. Aberta, é um diálogo de tela
 * inteira: o fundo escurece em `scrimOpen` e a folha sobe em `sheetOpen` (tempos do Motion); os três blocos sobem 18 dp e aparecem em fila. Fechar (o X, o
 * fundo ou o voltar do sistema, todos em [onClose]) a desce em `sheetClose`. Trocar o modelo não a fecha.
 */
@Composable
internal fun ModelSheet(
    picker: ModelPicker,
    open: Boolean,
    actions: ModelActions,
    onClose: () -> Unit,
) {
    var present by remember { mutableStateOf(open) }
    LaunchedEffect(open) { if (open) present = true }
    if (!present) return
    Dialog(
        onDismissRequest = onClose,
        properties =
            DialogProperties(
                dismissOnBackPress = true,
                dismissOnClickOutside = false,
                usePlatformDefaultWidth = false,
                decorFitsSystemWindows = false,
            ),
    ) {
        SheetContent(picker, open, actions, onClose, onGone = { present = false })
    }
}

@Composable
private fun SheetContent(
    picker: ModelPicker,
    open: Boolean,
    actions: ModelActions,
    onClose: () -> Unit,
    onGone: () -> Unit,
) {
    val reduced = rememberPickerReducedMotion()
    // A folha entra na primeira composição já fechada e só então vai para aberta, para a subida acontecer.
    var entered by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) { entered = true }
    val showing = open && entered
    LaunchedEffect(open, reduced) { if (!open && reduced) onGone() }
    val sheet by animateFloatAsState(
        targetValue = if (showing) 1f else 0f,
        animationSpec = if (showing) spec(reduced, SHEET_OPEN_MS, OpenEasing) else spec(reduced, SHEET_CLOSE_MS, CloseEasing),
        label = "model-sheet",
        finishedListener = { if (it == 0f) onGone() },
    )
    val scrim by animateFloatAsState(
        targetValue = if (showing) 1f else 0f,
        animationSpec = if (showing) spec(reduced, SCRIM_OPEN_MS, OpenEasing) else spec(reduced, SCRIM_CLOSE_MS, LinearEasing),
        label = "model-scrim",
    )
    val scrimColor = MaterialTheme.colorScheme.scrim
    val density = LocalDensity.current
    val topGap = maxOf(SheetTopGap, with(density) { WindowInsets.statusBars.getTop(density).toDp() })
    Box(Modifier.fillMaxSize()) {
        Box(
            Modifier
                .fillMaxSize()
                .drawBehind { drawRect(scrimColor.copy(alpha = SCRIM_ALPHA * scrim)) }
                .clickable(
                    interactionSource =
                        remember {
                            MutableInteractionSource()
                        },
                    indication = null,
                    onClickLabel = "Fechar a escolha do modelo",
                    role = Role.Button,
                ) {
                    onClose()
                },
        )
        Box(Modifier.fillMaxSize().padding(top = topGap).imePadding(), contentAlignment = Alignment.BottomCenter) {
            Sheet(picker, actions, onClose, entered, reduced, Modifier.graphicsLayer { translationY = size.height * (1f - sheet) })
        }
    }
}

@Composable
private fun Sheet(
    picker: ModelPicker,
    actions: ModelActions,
    onClose: () -> Unit,
    entered: Boolean,
    reduced: Boolean,
    modifier: Modifier,
) {
    val scheme = MaterialTheme.colorScheme
    val shape = RoundedCornerShape(topStart = SheetTopCorner, topEnd = SheetTopCorner)
    // As abas são visões: a folha abre na do provedor da escolha atual, e tocar numa aba só troca a lista (e limpa a busca).
    var tab by remember { mutableStateOf<ModelTab>(ModelTab.OfProvider(picker.selection.provider)) }
    var query by remember { mutableStateOf("") }
    // Com o teclado aberto o bloco do esforço sai: os resultados da busca ficam à vista.
    val keyboardOpen = WindowInsets.ime.getBottom(LocalDensity.current) > 0
    Column(
        modifier
            .fillMaxWidth()
            .clip(shape)
            .background(scheme.surface)
            .drawBehind { drawTopBorder(scheme.outline, SheetTopCorner.toPx(), 1.dp.toPx()) }
            .pointerInput(Unit) { detectTapGestures { } }
            .semantics { paneTitle = "Escolha do modelo" }
            .navigationBarsPadding()
            .padding(start = SheetSide, top = 8.dp, bottom = 18.dp),
    ) {
        Box(Modifier.fillMaxWidth().padding(end = SheetSide), contentAlignment = Alignment.Center) {
            Box(
                Modifier
                    .size(
                        width = 36.dp,
                        height = 4.dp,
                    ).background(scheme.outlineVariant, RoundedCornerShape(2.dp))
                    .clearAndSetSemantics {},
            )
        }
        ProviderBlock(
            picker = picker,
            tab = tab,
            onTab = {
                tab = it
                query = ""
            },
            onClose = onClose,
            modifier = Modifier.padding(top = 4.dp).rising(entered, reduced, BlockDelays[0]),
        )
        ModelBlock(
            picker = picker,
            tab = tab,
            query = query,
            onQuery = { query = it },
            actions = actions,
            modifier = Modifier.weight(1f, fill = false).padding(top = 18.dp).rising(entered, reduced, BlockDelays[1]),
        )
        if (!keyboardOpen) {
            EffortBlock(picker, actions.onEffort, Modifier.padding(top = 18.dp, end = SheetSide).rising(entered, reduced, BlockDelays[2]))
        }
    }
}

/** A borda de cima da folha: só o arco dos dois cantos e a linha entre eles, como o `border-top` do canvas. */
private fun androidx.compose.ui.graphics.drawscope.DrawScope.drawTopBorder(
    color: Color,
    radius: Float,
    width: Float,
) {
    val half = width / 2f
    val diameter = 2f * (radius - half)
    val path =
        Path().apply {
            moveTo(half, radius)
            arcTo(Rect(half, half, half + diameter, half + diameter), 180f, 90f, false)
            lineTo(size.width - radius, half)
            arcTo(Rect(size.width - half - diameter, half, size.width - half, half + diameter), 270f, 90f, false)
        }
    drawPath(path, color, style = Stroke(width = width))
}

/** Um bloco da folha: aparece e sobe 18 dp depois do atraso; ao fechar não anda sozinho, sai com a folha. */
@Composable
private fun Modifier.rising(
    entered: Boolean,
    reduced: Boolean,
    delayMs: Int,
): Modifier {
    val progress = animateFloatAsState(if (entered) 1f else 0f, spec(reduced, BLOCK_MS, OpenEasing, delayMs), label = "model-block")
    return graphicsLayer {
        alpha = progress.value
        translationY = BlockRise.toPx() * (1f - progress.value)
    }
}

/** O rótulo mono em caixa alta de cada bloco. */
@Composable
private fun SheetLabel(
    text: String,
    modifier: Modifier = Modifier,
) {
    Text(
        text = text.uppercase(),
        modifier = modifier.semantics { heading() },
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        fontFamily = BraidMonoFont,
        fontSize = 12.sp,
        lineHeight = 16.sp,
        fontWeight = FontWeight.Medium,
        letterSpacing = 0.1.em,
    )
}

private const val STAR_PATH = "M12 3.6l2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z"

/** A estrela de 24 dp: cheia no âmbar (favorito) ou só o contorno (a cor dada). */
@Composable
private fun StarIcon(
    filled: Boolean,
    color: Color,
    size: Dp,
    modifier: Modifier = Modifier,
) {
    SvgIcon(
        parts = listOf(if (filled) SvgPart(STAR_PATH, fill = true, outline = color, outlineWidth = 1.6f) else SvgPart(STAR_PATH)),
        modifier = modifier.clearAndSetSemantics {},
        size = size,
        color = color,
        strokeWidth = 1.6f,
    )
}

/** O círculo de seleção: o anel e, escolhido, o ponto verde-água dentro, que cresce em `sheetToggle` (Motion). */
@Composable
private fun Radio(
    selected: Boolean,
    reduced: Boolean,
) {
    val brand = braidBrand()
    val dot by animateFloatAsState(if (selected) 1f else 0f, spec(reduced, RADIO_MS, OpenEasing), label = "model-radio")
    Box(
        Modifier
            .size(18.dp)
            .border(2.dp, if (selected) brand else MaterialTheme.colorScheme.outlineVariant, CircleShape)
            .padding(5.dp)
            .drawBehind { drawCircle(brand, radius = size.minDimension / 2f * dot) },
    )
}

/** Bloco 1: "Provedor", o nome da aba aberta, o X de fechar e a fila de quadrados (os favoritos e um por provedor). */
@Composable
private fun ProviderBlock(
    picker: ModelPicker,
    tab: ModelTab,
    onTab: (ModelTab) -> Unit,
    onClose: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val scheme = MaterialTheme.colorScheme
    val tokens = braidTokens()
    val tabName =
        when (tab) {
            ModelTab.Favorites -> "Favoritos"
            is ModelTab.OfProvider ->
                picker.options.providers
                    .firstOrNull { it.id == tab.id }
                    ?.name ?: tab.id.code
        }
    Column(modifier, verticalArrangement = Arrangement.spacedBy(8.dp)) {
        // O X vai 10 dp para fora da margem da folha: o ícone fica no alinhamento do texto e o toque tem 44 dp.
        Row(Modifier.fillMaxWidth().height(44.dp).padding(end = SheetSide / 2), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.weight(1f).fillMaxHeight(), contentAlignment = Alignment.CenterStart) {
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    SheetLabel("Provedor", Modifier.alignByBaseline())
                    Text(
                        text = tabName,
                        modifier = Modifier.alignByBaseline(),
                        color = scheme.onBackground,
                        fontSize = 14.sp,
                        lineHeight = 20.sp,
                        fontWeight = FontWeight.SemiBold,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
            Box(
                Modifier
                    .size(44.dp)
                    .clip(CircleShape)
                    .clickable(role = Role.Button, onClick = onClose)
                    .semantics { contentDescription = "Fechar" },
                contentAlignment = Alignment.Center,
            ) {
                SvgIcon(
                    BraidIcons.close,
                    size = 22.dp,
                    color = scheme.onBackground,
                    strokeWidth = 1.8f,
                    modifier = Modifier.clearAndSetSemantics {},
                )
            }
        }
        Row(Modifier.padding(end = SheetSide), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Tile("Favoritos", selected = tab == ModelTab.Favorites, onClick = { onTab(ModelTab.Favorites) }) {
                StarIcon(filled = true, color = tokens.warning, size = 24.dp)
            }
            for (provider in picker.options.providers) {
                val on = tab == ModelTab.OfProvider(provider.id)
                Tile(provider.name, selected = on, onClick = { onTab(ModelTab.OfProvider(provider.id)) }) {
                    ProviderMark(provider.id, if (on) scheme.onBackground else scheme.onSurfaceVariant)
                }
            }
        }
    }
}

/** Um quadrado de 52 dp: contornado; escolhido, com a borda da marca e o fundo suave dela. */
@Composable
private fun Tile(
    label: String,
    selected: Boolean,
    onClick: () -> Unit,
    content: @Composable () -> Unit,
) {
    val scheme = MaterialTheme.colorScheme
    val tokens = braidTokens()
    val shape = RoundedCornerShape(14.dp)
    Box(
        Modifier
            .size(52.dp)
            .clip(shape)
            .background(if (selected) tokens.brandSoft else Color.Transparent, shape)
            .border(1.dp, if (selected) tokens.brand else scheme.outline, shape)
            .selectable(selected = selected, role = Role.Tab, onClick = onClick)
            .semantics { contentDescription = label },
        contentAlignment = Alignment.Center,
    ) { content() }
}

/** Bloco 2: "Modelos", a busca e a lista da aba aberta, que é a única parte que rola. */
@Composable
private fun ModelBlock(
    picker: ModelPicker,
    tab: ModelTab,
    query: String,
    onQuery: (String) -> Unit,
    actions: ModelActions,
    modifier: Modifier = Modifier,
) {
    val scheme = MaterialTheme.colorScheme
    val reduced = rememberPickerReducedMotion()
    val rows = remember(picker, tab, query) { modelRows(picker.options, picker.favorites, picker.selection, tab, query) }
    val list = rememberLazyListState()
    // A aba abre com o modelo escolhido à vista (numa lista longa, como a do OpenRouter); uma busca volta ao topo.
    LaunchedEffect(tab, query) { list.scrollToItem(if (query.isEmpty()) max(0, rows.indexOfFirst { it.selected }) else 0) }
    Column(modifier) {
        SheetLabel("Modelos", Modifier.padding(end = SheetSide))
        SearchField(query, onQuery, Modifier.padding(end = SheetSide, bottom = 4.dp))
        // A lista vai 10 dp para fora da margem da folha: a estrela tem o toque de 44 dp e o ícone fica no alinhamento do texto.
        LazyColumn(
            state = list,
            modifier =
                Modifier
                    .weight(1f, fill = false)
                    .fillMaxWidth()
                    .padding(end = SheetSide / 2)
                    .fixedHeight(ListHeight, ListMinHeight),
        ) {
            if (rows.isEmpty()) {
                item {
                    Text(
                        text = emptyModelListMessage(tab, query),
                        modifier = Modifier.padding(start = 2.dp, end = SheetSide / 2, top = 14.dp, bottom = 14.dp),
                        color = scheme.onSurfaceVariant,
                        fontSize = 14.sp,
                        lineHeight = 20.sp,
                    )
                }
            }
            items(rows, key = { "${it.provider.code}/${it.id}" }) { row ->
                ModelRowItem(
                    row = row,
                    showProvider = tab == ModelTab.Favorites,
                    reduced = reduced,
                    onPick = { actions.onModel(row.provider, row.id) },
                    onStar = { actions.onFavorite(row.provider, row.id) },
                )
            }
        }
    }
}

/**
 * A altura da lista: [height] (a mesma em todas as abas, para a folha não mexer ao trocar), encolhendo quando falta lugar mas
 * nunca abaixo de [minHeight].
 */
private fun Modifier.fixedHeight(
    height: Dp,
    minHeight: Dp,
): Modifier =
    layout { measurable, constraints ->
        val room = if (constraints.hasBoundedHeight) constraints.maxHeight else Int.MAX_VALUE
        val target = height.roundToPx().coerceAtMost(room).coerceAtLeast(minHeight.roundToPx())
        val placeable = measurable.measure(Constraints.fixed(constraints.maxWidth, target))
        layout(placeable.width, placeable.height) { placeable.placeRelative(0, 0) }
    }

/** Uma linha de 48 dp: o círculo à esquerda, o nome (e, nos favoritos, o provedor) e a estrela à direita. */
@Composable
private fun ModelRowItem(
    row: ModelRow,
    showProvider: Boolean,
    reduced: Boolean,
    onPick: () -> Unit,
    onStar: () -> Unit,
) {
    val scheme = MaterialTheme.colorScheme
    val tokens = braidTokens()
    val hairline = scheme.outline.copy(alpha = HAIRLINE_ALPHA)
    val inset = SheetSide / 2
    val scale by animateFloatAsState(if (row.favorite) 1f else STAR_OFF_SCALE, spec(reduced, STAR_MS, OpenEasing), label = "model-star")
    Row(
        Modifier
            .fillMaxWidth()
            .heightIn(min = RowHeight)
            .drawBehind {
                val y = size.height - 0.5.dp.toPx()
                drawLine(hairline, Offset(0f, y), Offset(size.width - inset.toPx(), y), strokeWidth = 1.dp.toPx())
            },
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Row(
            Modifier
                .weight(1f)
                .heightIn(min = RowHeight)
                .clip(RoundedCornerShape(10.dp))
                .selectable(selected = row.selected, role = Role.RadioButton, onClick = onPick)
                .padding(start = 2.dp, end = 6.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Radio(row.selected, reduced)
            Text(
                text = row.name,
                modifier = Modifier.weight(1f),
                color = scheme.onBackground,
                fontSize = 15.sp,
                lineHeight = 20.sp,
                fontWeight = if (row.selected) FontWeight.SemiBold else FontWeight.Medium,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            if (showProvider) {
                Text(
                    text = row.provider.code,
                    color = scheme.onSurfaceVariant,
                    fontFamily = BraidMonoFont,
                    fontSize = 11.sp,
                    lineHeight = 16.sp,
                )
            }
        }
        Box(
            Modifier
                .size(width = 44.dp, height = RowHeight)
                .clip(RoundedCornerShape(10.dp))
                .clickable(role = Role.Button, onClick = onStar)
                .semantics { contentDescription = if (row.favorite) "Tirar dos favoritos: ${row.name}" else "Favoritar: ${row.name}" },
            contentAlignment = Alignment.Center,
        ) {
            StarIcon(
                filled = row.favorite,
                color = if (row.favorite) tokens.warning else tokens.faint,
                size = 20.dp,
                modifier =
                    Modifier.graphicsLayer {
                        scaleX = scale
                        scaleY = scale
                    },
            )
        }
    }
}

/** "Buscar modelo": uma linha de 44 dp com só o fio de baixo (da marca com foco), a lupa e, havendo texto, o limpar. */
@Composable
private fun SearchField(
    query: String,
    onQuery: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val scheme = MaterialTheme.colorScheme
    val tokens = braidTokens()
    val interaction = remember { MutableInteractionSource() }
    val focused by interaction.collectIsFocusedAsState()
    val focus = LocalFocusManager.current
    val keyboard = LocalSoftwareKeyboardController.current
    val line = if (focused) tokens.brand else scheme.outlineVariant
    Row(
        modifier
            .fillMaxWidth()
            .height(44.dp)
            .drawBehind {
                val width = 1.5.dp.toPx()
                drawLine(line, Offset(0f, size.height - width / 2f), Offset(size.width, size.height - width / 2f), strokeWidth = width)
            },
        horizontalArrangement = Arrangement.spacedBy(10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        SvgIcon(
            listOf(SvgPart(svgCircle(11f, 11f, 7f)), SvgPart("M20 20l-3.6-3.6")),
            size = 18.dp,
            color = if (focused) tokens.brandAccent else scheme.onSurfaceVariant,
            strokeWidth = 1.8f,
            modifier = Modifier.clearAndSetSemantics {},
        )
        BasicTextField(
            value = query,
            onValueChange = onQuery,
            singleLine = true,
            interactionSource = interaction,
            textStyle = MaterialTheme.typography.bodyMedium.copy(fontSize = 16.sp, lineHeight = 22.sp, color = scheme.onBackground),
            cursorBrush = SolidColor(tokens.brandAccent),
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
            keyboardActions =
                KeyboardActions(
                    onSearch = {
                        focus.clearFocus()
                        keyboard?.hide()
                    },
                ),
            modifier = Modifier.weight(1f).semantics { contentDescription = "Buscar modelo" },
            decorationBox = { inner ->
                Box(contentAlignment = Alignment.CenterStart) {
                    if (query.isEmpty()) Text("Buscar modelo", color = scheme.onSurfaceVariant, fontSize = 16.sp, lineHeight = 22.sp)
                    inner()
                }
            },
        )
        Box(
            Modifier
                .size(32.dp)
                .clip(CircleShape)
                .then(if (query.isEmpty()) Modifier.clearAndSetSemantics {} else Modifier.clickable(role = Role.Button) { onQuery("") })
                .semantics { if (query.isNotEmpty()) contentDescription = "Limpar a busca" },
            contentAlignment = Alignment.Center,
        ) {
            if (query.isNotEmpty()) {
                SvgIcon(
                    BraidIcons.close,
                    size = 16.dp,
                    color = scheme.onSurfaceVariant,
                    strokeWidth = 2f,
                    modifier = Modifier.clearAndSetSemantics {},
                )
            }
        }
    }
}

/** Bloco 3: o esforço, quatro paradas numa trilha; o verde vai da primeira até a escolhida, que é a maior. */
@Composable
private fun EffortBlock(
    picker: ModelPicker,
    onEffort: (ModelEffort) -> Unit,
    modifier: Modifier = Modifier,
) {
    val scheme = MaterialTheme.colorScheme
    val brand = braidBrand()
    val efforts = picker.options.efforts
    val level = max(0, efforts.indexOf(picker.selection.effort))
    Column(modifier, verticalArrangement = Arrangement.spacedBy(6.dp)) {
        SheetLabel("Esforço")
        BoxWithConstraints(Modifier.fillMaxWidth()) {
            val step = maxWidth / max(1, efforts.size)
            val fill by animateDpAsState(
                step * level,
                // A mola padrão do `Dp` (`StiffnessMedium`, com o limite de `Dp`), na escala do Motion.
                scaledSpring(visibilityThreshold = Dp.VisibilityThreshold),
                label = "model-effort-fill",
            )
            Box(
                Modifier
                    .offset(x = step / 2, y = 13.dp)
                    .width(step * (efforts.size - 1))
                    .height(2.dp)
                    .background(scheme.outline),
            )
            Box(
                Modifier
                    .offset(x = step / 2, y = 13.dp)
                    .width(fill)
                    .height(2.dp)
                    .background(brand),
            )
            Row(Modifier.fillMaxWidth()) {
                for ((index, effort) in efforts.withIndex()) {
                    val selected = effort == picker.selection.effort
                    Column(
                        Modifier
                            .weight(1f)
                            .heightIn(min = 48.dp)
                            .selectable(selected = selected, role = Role.RadioButton) { onEffort(effort) },
                        horizontalAlignment = Alignment.CenterHorizontally,
                    ) {
                        EffortDot(selected = selected, passed = index <= level)
                        Text(
                            text = effort.label,
                            color = if (selected) scheme.onBackground else scheme.onSurfaceVariant,
                            fontSize = 13.sp,
                            lineHeight = 18.sp,
                            fontWeight = FontWeight.SemiBold,
                        )
                    }
                }
            }
        }
    }
}

/** A parada: pequena e vazia; verde-água até a escolhida; a escolhida é maior, com o miolo da cor da folha. */
@Composable
private fun EffortDot(
    selected: Boolean,
    passed: Boolean,
) {
    val scheme = MaterialTheme.colorScheme
    val brand = braidBrand()
    val size: Dp = if (selected) 18.dp else 10.dp
    val margin: Dp = if (selected) 4.dp else 8.dp
    val border = if (selected) 5.dp else 2.dp
    val ring = if (selected || passed) brand else scheme.outline
    val fill = if (selected || !passed) scheme.surface else brand
    Box(
        Modifier
            .padding(vertical = margin)
            .size(size)
            .background(fill, CircleShape)
            .border(border, ring, CircleShape),
    )
}

/** O rodapé de uma resposta do modo modelo: "sonnet 5.5 · médio · anthropic", em mono. */
@Composable
internal fun ModelFooter(
    options: ModelOptions?,
    selection: ModelSelection,
) {
    Text(
        text = modelFooter(options, selection),
        modifier = Modifier.padding(top = 10.dp),
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        fontFamily = BraidMonoFont,
        fontSize = 12.sp,
        lineHeight = 16.sp,
    )
}
