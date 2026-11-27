package app.braid.mobile.ui.tasks

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.DpSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.braid.mobile.core.designsystem.BraidMonoFont
import app.braid.mobile.core.designsystem.ProjectMark
import app.braid.mobile.core.designsystem.SvgIcon
import app.braid.mobile.core.designsystem.SvgPart
import app.braid.mobile.domain.task.TaskActor
import app.braid.mobile.domain.task.TaskCard
import app.braid.mobile.domain.task.TaskStatus
import app.braid.mobile.ui.chat.ProviderMark
import java.time.Instant

/**
 * A linha única das listas. À esquerda, o glifo (um ponto inerte ou o glifo de situação na tarefa de agente); no meio,
 * o título, a linha do tipo com o "quando" e, quando há, a linha das tags; à direita, duas linhas alinhadas na ponta:
 * no alto a duração (pessoa, quando tem) ou o nome e o ícone quadrado do status (agente, cuja duração fica junto do
 * "quando"), na altura do título; embaixo a marca do projeto, com a prioridade (pessoa) ou o provedor (agente, quando
 * o cartão traz a escolha) à esquerda dela. O que a
 * linha mostra sai de [taskRowLayout], a partir do cartão e de [now].
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
    /**
     * Na tarefa de agente que terminou, o toque no glifo da esquerda, que mostra a situação; sem isso (a Agenda) ou sem
     * situação (esperando você, execução agendada) o glifo é o ponto inerte.
     */
    onSituationClick: (() -> Unit)? = null,
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
            onSituationClick = onSituationClick,
            ruleInPlaceOfTime = ruleInPlaceOfTime,
            modifier = Modifier.weight(1f),
        )
        if (aside != null) Box(Modifier.padding(top = 13.dp)) { aside() }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun TaskRowBody(
    card: TaskCard,
    now: Instant,
    onClick: (() -> Unit)?,
    onStatusClick: (() -> Unit)?,
    onSituationClick: (() -> Unit)?,
    ruleInPlaceOfTime: Boolean,
    modifier: Modifier,
) {
    val isAgent = card.actor == TaskActor.Agent
    val layout = taskRowLayout(card, now, ruleInPlaceOfTime)
    val muted = MaterialTheme.colorScheme.onSurfaceVariant

    Row(
        modifier =
            modifier
                .fillMaxWidth()
                .then(if (onClick != null) Modifier.clickable(role = Role.Button, onClick = onClick) else Modifier)
                .semantics(mergeDescendants = true) {}
                .padding(vertical = 16.dp),
        horizontalArrangement = Arrangement.spacedBy(14.dp),
        verticalAlignment = Alignment.Top,
    ) {
        if (isAgent) {
            AgentLead(card, onSituationClick)
        } else {
            val glyphBox =
                if (onStatusClick ==
                    null
                ) {
                    Modifier.size(24.dp)
                } else {
                    Modifier.size(24.dp).clickable(role = Role.Button, onClick = onStatusClick)
                }
            Box(glyphBox, contentAlignment = Alignment.Center) {
                TaskStatusGlyph(actor = card.actor, status = card.status)
            }
        }
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(ROW_LINE_GAP)) {
            Text(
                text = layout.title,
                color = MaterialTheme.colorScheme.onBackground,
                fontSize = 16.sp,
                lineHeight = 22.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            FlowRow(horizontalArrangement = Arrangement.spacedBy(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                TaskKindMark(layout.meta.kind)
                Text(
                    text = layout.meta.whenText,
                    color = if (layout.meta.overdue) MaterialTheme.colorScheme.error else muted,
                    fontSize = 13.sp,
                    lineHeight = 18.sp,
                )
                layout.meta.duration?.let { duration ->
                    Text(text = duration, color = muted, fontFamily = BraidMonoFont, fontSize = 12.sp, lineHeight = 18.sp, maxLines = 1)
                }
            }
            // As tags têm linha própria (só quando há); no web têm o cinza e o estilo da linha do tipo. As cores de tag são dos filtros e da edição.
            if (layout.tags.isNotEmpty()) {
                FlowRow(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    layout.tags.forEach { tag ->
                        Text(text = "#$tag", color = muted, fontSize = 13.sp, lineHeight = 18.sp, maxLines = 1)
                    }
                }
            }
        }
        RowSide(layout.side)
    }
}

/** O que ocupa a esquerda da tarefa de agente: o glifo de situação que abre as três opções (tarefa que terminou, na lista) ou o ponto inerte de [GLYPH_SLOT] (22 dp, a 40%). */
@Composable
private fun AgentLead(
    card: TaskCard,
    onSituationClick: (() -> Unit)?,
) {
    val situation = card.situation
    if (situation != null && onSituationClick != null) {
        Box(Modifier.size(GLYPH_SLOT).clickable(role = Role.Button, onClick = onSituationClick), contentAlignment = Alignment.Center) {
            TaskSituationGlyph(situation, description = "${situationName(situation)}. Mudar situação de “${card.name}”")
        }
        return
    }
    Box(Modifier.size(GLYPH_SLOT).clearAndSetSemantics {}, contentAlignment = Alignment.Center) {
        SvgIcon(
            listOf(SvgPart("M12 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z", fill = true)),
            size = 22.dp,
            color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = IDLE_DOT_ALPHA),
        )
    }
}

