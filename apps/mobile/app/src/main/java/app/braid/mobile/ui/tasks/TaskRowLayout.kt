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
 * O que a linha da tarefa desenha, sem Compose: o meio (título, a linha do tipo com o "quando" e a duração, e as tags
 * numa linha própria) e a ponta direita de duas linhas. [TaskRow] só pinta este modelo, e os testes o conferem na JVM.
 */
data class TaskRowLayout(
    val title: String,
    val meta: TaskRowMeta,
    /** As tags (`#tag`) da linha própria abaixo da linha do tipo; vazia quando a tarefa não tem tags (sem linha). */
    val tags: List<String>,
    val side: TaskRowSide,
)

/** A linha do tipo: o tipo, o "quando" e, logo depois dele, a duração (que já não fica na ponta direita). */
data class TaskRowMeta(
    val kind: TaskKind,
    val whenText: String,
    val overdue: Boolean,
    val duration: String?,
)

/** A ponta direita, alinhada à direita: [top] na altura do título e [marks] na altura da linha do tipo. */
data class TaskRowSide(
    val top: TaskRowTop,
    val marks: TaskRowMarks,
)

/** A primeira linha da ponta direita: a prioridade na tarefa de pessoa; o nome e o ícone do status na de agente (sem prioridade). */
sealed interface TaskRowTop {
    data class Priority(
        val priority: TaskPriority,
    ) : TaskRowTop

    data class AgentStatus(
        val status: TaskStatus?,
    ) : TaskRowTop
}

/**
 * A segunda linha da ponta direita: a marca do projeto sozinha (o nome de [project] só serve de descrição para o leitor
 * de tela) e, à esquerda dela, o provedor, só na tarefa de agente cujo cartão traz a escolha do pedido.
 */
data class TaskRowMarks(
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
        meta =
            TaskRowMeta(
                kind = card.kind,
                whenText = cardWhenLabel(card, now, ruleInPlaceOfTime),
                overdue = cardIsOverdue(card, now),
                duration = cardDurationLabel(card),
            ),
        tags = card.tags,
        side =
            TaskRowSide(
                top = if (isAgent) TaskRowTop.AgentStatus(card.status) else TaskRowTop.Priority(card.priority),
                marks = TaskRowMarks(provider = if (isAgent) card.model?.provider else null, project = card.project),
            ),
    )
}
