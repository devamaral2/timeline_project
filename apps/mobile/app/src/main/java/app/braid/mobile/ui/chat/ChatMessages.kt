package app.braid.mobile.ui.chat

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import app.braid.mobile.core.designsystem.BraidIcons
import app.braid.mobile.core.designsystem.BraidMonoFont
import app.braid.mobile.core.designsystem.SvgIcon
import app.braid.mobile.core.designsystem.braidTokens
import app.braid.mobile.domain.chat.HermesStep
import app.braid.mobile.domain.chat.chatEntityText
import app.braid.mobile.domain.request.AgentRequest
import app.braid.mobile.domain.request.EntityKind
import app.braid.mobile.domain.request.RequestEntity
import app.braid.mobile.domain.request.RequestOperation
import app.braid.mobile.domain.request.TraceKind
import app.braid.mobile.domain.request.TraceStatus
import app.braid.mobile.domain.request.isOpenRequest
import app.braid.mobile.domain.task.TaskStatus

/** Para onde leva cada registro que a resposta tocou; `null` quando a tela de destino ainda não existe, e a linha é só texto. */
class ChatEntityLinks(
    val openTask: ((String) -> Unit)? = null,
    val openDocument: ((String) -> Unit)? = null,
) {
    fun opener(entity: RequestEntity): (() -> Unit)? {
        if (entity.operation == RequestOperation.Delete) return null
        val open = if (entity.kind == EntityKind.Task) openTask else openDocument
        return open?.let { { it(entity.id) } }
    }
}

/** Um círculo que gira: o passo em andamento e o "Entendendo o pedido…". */
@Composable
internal fun Spinner(
    size: Dp,
    color: Color,
    modifier: Modifier = Modifier,
) {
    val angle by rememberInfiniteTransition(label = "spinner").animateFloat(
        initialValue = 0f,
        targetValue = 360f,
        animationSpec = infiniteRepeatable(tween(1000, easing = LinearEasing), RepeatMode.Restart),
        label = "spinnerAngle",
    )
    SvgIcon(BraidIcons.spinner, size = size, color = color, strokeWidth = 2.2f, modifier = modifier.rotate(angle))
}

/** A mensagem de quem escreve: um cartão com fio. */
@Composable
internal fun UserBubble(message: ChatMessage.User) {
    Box(
        Modifier
            .fillMaxWidth()
            .background(MaterialTheme.colorScheme.surface, RoundedCornerShape(5.dp))
            .border(1.dp, MaterialTheme.colorScheme.outline, RoundedCornerShape(5.dp))
            .padding(horizontal = 14.dp, vertical = 10.dp),
    ) {
        Text(
            text = message.text,
            style = MaterialTheme.typography.bodyMedium.copy(fontSize = 15.sp, lineHeight = 22.sp),
            color = MaterialTheme.colorScheme.onBackground,
        )
    }
}