/** O nome do status à esquerda do ícone quadrado. O ícone já diz o nome por inteiro ("Agente, na fila"); o texto é só para quem enxerga. */
@Composable
private fun AgentStatusEnd(status: TaskStatus?) {
    val tone = agentToneColor(remember(status) { agentStatusIcon(status) }.tone)
    Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
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

/**
 * A ponta direita, alinhada à borda direita, a 16 dp do texto, em duas linhas com [ROW_LINE_GAP] entre elas. No alto,
 * na altura do título (22 dp): a duração (pessoa, quando tem) ou o nome do status à esquerda do ícone quadrado (agente).
 * Embaixo, a marca do projeto sozinha (o nome é só a descrição dela) e, à esquerda dela, a prioridade (pessoa) ou o
 * símbolo do provedor (agente com a escolha do pedido).
 */
@Composable
private fun RowSide(side: TaskRowSide) {
    // A linha já afasta os três blocos 14 dp; os 2 dp a mais dão os 16 dp do web entre o texto e a ponta.
    Column(Modifier.padding(start = 2.dp), horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(ROW_LINE_GAP)) {
        // O lugar do alto fica mesmo sem duração, para a linha de baixo cair na altura da linha do tipo.
        Box(Modifier.height(22.dp), contentAlignment = Alignment.CenterEnd) {
            when (val top = side.top) {
                is TaskRowTop.Duration ->
                    top.duration?.let { duration ->
                        Text(
                            text = duration,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            fontFamily = BraidMonoFont,
                            fontSize = 12.sp,
                            lineHeight = 18.sp,
                            maxLines = 1,
                        )
                    }
                is TaskRowTop.AgentStatus -> AgentStatusEnd(top.status)
            }
        }
        Row(
            Modifier.defaultMinSize(minHeight = 18.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            side.marks.priority?.let { priority -> TaskPriorityMark(priority) }
            side.marks.provider?.let { provider ->
                Box(
                    Modifier.size(width = 20.dp, height = 16.dp).semantics {
                        contentDescription = provider.label
                        role = Role.Image
                    },
                    contentAlignment = Alignment.Center,
                ) {
                    ProviderMark(provider, MaterialTheme.colorScheme.onSurfaceVariant, fitIn = DpSize(15.dp, 13.dp))
                }
            }
            ProjectMark(side.marks.project, labelled = true)
        }
    }
}

private val GLYPH_SLOT = 24.dp

/** O respiro entre as linhas do texto e entre as da ponta direita: o mesmo, para as segundas linhas caírem na mesma altura. */
private val ROW_LINE_GAP = 8.dp
private const val IDLE_DOT_ALPHA = 0.4f
