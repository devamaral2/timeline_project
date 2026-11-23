package app.braid.mobile.ui.aiedit

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.braid.mobile.core.designsystem.BraidIcons
import app.braid.mobile.core.designsystem.SvgIcon
import app.braid.mobile.core.designsystem.SvgPart
import app.braid.mobile.domain.chat.ModelPicker
import app.braid.mobile.domain.request.RequestStep
import app.braid.mobile.domain.task.TaskStatus
import app.braid.mobile.ui.chat.BotState
import app.braid.mobile.ui.chat.HermesComposer
import app.braid.mobile.ui.chat.HermesContextCard
import app.braid.mobile.ui.chat.HermesDraft
import app.braid.mobile.ui.chat.HermesSend
import app.braid.mobile.ui.chat.HermesStatusLine
import app.braid.mobile.ui.chat.ModelActions
import app.braid.mobile.ui.chat.ModelPanel
import app.braid.mobile.ui.chat.ModelPickerButton
import app.braid.mobile.ui.chat.VoiceButton
import app.braid.mobile.ui.chat.VoiceUiState
import app.braid.mobile.ui.chat.rememberPickerProgress

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

/**
 * O seletor de modelo no pé do campo (ADR 0019), o mesmo do chat: o que ele mostra, se o painel está aberto e as trocas.
 * Segue tocável com a barra travada ou um pedido em andamento: a troca vale para o próximo pedido.
 */
class AiEditBarPicker(
    val picker: ModelPicker,
    val open: Boolean,
    val onToggle: () -> Unit,
    val onDone: () -> Unit,
    val actions: ModelActions,
)

/**
 * O campo de conversa com a IA no pé dos detalhes: o resultado, o status, o registro aberto e a caixa com microfone e envio.
 * Com [picker], o campo ganha o seletor de modelo no pé e o painel que cresce dele; sem, é o campo simples (o arquivo do
 * Hermes, ou a entidade quando o servidor não oferece modelos).
 */
@Composable
fun AiEditBar(
    model: AiEditBarModel,
    actions: AiEditBarActions,
    modifier: Modifier = Modifier,
    picker: AiEditBarPicker? = null,
) {
    val scheme = MaterialTheme.colorScheme
    // Aberto o painel, a borda e a sombra do campo ficam mais fortes.
    val emphasis = rememberPickerProgress(picker?.open == true)
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
        HermesStatusLine(botState(model), model.statusText) {
            if (model.canDismiss) DismissButton(actions.onDismiss)
        }
        HermesComposer(
            draft =
                HermesDraft(
                    text = model.draft,
                    onChange = actions.onDraftChange,
                    placeholder = model.placeholder,
                    label = model.fieldLabel,
                    enabled = !model.locked,
                ),
            send =
                HermesSend(
                    enabled = model.canSend,
                    label = if (model.busy) "Aguardando a resposta" else "Enviar pedido",
                    onSend = actions.onSend,
                ),
            context = { HermesContextCard(model.context.icon, model.context.meta, model.context.title) },
            actions = {
                if (model.voice?.available == true) {
                    VoiceButton(listening = model.voice.listening, enabled = !model.locked, onClick = actions.onToggleVoice)
                }
            },
            // Com o seletor, o painel cresce do topo do campo e o seletor, a voz e o envio descem para a linha de baixo, como no chat.
            panel =
                picker?.let { shown ->
                    { ModelPanel(shown.picker, shown.open, shown.actions, shown.onDone, Modifier.weight(1f, fill = false)) }
                },
            footer =
                picker?.let { shown ->
                    { ModelPickerButton(shown.picker, shown.open, shown.onToggle, Modifier.weight(1f, fill = false)) }
                },
            emphasis = emphasis,
        )
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
        TaskStatus.Failed, TaskStatus.Cancel -> BraidIcons.close
        TaskStatus.Running -> BraidIcons.spinner
        else -> BraidIcons.circle
    }

/** O robô da linha de status, como no web: ouvindo, pensando enquanto o pedido anda, o ✓ ou a exclamação no fim, parado antes. */
private fun botState(model: AiEditBarModel): BotState =
    when {
        model.voice?.listening == true -> BotState.Listening
        model.busy -> BotState.Thinking
        model.failed -> BotState.Error
        model.canDismiss -> BotState.Done
        else -> BotState.Idle
    }

@Composable
private fun DismissButton(onDismiss: () -> Unit) {
    Box(
        Modifier
            .size(44.dp)
            .clip(CircleShape)
            .clickable(role = Role.Button, onClick = onDismiss)
            .semantics { contentDescription = "Fechar resultado" },
        contentAlignment = Alignment.Center,
    ) {
        SvgIcon(
            BraidIcons.close,
            size = 16.dp,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.clearAndSetSemantics {},
        )
    }
}
