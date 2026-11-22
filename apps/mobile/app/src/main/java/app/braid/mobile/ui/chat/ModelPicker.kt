package app.braid.mobile.ui.chat

import android.provider.Settings
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.FiniteAnimationSpec
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.snap
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.layout
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import app.braid.mobile.core.designsystem.BraidMonoFont
import app.braid.mobile.core.designsystem.braidBrand
import app.braid.mobile.domain.chat.modelFooter
import app.braid.mobile.domain.chat.modelName
import app.braid.mobile.domain.chat.providerName
import app.braid.mobile.domain.chat.providerOf
import app.braid.mobile.domain.request.ModelEffort
import app.braid.mobile.domain.request.ModelOptions
import app.braid.mobile.domain.request.ModelProvider
import app.braid.mobile.domain.request.ModelSelection
import kotlin.math.max
import kotlin.math.roundToInt

// O seletor do modo modelo (canvas "Provedor, modelo e esforço", opção B · Gaveta): o botão no pé do campo, com as quatro
// barras do esforço e o modelo escolhido, e o painel que cresce do próprio campo. Quem os monta guarda se está aberto.

/** Os três pedidos do seletor ao chat: cada troca vale já e fica no aparelho. */
class ModelActions(
    val onProvider: (ModelProvider) -> Unit = {},
    val onModel: (String) -> Unit = {},
    val onEffort: (ModelEffort) -> Unit = {},
)

private val ExpandEasing = CubicBezierEasing(0.2f, 0.8f, 0.2f, 1f)
private val CollapseEasing = CubicBezierEasing(0.4f, 0f, 0.2f, 1f)
private const val EXPAND_MS = 460
private const val COLLAPSE_MS = 280
private const val RISE_MS = 360
private const val FADE_OUT_MS = 120
private const val SCRIM_ALPHA = 0.62f
private const val PANEL_MAX_SCREEN_FRACTION = 0.62f
private const val TINT_ALPHA = 0.14f

/** O atraso de cada um dos quatro blocos do painel ao abrir. */
private val BlockDelays = listOf(90, 140, 190, 240)
private val BarHeights = listOf(7.dp, 11.dp, 15.dp, 19.dp)

/** Quem desligou as animações no sistema (escala 0) não vê o painel crescer: ele aparece e some de uma vez. */
@Composable
private fun rememberReducedMotion(): Boolean {
    val resolver = LocalContext.current.contentResolver
    return remember(resolver) {
        runCatching { Settings.Global.getFloat(resolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) == 0f }.getOrDefault(false)
    }
}

/** Abrir leva 460 ms com a curva de saída suave; fechar, 280 ms. */
private fun <T> motion(
    open: Boolean,
    reduced: Boolean,
): FiniteAnimationSpec<T> =
    when {
        reduced -> snap()
        open -> tween(EXPAND_MS, easing = ExpandEasing)
        else -> tween(COLLAPSE_MS, easing = CollapseEasing)
    }

/** O quanto o painel está aberto, de 0 a 1; o campo usa o mesmo número para reforçar a borda e a sombra. */
@Composable
internal fun rememberPickerProgress(open: Boolean): Float {
    val reduced = rememberReducedMotion()
    val progress by animateFloatAsState(if (open) 1f else 0f, motion(open, reduced), label = "model-picker")
    return progress
}

