package app.braid.mobile.ui.tasks

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.braid.mobile.core.designsystem.BraidIcons
import app.braid.mobile.core.designsystem.BraidMonoFont
import app.braid.mobile.core.designsystem.ProjectLine
import app.braid.mobile.core.designsystem.SvgIcon
import app.braid.mobile.core.designsystem.braidTokens
import app.braid.mobile.domain.task.TaskActor
import app.braid.mobile.domain.task.TaskCard
import app.braid.mobile.domain.task.cardDurationLabel
import app.braid.mobile.domain.task.cardIsOverdue
import app.braid.mobile.domain.task.cardWhenLabel
import java.time.Instant

/**
 * A linha única das listas: glifo de status, título, a linha do projeto, uma linha com o tipo, o
 * "quando" e as tags, e a duração à direita. Pessoa e agente usam a mesma
 * grade; a tarefa de agente fecha a linha com o robô, a sua assinatura. Os
 * textos calculados saem do cartão e de [now].
 */
@Composable
fun TaskRow(
    card: TaskCard,
    now: Instant,
    modifier: Modifier = Modifier,
    /** O toque na linha abre o detalhe da tarefa; sem isso a linha é só leitura. */
    onClick: (() -> Unit)? = null,
    /** Quando a tela deixa o glifo de status ser tocado, o que acontece com o toque; sem isso o glifo é só leitura. */
    onStatusClick: (() -> Unit)? = null,
    /** A lista pede a regra da série no lugar do horário, quando a ocorrência segue uma. */
    ruleInPlaceOfTime: Boolean = false,
    /** Um controle na ponta da linha, fora da linha tocável: a fração das subtarefas. */
    aside: @Composable (() -> Unit)? = null,
) {
    Row(modifier.fillMaxWidth(), verticalAlignment = Alignment.Top) {
        TaskRowBody(
            card = card,
            now = now,
            onClick = onClick,
            onStatusClick = onStatusClick,
            ruleInPlaceOfTime = ruleInPlaceOfTime,
            modifier = Modifier.weight(1f),
        )
        if (aside != null) Box(Modifier.padding(top = 7.dp)) { aside() }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun TaskRowBody(
    card: TaskCard,
    now: Instant,
    onClick: (() -> Unit)?,
    onStatusClick: (() -> Unit)?,
    ruleInPlaceOfTime: Boolean,
    modifier: Modifier,
) {
    val isAgent = card.actor == TaskActor.Agent
    val overdue = cardIsOverdue(card, now)
    val duration = cardDurationLabel(card)
    val muted = MaterialTheme.colorScheme.onSurfaceVariant

    Row(
        modifier =
            modifier
                .fillMaxWidth()
                .then(if (onClick != null) Modifier.clickable(role = Role.Button, onClick = onClick) else Modifier)
                .semantics(mergeDescendants = true) {}
                .padding(vertical = 10.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.Top,
    ) {
        val glyphBox =
            if (onStatusClick == null) Modifier.size(24.dp) else Modifier.size(24.dp).clickable(role = Role.Button, onClick = onStatusClick)
        Box(glyphBox, contentAlignment = Alignment.Center) {
            TaskStatusGlyph(actor = card.actor, status = card.status)
        }
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(
                text = card.name,
                color = MaterialTheme.colorScheme.onBackground,
                fontSize = 16.sp,
                lineHeight = 22.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            // Igual para tarefa de pessoa e de agente: a marca e o nome do projeto, abaixo do título e acima do tipo.
            ProjectLine(card.project)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                TaskKindMark(card.kind)
                Text(
                    text = cardWhenLabel(card, now, ruleInPlaceOfTime),
                    color = if (overdue) MaterialTheme.colorScheme.error else muted,
                    fontSize = 13.sp,
                    lineHeight = 18.sp,
                )
                // No web a linha mostra as tags no cinza do texto de apoio; as cores de tag são dos filtros e da edição.
                card.tags.forEach { tag ->
                    Text(text = "#$tag", color = muted, fontSize = 13.sp, lineHeight = 18.sp, maxLines = 1)
                }
            }
        }
        if (duration != null) {
            Text(text = duration, color = muted, fontFamily = BraidMonoFont, fontSize = 12.sp, lineHeight = 18.sp, maxLines = 1)
        }
        if (isAgent) {
            // Decorativo: o nome do glifo de status já diz "Agente".
            SvgIcon(
                BraidIcons.bot,
                size = 18.dp,
                color = braidTokens().brandAccent,
                strokeWidth = 1.9f,
                modifier = Modifier.padding(top = 2.dp).clearAndSetSemantics {},
            )
        }
    }
}
