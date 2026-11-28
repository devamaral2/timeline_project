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
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.braid.mobile.core.designsystem.BraidIcons
import app.braid.mobile.core.designsystem.SvgIcon
import app.braid.mobile.domain.chat.chatEntityText
import app.braid.mobile.domain.request.AgentRequest
import app.braid.mobile.domain.request.EntityKind
import app.braid.mobile.domain.request.QueryTable
import app.braid.mobile.domain.request.RequestEntity
import app.braid.mobile.domain.request.RequestOperation
import app.braid.mobile.domain.request.TraceStatus
import app.braid.mobile.domain.task.TaskStatus
import app.braid.mobile.domain.task.isOpenAgentStatus
import app.braid.mobile.domain.task.isSuccessAgentStatus

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

/** A mensagem de quem escreve: a faixa reta do Hermes, de largura inteira, um cartão com fio (o balão da opção B não ficou). */
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
    modifier: Modifier = Modifier,
) {
    if (entities.isEmpty()) return
    val scheme = MaterialTheme.colorScheme
    Column(modifier.fillMaxWidth().padding(top = 12.dp).semantics { contentDescription = "Registros desta resposta" }) {
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

/** A resposta escrita de um pedido por passos: só quando ele termina bem. */
internal fun processText(request: AgentRequest): String? =
    request.message?.takeIf { isSuccessAgentStatus(request.status) && it.isNotEmpty() }

/**
 * Se um pedido por passos deixa algo na conversa. Enquanto roda, nada: o passo atual vai na linha de status do campo e os
 * demais ficam na aba "Processo". Terminado, vale o que há para ler: a resposta, as linhas de uma consulta ou os registros
 * que ele gravou (um pedido que falhou ou foi cancelado pode ter gravado algo antes de parar).
 */
internal fun processAnswerShows(request: AgentRequest?): Boolean {
    if (request == null || isOpenAgentStatus(request.status)) return false
    return processText(request) != null || request.steps.any { it.result != null } || request.entities.isNotEmpty()
}

/** O que entra na conversa: os passos do Hermes e do modelo e o pedido por passos sem nada para ler ficam na aba "Processo". */
internal fun ChatMessage.inConversation(): Boolean =
    when (this) {
        is ChatMessage.HermesSteps -> false
        is ChatMessage.Process -> processAnswerShows(request)
        else -> true
    }

/** O que a linha de status diz de um pedido por passos antes de o servidor desdobrá-lo. */
private const val UNDERSTANDING = "Entendendo o pedido"

/**
 * O passo em que o pedido em andamento está, para a linha de status do campo (`pendingStepLabel` do web). No pedido por
 * passos é o passo que roda, senão o próximo da fila, senão o último. No Hermes e no modelo é a ferramenta ou o pensamento
 * em curso, senão o último. Sem passo nenhum, o rótulo do pedido ("Realizando processos", o nome do modelo) ou "Pensando".
 */
internal fun pendingStepLabel(
    messages: List<ChatMessage>,
    pending: ChatPending,
): String {
    for (message in messages) {
        if (message is ChatMessage.Process && message.id == "${pending.id}-process") {
            val steps = message.request?.steps.orEmpty()
            val current =
                steps.firstOrNull { it.status == TaskStatus.Running }
                    ?: steps.firstOrNull { isOpenAgentStatus(it.status) }
                    ?: steps.lastOrNull()
            return current?.label ?: UNDERSTANDING
        }
        if (message is ChatMessage.HermesSteps && message.id == "${pending.id}-steps") {
            val current = message.steps.lastOrNull { it.status == TraceStatus.Running } ?: message.steps.lastOrNull()
            if (current != null) return current.label
        }
    }
    return pending.label ?: "Pensando"
}

/**
 * O que um pedido por passos terminado deixa na conversa (canvas "Chat com o Hermes — conversa limpa", opção B): a resposta
 * em texto solto, só o texto (sem o robô e o nome sobre ela), com as linhas da consulta quando houve uma, e a prévia de cada registro criado
 * ou alterado. Sem título, sem lista de passos e sem cancelar: o cancelar é o quadrado no lugar da seta do campo.
 */
@Composable
internal fun ProcessAnswer(
    request: AgentRequest,
    links: ChatEntityLinks,
    onOpenEntity: () -> Unit,
) {
    val scheme = MaterialTheme.colorScheme
    val query = request.steps.firstOrNull { it.result != null }?.result
    val text = processText(request)
    Column(Modifier.fillMaxWidth()) {
        if (text != null || query != null) {
            if (text != null) Text(text = text, fontSize = 15.sp, lineHeight = 24.sp, color = scheme.onBackground)
            if (query != null) QueryRows(query, Modifier.padding(top = if (text != null) 8.dp else 0.dp))
        }
        EntityRows(request.entities, links, onOpenEntity)
    }
}

/** As linhas que uma consulta devolveu, numa tabela que rola de lado (o chat e o painel do assistente a mostram). */
@Composable
internal fun QueryRows(
    query: QueryTable,
    modifier: Modifier = Modifier,
) {
    val scheme = MaterialTheme.colorScheme
    Column(modifier.semantics { contentDescription = "Resultado da consulta" }) {
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
