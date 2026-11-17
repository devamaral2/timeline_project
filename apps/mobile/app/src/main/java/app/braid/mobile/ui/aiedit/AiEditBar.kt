package app.braid.mobile.ui.aiedit

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.braid.mobile.core.designsystem.BraidIcons
import app.braid.mobile.core.designsystem.SvgIcon
import app.braid.mobile.core.designsystem.SvgPart
import app.braid.mobile.core.designsystem.braidBrand
import app.braid.mobile.core.designsystem.svgCircle
import app.braid.mobile.domain.request.RequestStep
import app.braid.mobile.domain.task.TaskStatus
import app.braid.mobile.ui.chat.VoiceButton
import app.braid.mobile.ui.chat.VoiceUiState
import app.braid.mobile.ui.taskdetail.DetailIcons

/** O registro que o pedido edita, mostrado acima do campo: o ícone, "Tarefa · sex., 18 set., 09:00" e o nome. */
data class AiEditContext(
    val icon: List<SvgPart>,
    val meta: String,
    val title: String,
)

/**
 * Tudo o que a barra de edição por IA mostra, venha de onde vier: a de uma entidade ([EntityEditViewModel], ADR 0006) e a do
 * arquivo do Hermes (`AgentFileViewModel`, ADR 0005) desenham a mesma barra, cada uma com o seu motor.
 */
data class AiEditBarModel(
    val draft: String,
    val placeholder: String,
    val fieldLabel: String,
    val statusText: String,
    val context: AiEditContext,
    /** A caixa e o microfone ficam desligados: pedido em andamento ou refeição em cálculo. */
    val locked: Boolean,
    val canSend: Boolean,
    /** O pedido anda: o botão de enviar diz que espera a resposta. */
    val busy: Boolean,
    val canDismiss: Boolean,
    /** O que o pedido respondeu ou o motivo da falha. */
    val message: String? = null,
    val failed: Boolean = false,
    /** A mensagem é um erro de envio: o leitor de tela a anuncia na hora. */
    val messageAlert: Boolean = false,
    val steps: List<RequestStep> = emptyList(),
    /** Por que a barra está desligada (por exemplo, a refeição ainda está sendo gerada). */
    val reason: String? = null,
    /** `null` quando a barra não dita (o arquivo do Hermes). */
    val voice: VoiceUiState? = null,
    /** O rótulo da seção para o leitor de tela. */
    val sectionLabel: String? = null,
)

class AiEditBarActions(
    val onDraftChange: (String) -> Unit,
    val onSend: () -> Unit,
    val onDismiss: () -> Unit,
    val onToggleVoice: () -> Unit = {},
)

private val CloseIcon = listOf(SvgPart("M18 6 6 18"), SvgPart("m6 6 12 12"))
private val CircleMark = listOf(SvgPart(svgCircle(12f, 12f, 10f)))
private val SpinnerMark = listOf(SvgPart("M21 12a9 9 0 1 1-6.219-8.56"))

private const val MAX_DRAFT_LINES = 5
private const val PLACEHOLDER_ALPHA = 0.7f
private val FieldShape = RoundedCornerShape(18.dp)

/** O campo de conversa com a IA no pé dos detalhes: o resultado, o status, o registro aberto e a caixa com microfone e envio. */
@Composable
fun AiEditBar(
    model: AiEditBarModel,
    actions: AiEditBarActions,
    modifier: Modifier = Modifier,
) {
    val scheme = MaterialTheme.colorScheme
    Column(
        modifier.semantics { model.sectionLabel?.let { contentDescription = it } },
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        if (model.steps.isNotEmpty()) StepList(model.steps)
        model.message?.let {
            Text(
                it,
                modifier = Modifier.semantics { if (model.messageAlert) liveRegion = LiveRegionMode.Assertive },
                color = if (model.failed) scheme.error else scheme.onBackground,
                fontSize = 15.sp,
                lineHeight = 22.sp,
            )
        }
        model.reason?.let { Text(it, color = scheme.onSurfaceVariant, fontSize = 13.sp, lineHeight = 20.sp) }
        StatusRow(model, actions.onDismiss)
        ContextChip(model.context)
        DraftField(model, actions)
        model.voice?.notice?.let {
            Text(
                it,
                modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
                color = scheme.error,
                fontSize = 13.sp,
                lineHeight = 20.sp,
            )
        }
    }
}

@Composable
private fun StepList(steps: List<RequestStep>) {
    val scheme = MaterialTheme.colorScheme
    Column(
        Modifier.semantics { contentDescription = "Passos do pedido" },
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        steps.forEach { step ->
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                SvgIcon(
                    stepMark(step.status),
                    size = 16.dp,
                    color = if (step.status == TaskStatus.Failed) scheme.error else scheme.onSurfaceVariant,
                    modifier = Modifier.clearAndSetSemantics {},
                )
                Text(step.label, color = scheme.onBackground, fontSize = 14.sp, lineHeight = 20.sp)
            }
        }
    }
}

