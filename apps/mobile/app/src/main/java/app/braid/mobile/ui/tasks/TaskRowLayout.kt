package app.braid.mobile.ui.tasks

import app.braid.mobile.domain.project.Project
import app.braid.mobile.domain.request.ModelProvider
import app.braid.mobile.domain.task.TaskActor
import app.braid.mobile.domain.task.TaskCard
import app.braid.mobile.domain.task.TaskKind
import app.braid.mobile.domain.task.TaskPriority
import app.braid.mobile.domain.task.TaskStatus
import app.braid.mobile.domain.task.cardDurationLabel
import app.braid.mobile.domain.task.cardIsOverdue
import app.braid.mobile.domain.task.cardWhenLabel
import java.time.Instant

/**
 * O que a linha da tarefa desenha, sem Compose: o título com as marcas da ponta direita, a linha do tipo com o "quando",
 * a duração e o status do agente, e as tags numa linha própria. [TaskRow] só pinta este modelo, e os testes o conferem
 * na JVM.
 */
data class TaskRowLayout(
    val title: String,
    /** Sempre na linha do título, na ponta direita. */
    val marks: TaskRowMarks,
    val meta: TaskRowMeta,
    /** As tags (`#tag`) da linha própria abaixo da linha do tipo; vazia quando a tarefa não tem tags (sem linha). */
    val tags: List<String>,
)

/** A linha do tipo: o tipo, o "quando", a duração (quando a tarefa tem) e, só na de agente, o status depois dela. */
data class TaskRowMeta(
    val kind: TaskKind,
    val whenText: String,
    val overdue: Boolean,
    val duration: String?,
    val agentStatus: TaskRowAgentStatus?,
)

/** O status da tarefa de agente na linha do tipo: o ícone quadrado e o nome. Nulo em [TaskRowMeta] na de pessoa. */
data class TaskRowAgentStatus(
    val status: TaskStatus?,
)

/**
 * A ponta direita da linha do título: a marca do projeto sozinha (o nome de [project] só serve de descrição para o leitor
 * de tela) e, à esquerda dela, a prioridade na tarefa de pessoa ou o provedor na de agente cujo cartão traz a escolha
 * do pedido. A tarefa de agente não mostra prioridade.
 */
data class TaskRowMarks(
    val priority: TaskPriority?,
    val provider: ModelProvider?,
    val project: Project,
)

fun taskRowLayout(
    card: TaskCard,
    now: Instant,
    ruleInPlaceOfTime: Boolean = false,
): TaskRowLayout {
    val isAgent = card.actor == TaskActor.Agent
    return TaskRowLayout(
        title = card.name,
        marks =
            TaskRowMarks(
                priority = card.priority.takeIf { !isAgent },
                provider = if (isAgent) card.model?.provider else null,
                project = card.project,
            ),
        meta =
            TaskRowMeta(
                kind = card.kind,
                whenText = cardWhenLabel(card, now, ruleInPlaceOfTime),
                overdue = cardIsOverdue(card, now),
                duration = cardDurationLabel(card),
                agentStatus = if (isAgent) TaskRowAgentStatus(card.status) else null,
            ),
        tags = card.tags,
    )
}
