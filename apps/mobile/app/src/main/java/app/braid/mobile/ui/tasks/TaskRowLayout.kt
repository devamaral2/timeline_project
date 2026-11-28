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
 * O que a linha da tarefa desenha, sem Compose: o título com o status do agente ou a duração na ponta direita, a linha
 * do tipo com o "quando" e as marcas na ponta direita, e as tags numa linha própria. [TaskRow] só pinta este modelo, e
 * os testes o conferem na JVM.
 */
data class TaskRowLayout(
    val title: String,
    /** A ponta direita da linha do título; nula (vazia) na tarefa de pessoa sem duração. */
    val aside: TaskRowAside?,
    /** Sempre na linha do tipo, na ponta direita, embaixo de [aside]. */
    val marks: TaskRowMarks,
    val meta: TaskRowMeta,
    /** As tags (`#tag`) da linha própria abaixo da linha do tipo; vazia quando a tarefa não tem tags (sem linha). */
    val tags: List<String>,
)

/** A esquerda da linha do tipo: o tipo, o "quando" e, só na de agente, a duração (quando a tarefa tem). */
data class TaskRowMeta(
    val kind: TaskKind,
    val whenText: String,
    val overdue: Boolean,
    val duration: String?,
)

/** O que fica em cima das marcas, na ponta direita da linha do título. */
sealed interface TaskRowAside {
    /** Na tarefa de agente: o nome do status e o ícone quadrado. */
    data class AgentStatus(
        val status: TaskStatus?,
    ) : TaskRowAside

    /** Na tarefa de pessoa que tem duração. */
    data class Duration(
        val text: String,
    ) : TaskRowAside
}

/**
 * A ponta direita da linha do tipo: a marca do projeto sozinha (o nome de [project] só serve de descrição para o leitor
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
        aside = if (isAgent) TaskRowAside.AgentStatus(card.status) else duration?.let { TaskRowAside.Duration(it) },
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
                duration = duration.takeIf { isAgent },
            ),
        tags = card.tags,
    )
}