/** O ✓ do passo pronto, o ✕ do que falhou ou foi cancelado, o arco do que roda e o círculo do que espera. */
private fun stepMark(status: TaskStatus): List<SvgPart> =
    when (status) {
        TaskStatus.Done -> BraidIcons.check
        TaskStatus.Failed, TaskStatus.Cancel -> CloseIcon
        TaskStatus.Running -> SpinnerMark
        else -> CircleMark
    }

@Composable
private fun StatusRow(
    model: AiEditBarModel,
    onDismiss: () -> Unit,
) {
    val scheme = MaterialTheme.colorScheme
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(
            model.statusText,
            modifier = Modifier.weight(1f, fill = false).semantics { liveRegion = LiveRegionMode.Polite },
            color = scheme.onSurfaceVariant,
            fontSize = 13.sp,
            lineHeight = 20.sp,
        )
        if (model.canDismiss) {
            Box(
                Modifier
                    .size(32.dp)
                    .clip(CircleShape)
                    .clickable(role = Role.Button, onClick = onDismiss)
                    .semantics { contentDescription = "Fechar resultado" },
                contentAlignment = Alignment.Center,
            ) {
                SvgIcon(CloseIcon, size = 16.dp, color = scheme.onSurfaceVariant, modifier = Modifier.clearAndSetSemantics {})
            }
        }
    }
}

@Composable
private fun ContextChip(context: AiEditContext) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        SvgIcon(
            context.icon,
            size = 18.dp,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.clearAndSetSemantics {},
        )
        Column {
            Text(context.meta, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp, lineHeight = 18.sp)
            Text(
                context.title,
                color = MaterialTheme.colorScheme.onBackground,
                fontSize = 14.sp,
                lineHeight = 20.sp,
                fontWeight = FontWeight.SemiBold,
            )
        }
    }
}

@Composable
private fun DraftField(
    model: AiEditBarModel,
    actions: AiEditBarActions,
) {
    val scheme = MaterialTheme.colorScheme
    val interaction = remember { MutableInteractionSource() }
    val focused by interaction.collectIsFocusedAsState()
    Row(
        Modifier
            .fillMaxWidth()
            .border(1.dp, if (focused) braidBrand() else scheme.outline, FieldShape)
            .padding(start = 14.dp, end = 4.dp),
        verticalAlignment = Alignment.Bottom,
    ) {
        BasicTextField(
            value = model.draft,
            onValueChange = actions.onDraftChange,
            enabled = !model.locked,
            interactionSource = interaction,
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Default),
            textStyle = MaterialTheme.typography.bodyLarge.copy(color = scheme.onBackground, fontSize = 15.sp, lineHeight = 22.sp),
            cursorBrush = SolidColor(braidBrand()),
            maxLines = MAX_DRAFT_LINES,
            modifier = Modifier.weight(1f).semantics { contentDescription = model.fieldLabel },
            decorationBox = { inner ->
                Box(Modifier.defaultMinSize(minHeight = 44.dp).padding(vertical = 11.dp), contentAlignment = Alignment.CenterStart) {
                    if (model.draft.isEmpty()) {
                        Text(
                            model.placeholder,
                            color = scheme.onSurfaceVariant.copy(alpha = PLACEHOLDER_ALPHA),
                            fontSize = 15.sp,
                            lineHeight = 22.sp,
                        )
                    }
                    inner()
                }
            },
        )
        if (model.voice?.available == true) {
            Box(Modifier.size(48.dp), contentAlignment = Alignment.Center) {
                VoiceButton(listening = model.voice.listening, enabled = !model.locked, onClick = actions.onToggleVoice)
            }
        }
        val ready = model.canSend
        Box(
            Modifier
                .size(48.dp)
                .clip(CircleShape)
                .then(if (ready) Modifier.background(scheme.primary) else Modifier.border(1.dp, scheme.outline, CircleShape))
                .clickable(enabled = ready, role = Role.Button, onClick = actions.onSend)
                .semantics { contentDescription = if (model.busy) "Aguardando a resposta" else "Enviar pedido" },
            contentAlignment = Alignment.Center,
        ) {
            SvgIcon(
                DetailIcons.arrowUp,
                size = 20.dp,
                color = if (ready) scheme.onPrimary else scheme.outline,
                strokeWidth = 2f,
                modifier = Modifier.clearAndSetSemantics {},
            )
        }
    }
}
