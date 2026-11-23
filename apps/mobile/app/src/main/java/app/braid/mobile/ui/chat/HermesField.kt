package app.braid.mobile.ui.chat

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.compositeOver
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.layout.boundsInRoot
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.braid.mobile.core.designsystem.BraidIcons
import app.braid.mobile.core.designsystem.SvgIcon
import app.braid.mobile.core.designsystem.SvgPart
import app.braid.mobile.core.designsystem.braidTokens

/*
 * O campo do Hermes, um só desenho para o chat, a edição por IA dos detalhes, o pedido da tarefa de agente e o arquivo do
 * Hermes (`entity-ai-edit-bar.module.css` e `hermes-mark` no web): a linha de status com o robô no círculo verde-água, e o
 * cartão arredondado com o registro aberto, o texto, a onda que liga a transcrição e a seta de enviar.
 */

private const val VOICE_PRESSED_ALPHA = 0.16f
private const val DISABLED_ALPHA = 0.55f
private const val INPUT_DISABLED_ALPHA = 0.6f
private const val MAX_DRAFT_LINES = 5
private const val EMPHASIS_ALPHA = 0.45f
private const val SHADOW_ALPHA = 0.18f
private val MarkSize = 28.dp
private val ControlSize = 44.dp
private val FieldShape = RoundedCornerShape(28.dp)

/** O campo com o seletor de modelo no pe: um raio menor, como no canvas. */
private val ModelFieldShape = RoundedCornerShape(22.dp)
private val ContextShape = RoundedCornerShape(22.dp)

/**
 * O robô do Hermes no disco da linha de status (28 dp), animado como no web. Avisa ao voo onde está ([role]: o do chat
 * ou o de um detalhe) e some enquanto o disco que voa da barra pousa nele.
 */
@Composable
fun HermesMark(
    state: BotState,
    modifier: Modifier = Modifier,
    role: MarkRole = MarkRole.Dock,
) {
    val flight = LocalHermesFlight.current
    if (flight != null) {
        DisposableEffect(flight, role) {
            flight.markArrived(role)
            onDispose { flight.markLeft(role) }
        }
    }
    HermesBot(
        state,
        size = MarkSize,
        modifier =
            modifier
                .onGloballyPositioned { flight?.markMoved(role, it.boundsInRoot()) }
                .graphicsLayer { alpha = if (flight?.hidesMark(role) == true) 0f else 1f },
    )
}

/** A linha acima do campo: o robô no estado do pedido, o texto que o leitor de tela anuncia e, à direita, uma ação (fechar, cancelar). */
@Composable
fun HermesStatusLine(
    state: BotState,
    text: String,
    modifier: Modifier = Modifier,
    role: MarkRole = MarkRole.Dock,
    trailing: @Composable RowScope.() -> Unit = {},
) {
    val scheme = MaterialTheme.colorScheme
    val rise = rememberHermesRise(role)
    Row(
        modifier.fillMaxWidth().heightIn(min = MarkSize).padding(start = 6.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        HermesMark(state, role = role)
        Row(
            Modifier.weight(1f).hermesRise(rise, role),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = text,
                modifier = Modifier.weight(1f).semantics { liveRegion = LiveRegionMode.Polite },
                color = if (state == BotState.Error) scheme.error else scheme.onSurfaceVariant,
                fontSize = 14.sp,
                lineHeight = 20.sp,
            )
            trailing()
        }
    }
}

