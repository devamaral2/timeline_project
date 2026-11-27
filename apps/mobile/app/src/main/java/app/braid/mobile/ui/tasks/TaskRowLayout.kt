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

/** A linha do tipo: o tipo, o "quando" e, só na tarefa de agente, a duração logo depois (na de pessoa ela fica no alto da ponta direita). */
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

/**
 * A primeira linha da ponta direita: a duração na tarefa de pessoa (o lugar fica, vazio, quando ela não tem); o nome e
 * o ícone do status na de agente.
 */
sealed interface TaskRowTop {
    data class Duration(
        val duration: String?,
    ) : TaskRowTop

    data class AgentStatus(
        val status: TaskStatus?,
    ) : TaskRowTop
}

/**
 * A segunda linha da ponta direita: a marca do projeto sozinha (o nome de [project] só serve de descrição para o leitor
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
    val duration = cardDurationLabel(card)
    return TaskRowLayout(
        title = card.name,
        meta =
            TaskRowMeta(
                kind = card.kind,
                whenText = cardWhenLabel(card, now, ruleInPlaceOfTime),
                overdue = cardIsOverdue(card, now),
                duration = duration.takeIf { isAgent },
            ),
        tags = card.tags,
        side =
            TaskRowSide(
                top = if (isAgent) TaskRowTop.AgentStatus(card.status) else TaskRowTop.Duration(duration),
                marks =
                    TaskRowMarks(
                        priority = card.priority.takeIf { !isAgent },
                        provider = if (isAgent) card.model?.provider else null,
                        project = card.project,
                    ),
            ),
    )
}