/** O pedido que não deu certo: o motivo e, se houver texto, "Tentar de novo" sem perdê-lo. */
@Composable
internal fun ErrorBubble(
    message: ChatMessage.Error,
    onRetry: (() -> Unit)?,
) {
    val scheme = MaterialTheme.colorScheme
    Column(
        Modifier
            .fillMaxWidth()
            .border(1.dp, scheme.error.copy(alpha = 0.4f), RoundedCornerShape(5.dp))
            .padding(horizontal = 14.dp, vertical = 10.dp),
    ) {
        Text(text = message.text, color = scheme.error, fontSize = 13.sp, lineHeight = 20.sp)
        if (onRetry != null && message.retryText.isNotEmpty()) {
            Row(
                Modifier
                    .heightIn(min = 44.dp)
                    .clickable(role = Role.Button, onClick = onRetry),
                horizontalArrangement = Arrangement.spacedBy(6.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                SvgIcon(
                    ChatIcons.retry,
                    size = 14.dp,
                    color = scheme.onBackground,
                    strokeWidth = 2f,
                    modifier = Modifier.clearAndSetSemantics {},
                )
                Text(text = "Tentar de novo", color = scheme.onBackground, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
            }
        }
    }
}

/** A prévia de cada registro que um pedido criou, alterou ou apagou: o ícone do tipo, o que aconteceu e o nome. */
@Composable
internal fun EntityRows(
    entities: List<RequestEntity>,
    links: ChatEntityLinks,
    onOpened: () -> Unit,
) {
    if (entities.isEmpty()) return
    val scheme = MaterialTheme.colorScheme
    Column(Modifier.fillMaxWidth().padding(top = 12.dp).semantics { contentDescription = "Registros desta resposta" }) {
        Box(Modifier.fillMaxWidth().height(1.dp).background(scheme.outline))
        for (entity in entities) {
            val open = links.opener(entity)
            val deleted = entity.operation == RequestOperation.Delete
            Row(
                modifier =
                    Modifier
                        .fillMaxWidth()
                        .heightIn(min = 64.dp)
                        .then(
                            if (open != null) {
                                Modifier.clickable(role = Role.Button) {
                                    open()
                                    onOpened()
                                }
                            } else {
                                Modifier
                            },
                        ).semantics(mergeDescendants = true) {},
                horizontalArrangement = Arrangement.spacedBy(14.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Box(
                    Modifier.size(40.dp).border(1.dp, scheme.outline, RoundedCornerShape(5.dp)),
                    contentAlignment = Alignment.Center,
                ) {
                    SvgIcon(
                        if (entity.kind == EntityKind.Task) BraidIcons.calendarDays else BraidIcons.fileText,
                        size = 20.dp,
                        color = scheme.onSurfaceVariant,
                        strokeWidth = 1.75f,
                    )
                }
                Column(Modifier.weight(1f)) {
                    Text(text = chatEntityText(entity), color = scheme.onSurfaceVariant, fontSize = 12.sp, lineHeight = 18.sp)
                    Text(
                        text = entity.name,
                        color = if (deleted) scheme.onSurfaceVariant else scheme.onBackground,
                        fontSize = 15.sp,
                        lineHeight = 22.sp,
                        fontWeight = FontWeight.SemiBold,
                        textDecoration = if (deleted) TextDecoration.LineThrough else null,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
                if (open != null) SvgIcon(BraidIcons.chevronRight, size = 16.dp, color = scheme.outlineVariant, strokeWidth = 2f)
            }
            Box(Modifier.fillMaxWidth().height(1.dp).background(scheme.outline))
        }
    }
}

/** Como a caixa mostra cada passo: a marca e o texto que o leitor de tela ouve. */
private fun stepText(status: TaskStatus): String =
    when (status) {
        TaskStatus.Queued, TaskStatus.Waiting -> "aguardando"
        TaskStatus.Running -> "em andamento"
        TaskStatus.Done -> "concluído"
        TaskStatus.Failed -> "falhou"
        TaskStatus.Cancel -> "cancelado"
        else -> "aguardando"
    }

/**
 * A caixa de processo: o título e a lista de passos, com marca ao concluir e ao falhar e, abaixo, a prévia de cada registro
 * criado ou alterado. Todo texto vem predefinido do servidor; só a resposta (quando o pedido termina) é livre. Enquanto o
 * pedido está aberto, um botão cancela.
 */
@Composable
internal fun ProcessBox(
    request: AgentRequest?,
    links: ChatEntityLinks,
    onOpenEntity: () -> Unit,
    onCancel: (() -> Unit)?,
) {
    val scheme = MaterialTheme.colorScheme
    val steps = request?.steps.orEmpty()
    val query = steps.firstOrNull { it.result != null }?.result
    val open = request == null || isOpenRequest(request.status)
    Column(Modifier.fillMaxWidth().semantics { contentDescription = "Processo" }, verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(
            text = "REALIZANDO PROCESSOS:",
            color = scheme.onSurfaceVariant,
            fontFamily = BraidMonoFont,
            fontSize = 12.sp,
            lineHeight = 16.sp,
            fontWeight = FontWeight.Medium,
            letterSpacing = 0.1.em,
        )
        if (steps.isEmpty() && open) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                Spinner(14.dp, scheme.onSurfaceVariant)
                Text(text = "Entendendo o pedido…", color = scheme.onSurfaceVariant, fontSize = 12.sp)
            }
        }
        Column(Modifier.semantics { contentDescription = "Passos do processo" }, verticalArrangement = Arrangement.spacedBy(6.dp)) {
            for (step in steps) StepRow(step.label, step.status)
        }
        if (query != null) {
            Column(Modifier.semantics { contentDescription = "Resultado da consulta" }) {
                if (query.rows.isEmpty()) {
                    Text(text = "Nenhum resultado.", color = scheme.onSurfaceVariant, fontSize = 12.sp)
                } else {
                    Column(Modifier.horizontalScroll(rememberScrollState())) {
                        Row { for (column in query.columns) QueryCell(column, header = true) }
                        for (row in query.rows) Row { for (cell in row) QueryCell(cell, header = false) }
                    }
                }
                if (query.truncated) {
                    Text(
                        text = "Mostrando só as primeiras linhas.",
                        color = scheme.onSurfaceVariant,
                        fontSize = 12.sp,
                        modifier = Modifier.padding(top = 6.dp),
                    )
                }
            }
        }
        EntityRows(request?.entities.orEmpty(), links, onOpenEntity)
        val message = request?.message
        if (request?.status == TaskStatus.Done && !message.isNullOrEmpty()) {
            Text(text = message, fontSize = 15.sp, lineHeight = 24.sp, color = scheme.onBackground)
        }
        if (onCancel != null && request != null && isOpenRequest(request.status)) {
            Box(
                Modifier
                    .heightIn(min = 44.dp)
                    .clickable(role = Role.Button, onClick = onCancel),
                contentAlignment = Alignment.CenterStart,
            ) {
                Text(text = "Cancelar pedido", color = scheme.onBackground, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
            }
        }
    }
}

@Composable
private fun QueryCell(
    text: String,
    header: Boolean,
) {
    val scheme = MaterialTheme.colorScheme
    Text(
        text = text,
        modifier = Modifier.widthIn(min = 88.dp).padding(end = 8.dp, top = 4.dp, bottom = 4.dp),
        color = if (header) scheme.onSurfaceVariant else scheme.onBackground,
        fontSize = 12.sp,
        fontWeight = if (header) FontWeight.SemiBold else FontWeight.Normal,
        maxLines = 1,
    )
}

@Composable
private fun StepRow(
    label: String,
    status: TaskStatus,
) {
    val scheme = MaterialTheme.colorScheme
    val tokens = braidTokens()
    val tint =
        when (status) {
            TaskStatus.Done -> tokens.brand
            TaskStatus.Failed -> scheme.error
            TaskStatus.Running -> scheme.tertiary
            else -> scheme.onSurfaceVariant
        }
    Row(
        Modifier.semantics(mergeDescendants = true) { stateDescription = stepText(status) },
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(14.dp), contentAlignment = Alignment.Center) {
            when (status) {
                TaskStatus.Done -> SvgIcon(BraidIcons.check, size = 14.dp, color = tint, strokeWidth = 2.2f)
                TaskStatus.Failed -> SvgIcon(BraidIcons.close, size = 14.dp, color = tint, strokeWidth = 2.2f)
                TaskStatus.Running -> Spinner(14.dp, tint)
                else -> SvgIcon(BraidIcons.circle, size = 14.dp, color = tint, strokeWidth = 2.2f)
            }
        }
        Text(text = label, color = scheme.onSurfaceVariant, fontFamily = BraidMonoFont, fontSize = 12.sp, lineHeight = 18.sp)
    }
}

/**
 * Os passos do Hermes, como o agente os dá: cada ferramenta numa linha, com o que ele mostrou (comando, arquivo, busca), e
 * cada pensamento recolhido, que se abre para ler. Ao vivo enquanto ele trabalha e, depois, o registro do que foi feito.
 */
@Composable
internal fun HermesSteps(
    steps: List<HermesStep>,
    running: Boolean,
) {
    val scheme = MaterialTheme.colorScheme
    val tokens = braidTokens()
    Column(Modifier.fillMaxWidth().semantics { contentDescription = "Passos do Hermes" }) {
        for (step in steps) {
            if (step.kind == TraceKind.Thought) {
                var expanded by rememberSaveable(step.id) { mutableStateOf(false) }
                Column(Modifier.fillMaxWidth().heightIn(min = 30.dp)) {
                    Row(
                        Modifier
                            .heightIn(min = 30.dp)
                            .clickable(role = Role.Button) { expanded = !expanded }
                            .semantics { stateDescription = if (expanded) "aberto" else "fechado" },
                        horizontalArrangement = Arrangement.spacedBy(4.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        SvgIcon(
                            BraidIcons.chevronRight,
                            size = 14.dp,
                            color = scheme.onSurfaceVariant,
                            strokeWidth = 2f,
                            modifier = Modifier.rotate(if (expanded) 90f else 0f),
                        )
                        Text(
                            text = step.label,
                            color = scheme.onSurfaceVariant,
                            fontFamily = BraidMonoFont,
                            fontSize = 12.sp,
                            lineHeight = 18.sp,
                        )
                    }
                    if (expanded && step.detail != null) {
                        Text(
                            text = step.detail,
                            modifier = Modifier.padding(start = 18.dp, bottom = 6.dp),
                            color = scheme.onSurfaceVariant,
                            fontFamily = BraidMonoFont,
                            fontSize = 12.sp,
                            lineHeight = 18.sp,
                        )
                    }
                }
            } else {
                val tint =
                    when (step.status) {
                        TraceStatus.Done -> tokens.brand
                        TraceStatus.Failed -> scheme.error
                        else -> scheme.tertiary
                    }
                Row(
                    Modifier
                        .fillMaxWidth()
                        .heightIn(
                            min = 30.dp,
                        ).semantics(mergeDescendants = true) { stateDescription = step.status.text },
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Box(Modifier.size(14.dp), contentAlignment = Alignment.Center) {
                        when (step.status) {
                            TraceStatus.Done -> SvgIcon(BraidIcons.check, size = 14.dp, color = tint, strokeWidth = 2.2f)
                            TraceStatus.Failed -> SvgIcon(BraidIcons.close, size = 14.dp, color = tint, strokeWidth = 2.2f)
                            else -> Spinner(14.dp, tint)
                        }
                    }
                    Text(
                        text = step.label,
                        color = scheme.onSurfaceVariant,
                        fontFamily = BraidMonoFont,
                        fontSize = 12.sp,
                        lineHeight = 18.sp,
                    )
                    if (step.detail != null) {
                        Text(
                            text = step.detail,
                            modifier =
                                Modifier
                                    .weight(
                                        1f,
                                        fill = false,
                                    ).background(scheme.secondary, RoundedCornerShape(4.dp))
                                    .padding(horizontal = 6.dp, vertical = 1.dp),
                            color = scheme.onSurfaceVariant,
                            fontFamily = BraidMonoFont,
                            fontSize = 12.sp,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                }
            }
        }
        // `running` só existe para o leitor de tela: o último passo girando já diz que o agente trabalha.
        if (running && steps.isEmpty()) Spinner(14.dp, scheme.tertiary)
    }
}