/** O botão no pé do campo: as barras do esforço e, ao lado, o nome do modelo, o esforço e o provedor. */
@Composable
internal fun ModelPickerButton(
    picker: ModelPicker,
    open: Boolean,
    onToggle: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val scheme = MaterialTheme.colorScheme
    val brand = braidBrand()
    val (options, selection) = picker
    val name = modelName(options, selection)
    val effort = selection.effort.label
    val level = max(0, options.efforts.indexOf(selection.effort)) + 1
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    val description =
        "Modelo $name, esforço ${effort.lowercase()}, via ${providerName(options, selection.provider)}. Trocar"
    Row(
        modifier
            .heightIn(min = 48.dp)
            .clip(RoundedCornerShape(14.dp))
            .background(if (pressed || open) brand.copy(alpha = TINT_ALPHA) else Color.Transparent)
            .clickable(interactionSource = interaction, indication = null, role = Role.Button, onClick = onToggle)
            .padding(start = 10.dp, end = 12.dp)
            .semantics(mergeDescendants = true) {
                contentDescription = description
                stateDescription = if (open) "Aberto" else "Fechado"
            },
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Row(Modifier.height(19.dp), horizontalArrangement = Arrangement.spacedBy(2.dp), verticalAlignment = Alignment.Bottom) {
            for ((index, height) in BarHeights.withIndex()) {
                Box(
                    Modifier
                        .width(3.dp)
                        .height(height)
                        .background(if (index < level) brand else scheme.outline, RoundedCornerShape(1.dp)),
                )
            }
        }
        Column(Modifier.weight(1f, fill = false)) {
            Text(
                text = "$name · $effort",
                color = scheme.onBackground,
                fontSize = 13.sp,
                lineHeight = 18.sp,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                text = "via ${selection.provider.code}",
                color = scheme.onSurfaceVariant,
                fontFamily = BraidMonoFont,
                fontSize = 12.sp,
                lineHeight = 16.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

/**
 * O painel da escolha: cresce do topo do campo, empurrando-o para cima, e os quatro blocos sobem 12 dp em fila. Fechado, não
 * ocupa altura nem entra na leitura de tela.
 */
@Composable
internal fun ModelPanel(
    picker: ModelPicker,
    open: Boolean,
    actions: ModelActions,
    onDone: () -> Unit,
) {
    val reduced = rememberReducedMotion()
    val progress = rememberPickerProgress(open)
    if (!open && progress == 0f) return
    val maxHeight = (LocalConfiguration.current.screenHeightDp * PANEL_MAX_SCREEN_FRACTION).dp
    Box(
        Modifier
            .fillMaxWidth()
            .clipToBounds()
            .layout { measurable, constraints ->
                val placeable = measurable.measure(constraints)
                layout(placeable.width, (placeable.height * progress).roundToInt()) { placeable.placeRelative(0, 0) }
            }.then(if (open) Modifier else Modifier.clearAndSetSemantics {}),
    ) {
        Column(
            Modifier
                .fillMaxWidth()
                .heightIn(max = maxHeight)
                .verticalScroll(rememberScrollState())
                .padding(start = 12.dp, end = 12.dp, top = 16.dp, bottom = 12.dp),
            verticalArrangement = Arrangement.spacedBy(20.dp),
        ) {
            Rise(open, reduced, BlockDelays[0]) { ProviderBlock(picker, actions.onProvider) }
            Rise(open, reduced, BlockDelays[1]) { ModelBlock(picker, actions.onModel) }
            Rise(open, reduced, BlockDelays[2]) { EffortBlock(picker, actions.onEffort) }
            Rise(open, reduced, BlockDelays[3]) { DoneButton(onDone) }
        }
    }
}

/** Um bloco do painel: aparece e sobe 12 dp depois do atraso; ao fechar, os quatro saem juntos, sem espera. */
@Composable
private fun Rise(
    open: Boolean,
    reduced: Boolean,
    delayMs: Int,
    content: @Composable () -> Unit,
) {
    val spec: FiniteAnimationSpec<Float> =
        when {
            reduced -> snap()
            open -> tween(RISE_MS, delayMillis = delayMs, easing = ExpandEasing)
            else -> tween(FADE_OUT_MS, easing = LinearEasing)
        }
    val progress by animateFloatAsState(if (open) 1f else 0f, spec, label = "model-block")
    val rise = with(LocalDensity.current) { 12.dp.toPx() }
    Box(
        Modifier.graphicsLayer {
            alpha = progress
            translationY = rise * (1f - progress)
        },
    ) { content() }
}

@Composable
private fun SectionTitle(text: String) {
    Text(
        text = text.uppercase(),
        modifier = Modifier.padding(bottom = 10.dp).semantics { heading() },
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        fontFamily = BraidMonoFont,
        fontSize = 12.sp,
        lineHeight = 16.sp,
        letterSpacing = 0.1.em,
    )
}

/** O círculo de seleção: o anel e, escolhido, o ponto verde-água dentro. */
@Composable
private fun Radio(selected: Boolean) {
    val brand = braidBrand()
    Box(
        Modifier
            .size(18.dp)
            .border(2.dp, if (selected) brand else MaterialTheme.colorScheme.outlineVariant, CircleShape)
            .padding(3.dp),
    ) {
        if (selected) Box(Modifier.fillMaxSize().background(brand, CircleShape))
    }
}

@Composable
private fun ProviderBlock(
    picker: ModelPicker,
    onProvider: (ModelProvider) -> Unit,
) {
    val scheme = MaterialTheme.colorScheme
    val brand = braidBrand()
    Column {
        SectionTitle("Provedor")
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            for (provider in picker.options.providers) {
                val selected = provider.id == picker.selection.provider
                val shape = RoundedCornerShape(12.dp)
                Row(
                    Modifier
                        .weight(1f)
                        .heightIn(min = 48.dp)
                        .background(if (selected) brand.copy(alpha = TINT_ALPHA) else Color.Transparent, shape)
                        .border(1.dp, if (selected) brand else scheme.outline, shape)
                        .clip(shape)
                        .selectable(selected = selected, role = Role.RadioButton) { onProvider(provider.id) }
                        .padding(horizontal = 12.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        text = provider.name,
                        modifier = Modifier.weight(1f),
                        color = scheme.onBackground,
                        fontSize = 15.sp,
                        lineHeight = 20.sp,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Radio(selected)
                }
            }
        }
    }
}

@Composable
private fun ModelBlock(
    picker: ModelPicker,
    onModel: (String) -> Unit,
) {
    val scheme = MaterialTheme.colorScheme
    val brand = braidBrand()
    val shape = RoundedCornerShape(12.dp)
    val models =
        picker.options
            .providerOf(picker.selection.provider)
            ?.models
            .orEmpty()
    Column {
        SectionTitle("Modelo")
        Column(Modifier.fillMaxWidth().clip(shape).border(1.dp, scheme.outline, shape)) {
            for ((index, model) in models.withIndex()) {
                val selected = model.id == picker.selection.model
                if (index > 0) Box(Modifier.fillMaxWidth().height(1.dp).background(scheme.outline))
                Row(
                    Modifier
                        .fillMaxWidth()
                        .heightIn(min = 48.dp)
                        .background(if (selected) brand.copy(alpha = TINT_ALPHA) else Color.Transparent)
                        .selectable(selected = selected, role = Role.RadioButton) { onModel(model.id) }
                        .padding(horizontal = 14.dp),
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        text = model.name,
                        modifier = Modifier.weight(1f),
                        color = scheme.onBackground,
                        fontSize = 15.sp,
                        lineHeight = 20.sp,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Radio(selected)
                }
            }
        }
    }
}

/** O esforço: quatro paradas numa trilha; o verde vai da primeira até a escolhida, que é a maior. */
@Composable
private fun EffortBlock(
    picker: ModelPicker,
    onEffort: (ModelEffort) -> Unit,
) {
    val scheme = MaterialTheme.colorScheme
    val brand = braidBrand()
    val efforts = picker.options.efforts
    val level = max(0, efforts.indexOf(picker.selection.effort))
    Column {
        SectionTitle("Esforço")
        BoxWithConstraints(Modifier.fillMaxWidth()) {
            val step = maxWidth / max(1, efforts.size)
            val fill by animateDpAsState(step * level, label = "model-effort-fill")
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

/** A parada: pequena e vazia; verde-água até a escolhida; a escolhida é maior, com o miolo da cor do campo. */
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

@Composable
private fun DoneButton(onDone: () -> Unit) {
    val scheme = MaterialTheme.colorScheme
    Box(
        Modifier
            .fillMaxWidth()
            .heightIn(min = 48.dp)
            .clip(RoundedCornerShape(8.dp))
            .background(scheme.primary)
            .clickable(role = Role.Button, onClick = onDone),
        contentAlignment = Alignment.Center,
    ) {
        Text(text = "Selecionar", color = scheme.onPrimary, fontSize = 15.sp, lineHeight = 20.sp, fontWeight = FontWeight.SemiBold)
    }
}

/** O fundo que escurece a conversa enquanto o painel está aberto; tocar nele fecha. */
@Composable
internal fun ModelScrim(
    open: Boolean,
    onClose: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val progress = rememberPickerProgress(open)
    if (!open && progress == 0f) return
    Box(
        modifier
            .background(MaterialTheme.colorScheme.background.copy(alpha = SCRIM_ALPHA * progress))
            .then(if (open) Modifier.pointerInput(Unit) { detectTapGestures { onClose() } } else Modifier)
            .clearAndSetSemantics {},
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