/** O registro a que o pedido se refere, dentro do campo: o ícone, a linha de cima ("Pedido · quando") e o título. */
@Composable
fun HermesContextCard(
    icon: List<SvgPart>,
    meta: String,
    title: String,
) {
    val scheme = MaterialTheme.colorScheme
    Row(
        Modifier
            .fillMaxWidth()
            .heightIn(min = 52.dp)
            .border(1.dp, scheme.outline, ContextShape)
            .padding(start = 6.dp, end = 16.dp, top = 5.dp, bottom = 5.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Box(Modifier.size(40.dp), contentAlignment = Alignment.Center) {
            SvgIcon(icon, size = 20.dp, color = scheme.onSurfaceVariant, strokeWidth = 1.75f, modifier = Modifier.clearAndSetSemantics {})
        }
        Column(Modifier.weight(1f)) {
            Text(
                meta,
                color = scheme.onSurfaceVariant,
                fontSize = 12.sp,
                lineHeight = 18.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                title,
                color = scheme.onBackground,
                fontSize = 15.sp,
                lineHeight = 22.sp,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

/** O texto do campo: o que está escrito, o exemplo, o rótulo do leitor de tela e se aceita digitação. */
class HermesDraft(
    val text: String,
    val onChange: (String) -> Unit,
    val placeholder: String,
    val label: String,
    val enabled: Boolean,
    /** O teclado mostra "enviar" e o Enter envia (o chat); nos detalhes o Enter quebra a linha. */
    val sendOnEnter: Boolean = false,
    val modifier: Modifier = Modifier,
)

/** A seta de enviar: cheia quando há o que mandar, contornada enquanto não há. */
class HermesSend(
    val enabled: Boolean,
    val label: String,
    val onSend: () -> Unit,
)

/**
 * O cartão do campo: borda que acende com o foco, o [context] acima (o registro aberto ou a janela livre) e a linha com o
 * texto, as [actions] (a onda da transcrição) e a seta de enviar.
 */
@Composable
fun HermesComposer(
    draft: HermesDraft,
    send: HermesSend,
    modifier: Modifier = Modifier,
    role: MarkRole = MarkRole.Dock,
    context: (@Composable ColumnScope.() -> Unit)? = null,
    actions: @Composable RowScope.() -> Unit = {},
    /** O painel do seletor de modelo (ADR 0019), que cresce do topo do proprio campo; vai com `weight(1f, fill = false)`. */
    panel: (@Composable ColumnScope.() -> Unit)? = null,
    /** O seletor de modelo: com ele, [actions] e a seta descem para uma linha embaixo do texto. */
    footer: (@Composable RowScope.() -> Unit)? = null,
    /** 0 a 1: com o painel aberto, a borda e a sombra do campo ficam mais fortes. */
    emphasis: Float = 0f,
) {
    val scheme = MaterialTheme.colorScheme
    val tokens = braidTokens()
    val rise = rememberHermesRise(role)
    val interaction = remember { MutableInteractionSource() }
    val focused by interaction.collectIsFocusedAsState()
    val shape = if (footer != null) ModelFieldShape else FieldShape
    val strong = lerp(scheme.outline, scheme.onBackground.copy(alpha = EMPHASIS_ALPHA).compositeOver(scheme.outline), emphasis)
    Column(
        modifier
            .hermesRise(rise, role)
            .fillMaxWidth()
            .shadow(
                12.dp * emphasis,
                shape,
                ambientColor = scheme.onBackground.copy(alpha = SHADOW_ALPHA),
                spotColor = scheme.onBackground.copy(alpha = SHADOW_ALPHA),
            ).background(scheme.surface, shape)
            .border(1.dp, if (focused) tokens.brand else strong, shape)
            .clip(shape)
            .padding(6.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        panel?.invoke(this)
        context?.invoke(this)
        Row(
            Modifier.padding(start = 12.dp),
            verticalAlignment = Alignment.Bottom,
            horizontalArrangement = Arrangement.spacedBy(2.dp),
        ) {
            BasicTextField(
                value = draft.text,
                onValueChange = draft.onChange,
                enabled = draft.enabled,
                maxLines = MAX_DRAFT_LINES,
                interactionSource = interaction,
                textStyle = MaterialTheme.typography.bodyMedium.copy(fontSize = 15.sp, lineHeight = 22.sp, color = scheme.onBackground),
                cursorBrush = SolidColor(tokens.brand),
                keyboardOptions = KeyboardOptions(imeAction = if (draft.sendOnEnter) ImeAction.Send else ImeAction.Default),
                keyboardActions = KeyboardActions(onSend = { if (send.enabled) send.onSend() }),
                modifier =
                    draft.modifier
                        .weight(1f)
                        .alpha(if (draft.enabled) 1f else INPUT_DISABLED_ALPHA)
                        .semantics { contentDescription = draft.label },
                decorationBox = { inner ->
                    Box(Modifier.heightIn(min = ControlSize).padding(vertical = 11.dp), contentAlignment = Alignment.CenterStart) {
                        if (draft.text.isEmpty()) Text(draft.placeholder, color = tokens.faint, fontSize = 15.sp, lineHeight = 22.sp)
                        inner()
                    }
                },
            )
            if (footer == null) {
                actions()
                SendButton(send)
            }
        }
        if (footer != null) {
            Row(
                Modifier.padding(start = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(2.dp),
            ) {
                footer()
                Box(Modifier.weight(1f))
                actions()
                SendButton(send)
            }
        }
    }
}

@Composable
private fun SendButton(send: HermesSend) {
    val scheme = MaterialTheme.colorScheme
    Box(
        Modifier
            .size(ControlSize)
            .clip(CircleShape)
            .then(if (send.enabled) Modifier.background(scheme.primary) else Modifier.border(1.dp, scheme.outline, CircleShape))
            .clickable(enabled = send.enabled, role = Role.Button, onClick = send.onSend)
            .semantics { contentDescription = send.label },
        contentAlignment = Alignment.Center,
    ) {
        SvgIcon(
            BraidIcons.arrowUp,
            size = 20.dp,
            color = if (send.enabled) scheme.onPrimary else scheme.outlineVariant,
            strokeWidth = 2f,
            modifier = Modifier.clearAndSetSemantics {},
        )
    }
}

/** O botão que liga e desliga a transcrição: a onda do Hermes, num círculo verde-água claro enquanto o microfone está aberto. */
@Composable
internal fun VoiceButton(
    listening: Boolean,
    enabled: Boolean,
    onClick: () -> Unit,
) {
    val scheme = MaterialTheme.colorScheme
    val tokens = braidTokens()
    Box(
        Modifier
            .size(ControlSize)
            .clip(CircleShape)
            .background(if (listening) tokens.brand.copy(alpha = VOICE_PRESSED_ALPHA) else Color.Transparent)
            .alpha(if (enabled || listening) 1f else DISABLED_ALPHA)
            .toggleable(value = listening, enabled = enabled || listening, role = Role.Switch, onValueChange = { onClick() })
            .semantics { contentDescription = if (listening) "Parar de transcrever" else "Transcrever o que eu disser" },
        contentAlignment = Alignment.Center,
    ) {
        HermesBotIcon(BotState.Listening, size = 22.dp, color = if (listening) tokens.brandAccent else scheme.onSurfaceVariant)
    }
}
