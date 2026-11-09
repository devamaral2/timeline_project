@file:Suppress("ktlint:standard:function-naming")

package app.braid.mobile.ui.chat

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.braid.mobile.core.designsystem.LucideIcons
import app.braid.mobile.core.designsystem.braidBrand
import app.braid.mobile.core.designsystem.braidOnBrand

/** O que o campo diz que vai editar: “Peça ao Hermes para editar este evento” (`EDIT_TARGET_LABELS` do web). */
internal fun editTargetLabel(entityType: String): String =
    when (entityType) {
        "event" -> "este evento"
        "task" -> "esta tarefa"
        "meal_note" -> "esta refeição"
        "sleep_note" -> "esta nota de sono"
        "training_note" -> "este treino"
        "skill_note" -> "esta skill"
        "agent_note" -> "este agente"
        else -> "esta nota"
    }

/** O tipo de edição por IA de uma nota (`editEntityTypeOfNote` do web); `null` quando a nota não se edita (roteador). */
internal fun editEntityTypeOfNote(noteType: String): String? =
    when (noteType) {
        "text" -> "note"
        "meal" -> "meal_note"
        "sleep" -> "sleep_note"
        "training" -> "training_note"
        "skill" -> "skill_note"
        "agent" -> "agent_note"
        else -> null
    }

/**
 * O campo de conversa com a IA no pé das telas de detalhe (ADR 006; `EntityAiEditBar` do web): o que se escreve edita
 * a entidade aberta. O servidor escolhe o agente pelo tipo; aqui só se envia o texto e se acompanha o processo na
 * mesma caixa do chat. Sem microfone aqui (a voz fica na barra da agenda), como no compositor do chat.
 */
@Composable
fun EntityAiEditBar(
    entityType: String,
    entityId: String,
    onEdited: () -> Unit,
    modifier: Modifier = Modifier,
    disabledReason: String? = null,
    viewModel: EntityAiEditViewModel = hiltViewModel(key = "$entityType:$entityId"),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    LaunchedEffect(viewModel) {
        viewModel.effects.collect { if (it is EntityAiEditEffect.Edited) onEdited() }
    }
    var text by rememberSaveable(entityId) { mutableStateOf("") }
    EntityAiEditContent(
        label = editTargetLabel(entityType),
        state = state,
        text = text,
        disabledReason = disabledReason,
        onTextChange = { text = it },
        onSend = {
            val request = text
            if (viewModel.submit(request, entityType, entityId)) text = ""
        },
        onDismiss = viewModel::dismiss,
        modifier = modifier,
    )
}

@Composable
internal fun EntityAiEditContent(
    label: String,
    state: EntityAiEditUiState,
    text: String,
    disabledReason: String?,
    onTextChange: (String) -> Unit,
    onSend: () -> Unit,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val colors = MaterialTheme.colorScheme
    val enabled = !state.busy && disabledReason == null
    Column(
        modifier =
            modifier
                .fillMaxWidth()
                .navigationBarsPadding()
                .imePadding()
                .padding(horizontal = 16.dp, vertical = 8.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        if (state.phase != EntityAiEditPhase.Idle) {
            Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.SpaceBetween) {
                ProcessBox(process = state.process, modifier = Modifier.weight(1f))
                if (!state.busy) {
                    Box(
                        modifier =
                            Modifier
                                .size(44.dp)
                                .clip(CircleShape)
                                .clickable(onClickLabel = "Fechar resultado", onClick = onDismiss)
                                .semantics { contentDescription = "Fechar resultado" },
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(Icons.Filled.Close, contentDescription = null, tint = colors.onSurfaceVariant, modifier = Modifier.size(18.dp))
                    }
                }
            }
            if (state.phase == EntityAiEditPhase.Failed && state.process?.message == null) {
                Text(text = state.error.orEmpty(), color = colors.error, fontSize = 13.sp, lineHeight = 20.sp)
            }
        }
        disabledReason?.let { Text(text = it, color = colors.onSurfaceVariant, fontSize = 13.sp) }
        EditField(label, text, enabled, state.busy, onTextChange, onSend)
    }
}

@Composable
private fun EditField(
    label: String,
    text: String,
    enabled: Boolean,
    busy: Boolean,
    onTextChange: (String) -> Unit,
    onSend: () -> Unit,
) {
    val colors = MaterialTheme.colorScheme
    val interaction = remember { MutableInteractionSource() }
    val focused by interaction.collectIsFocusedAsState()
    val shape = RoundedCornerShape(26.dp)
    val canSend = enabled && text.isNotBlank()
    Row(
        modifier =
            Modifier
                .fillMaxWidth()
                .heightIn(min = 52.dp)
                .clip(shape)
                .background(colors.surfaceVariant)
                .border(BorderStroke(1.dp, if (focused) braidBrand() else colors.outline), shape)
                .padding(start = 18.dp, end = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        BasicTextField(
            modifier = Modifier.weight(1f).semantics { contentDescription = "Pedir à IA para editar $label" },
            value = text,
            onValueChange = { onTextChange(it.take(EntityAiEditViewModel.MAX_LENGTH)) },
            enabled = enabled,
            maxLines = 4,
            interactionSource = interaction,
            textStyle = MaterialTheme.typography.bodyLarge.copy(color = colors.onSurface, fontSize = 16.sp),
            cursorBrush = SolidColor(braidBrand()),
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Send),
            keyboardActions = KeyboardActions(onSend = { if (canSend) onSend() }),
            decorationBox = { inner ->
                Box(modifier = Modifier.padding(vertical = 8.dp)) {
                    if (text.isEmpty()) {
                        Text(
                            text = "Peça ao Hermes para editar $label",
                            style = MaterialTheme.typography.bodyLarge.copy(fontSize = 16.sp),
                            color = colors.onSurfaceVariant,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                    inner()
                }
            },
        )
        Box(
            modifier =
                Modifier
                    .size(44.dp)
                    .clip(CircleShape)
                    .clickable(enabled = canSend, onClickLabel = "Enviar pedido", onClick = onSend)
                    .semantics { contentDescription = "Enviar pedido" },
            contentAlignment = Alignment.Center,
        ) {
            Box(
                modifier =
                    Modifier
                        .size(36.dp)
                        .alpha(if (canSend || busy) 1f else 0.4f)
                        .clip(CircleShape)
                        .background(braidBrand()),
                contentAlignment = Alignment.Center,
            ) {
                if (busy) {
                    CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp, color = braidOnBrand())
                } else {
                    Icon(LucideIcons.arrowUp(2.2f), contentDescription = null, tint = braidOnBrand(), modifier = Modifier.size(18.dp))
                }
            }
        }
    }
}
