package app.braid.mobile.domain.task

import app.braid.mobile.domain.project.Project
import app.braid.mobile.domain.timeline.dayKeyOf
import app.braid.mobile.domain.timeline.formatTime
import app.braid.mobile.domain.timeline.zonedDayStart
import app.braid.mobile.domain.timeline.zonedTimeAt
import java.time.Instant

/**
 * O formulário de tarefa de pessoa, como texto: o espelho do `TaskDraft` do web (`task-draft.ts`). O estado da tela
 * inteira mora num `TaskDraft`; cada seção lê e escreve os seus campos aqui.
 *
 * Um ticket que acrescenta uma seção ao formulário acrescenta o campo aqui (sem valor padrão, para o compilador mostrar
 * cada lugar que precisa dele), em [TaskDraftField], em [draftFromTask], [emptyTaskDraft] e [rebaseDraft], na
 * conferência de [validateTaskDraft] se houver, e num ramo de [buildTaskPatch] (e de [buildCreateTask], se a criação o
 * enviar). Os tickets 14 (recorrência), 15 (hierarquia) e 16 (artefatos) entram por aqui.
 */
data class TaskDraft(
    val kind: TaskKind,
    val name: String,
    /** `null` é "sem status": a tarefa volta a ser de referência. */
    val status: TaskStatus?,
    val priority: TaskPriority,
    /** `YYYY-MM-DD` no fuso da timeline, ou vazio: sem data. */
    val startDate: String,
    /** `HH:MM`, ou vazio: o dia sem hora começa à meia-noite local. */
    val startTime: String,
    val endDate: String,
    val endTime: String,
    val description: String,
    /** Onde acontece; vazio é sem local. */
    val location: String,
    /** Minutos antes da tarefa, em ordem crescente (`notifyOffsetsMinutes`). */
    val reminders: List<Int>,
    /** Tags já normalizadas (minúsculas, sem espaços nas pontas). */
    val tags: List<String>,
    /** A tarefa persistente: a tarefa longa, cujo fim é um prazo e não um bloco de tempo. */
    val longRunning: Boolean,
    /** A tarefa principal (id), ou `null`: a tarefa não é subtarefa de nenhuma. Só a edição a tem. */
    val parentTaskId: String?,
    /** As subtarefas (ids), na ordem da API; a lista inteira vai no `PATCH`. Só a edição as tem. */
    val subtaskIds: List<String>,
    /** Os artefatos ligados, na ordem da tela; a lista inteira vai no `PATCH`. Só a edição os tem. */
    val artifacts: List<DraftArtifact>,
    /**
     * O projeto da tarefa, com a marca e o nome que o campo mostra. `null` na criação, enquanto ninguém escolheu: a
     * tarefa nasce em `personal`, e o campo mostra esse.
     */
    val project: Project?,
)

/** Os campos que a validação sabe recusar; cada um aparece no controle que o causou. */
enum class TaskDraftField {
    Kind,
    Name,
    Status,
    Priority,
    StartDate,
    StartTime,
    EndDate,
    EndTime,
    Description,
    Location,
    Reminders,
    Tags,
    LongRunning,
    ParentTask,
    Subtasks,
    Artifacts,
}

typealias TaskDraftErrors = Map<TaskDraftField, String>

/** O limite de um bloco de tempo: 31 dias (`tasks_block` no TDD). */
private const val MAX_BLOCK_MILLIS = 31L * 24 * 60 * 60 * 1000
private const val LOCATION_MAX = 300

const val NAME_REQUIRED_MESSAGE = "Dê um título à tarefa."
const val LOCATION_TOO_LONG_MESSAGE = "O local tem no máximo 300 caracteres."
const val DATE_FOR_TIME_MESSAGE = "Informe a data para marcar a hora."
const val END_BEFORE_START_MESSAGE = "O término não pode ser antes do início."
const val LONG_BLOCK_MESSAGE = "Um bloco não dura mais de 31 dias. Para algo que segue por mais tempo, marque como tarefa persistente."
const val LONG_STATUS_MESSAGE = "Tarefa persistente precisa de um status: não pode ficar sem status nem como não realizado."
const val LONG_NO_DEADLINE_REMINDER_MESSAGE = "Tarefa persistente sem previsão de entrega não tem lembrete."

/** O rascunho da criação: tudo vazio e sem status, a tarefa de referência. [name] vem de `/tarefa comprar pão`. */
fun emptyTaskDraft(name: String = ""): TaskDraft =
    TaskDraft(
        kind = TaskKind.Common,
        name = name,
        status = null,
        priority = TaskPriority.Medium,
        startDate = "",
        startTime = "",
        endDate = "",
        endTime = "",
        description = "",
        location = "",
        reminders = emptyList(),
        tags = emptyList(),
        longRunning = false,
        parentTaskId = null,
        subtaskIds = emptyList(),
        artifacts = emptyList(),
        project = null,
    )

/** O rascunho que a edição abre: a tarefa lida, campo a campo. */
fun draftFromTask(task: TaskDetail): TaskDraft {
    val (startDate, startTime) = splitInstant(task.card.startedAt)
    val (endDate, endTime) = splitInstant(task.card.estimatedFinishAt)
    return TaskDraft(
        kind = task.card.kind,
        name = task.card.name,
        status = task.status,
        priority = task.priority,
        startDate = startDate,
        startTime = startTime,
        endDate = endDate,
        endTime = endTime,
        description = task.description,
        location = task.location.orEmpty(),
        reminders = sortReminders(task.notifyOffsetsMinutes),
        tags = task.card.tags,
        longRunning = task.card.longRunning,
        parentTaskId = task.parentTaskId,
        subtaskIds = task.subtaskIds,
        artifacts = draftArtifactsFromTask(task.artifacts),
        project = task.card.project,
    )
}

/** Data e hora do instante no fuso da timeline; a meia-noite local é o dia sem hora. */
private fun splitInstant(instant: Instant?): Pair<String, String> {
    if (instant == null) return "" to ""
    val date = dayKeyOf(instant)
    val isDayStart = zonedDayStart(date) == instant
    return date to if (isDayStart) "" else formatTime(instant)
}

/** O instante que a data e a hora marcam; `null` sem data. Dia sem hora é a meia-noite local. */
fun instantFromDraft(
    date: String,
    time: String,
): Instant? {
    if (date.isEmpty()) return null
    return if (time.isNotEmpty()) zonedTimeAt(date, time) else zonedDayStart(date)
}

/** Um valor que a API aceita nulo: `null` dentro dele apaga o campo; o campo ausente do corpo é "não mexe". */
data class Clearable<T>(
    val value: T?,
)

/** O corpo da criação (`CreateTaskInput`): só o que a pessoa preencheu. */
data class CreateTask(
    val kind: TaskKind,
    val name: String,
    val description: String,
    val priority: TaskPriority,
    val status: TaskStatus? = null,
    val finishedAt: Instant? = null,
    val startedAt: Instant? = null,
    val estimatedFinishAt: Instant? = null,
    val location: String? = null,
    val notifyOffsetsMinutes: List<Int>? = null,
    val tags: List<String>? = null,
    /** O projeto escolhido; ausente (o `personal` também não vai) a API resolve para `personal`. */
    val projectId: String? = null,
)

/**
 * O corpo da criação. Sem data, a API põe agora e estima o fim; sem status, a tarefa nasce de referência. Criar já
 * concluída manda `finishedAt`. Lembretes e tags entram só quando a pessoa escolheu algum. A tarefa persistente, a
 * hierarquia e os artefatos não existem na criação.
 */
fun buildCreateTask(
    draft: TaskDraft,
    now: Instant,
): CreateTask =
    CreateTask(
        kind = draft.kind,
        name = draft.name.trim(),
        description = draft.description,
        priority = draft.priority,
        status = draft.status,
        finishedAt = if (draft.status == TaskStatus.Done) now else null,
        startedAt = instantFromDraft(draft.startDate, draft.startTime),
        estimatedFinishAt = instantFromDraft(draft.endDate, draft.endTime),
        location = draft.location.trim().ifEmpty { null },
        notifyOffsetsMinutes = draft.reminders.ifEmpty { null },
        tags = draft.tags.ifEmpty { null },
        projectId = draft.project?.takeUnless { it.personal }?.id,
    )

/**
 * O `PATCH` de uma edição: só os campos que mudaram, com a revisão lida. Campo `null` não muda; [Clearable] com `null`
 * apaga. A conclusão segue [statusPatch].
 */
data class TaskPatch(
    val expectedRevision: Int,
    val kind: TaskKind? = null,
    val name: String? = null,
    val description: String? = null,
    val location: Clearable<String>? = null,
    val priority: TaskPriority? = null,
    val status: Clearable<TaskStatus>? = null,
    val finishedAt: FinishedAtChange = FinishedAtChange.Unchanged,
    val startedAt: Clearable<Instant>? = null,
    val estimatedFinishAt: Clearable<Instant>? = null,
    val notifyOffsetsMinutes: List<Int>? = null,
    val tags: List<String>? = null,
    val longRunning: Boolean? = null,
    /** `Clearable(null)` tira a tarefa de baixo da principal; outra principal tira a ligação anterior, sem erro. */
    val parentTaskId: Clearable<String>? = null,
    /** A lista completa, não o que mudou. */
    val subtaskIds: List<String>? = null,
    /** A lista completa de artefatos, na ordem da tela; cópias novas de alimento levam `copyOf` e a quantidade. */
    val artifacts: List<ArtifactLink>? = null,
    /** `Clearable(null)` devolve a tarefa ao `personal`; um id a muda de projeto. */
    val projectId: Clearable<String>? = null,
) {
    /** Nada além da revisão: não há o que enviar. */
    val isEmpty: Boolean
        get() =
            copy(expectedRevision = 0) ==
                TaskPatch(expectedRevision = 0)
}

/**
 * O `PATCH` com só o que mudou em relação à tarefa lida; `null` quando nada mudou. Nomes e local se comparam sem as
 * pontas; lembretes e tags, pelo conteúdo na mesma ordem.
 */
fun buildTaskPatch(
    task: TaskDetail,
    draft: TaskDraft,
    now: Instant,
): TaskPatch? {
    val base = draftFromTask(task)
    val statusChanged = draft.status != base.status
    val status = if (statusChanged) draft.status?.let { statusPatch(task.card, it, now) } else null
    val patch =
        TaskPatch(
            expectedRevision = task.card.revision,
            kind = draft.kind.takeIf { it != base.kind },
            name = draft.name.trim().takeIf { it != base.name.trim() },
            description = draft.description.takeIf { it != base.description },
            // Apagar o local manda `null`: a tarefa volta a não ter local.
            location =
                draft.location
                    .trim()
                    .takeIf { it != base.location.trim() }
                    ?.let { Clearable(it.ifEmpty { null }) },
            priority = draft.priority.takeIf { it != base.priority },
            status = if (statusChanged) Clearable(draft.status) else null,
            finishedAt =
                when {
                    !statusChanged -> FinishedAtChange.Unchanged
                    status != null -> status.finishedAt
                    // Sem status a tarefa volta a ser de referência; quem estava concluída perde a conclusão.
                    task.status == TaskStatus.Done -> FinishedAtChange.Cleared
                    else -> FinishedAtChange.Unchanged
                },
            startedAt =
                if (draft.startDate != base.startDate || draft.startTime != base.startTime) {
                    Clearable(instantFromDraft(draft.startDate, draft.startTime))
                } else {
                    null
                },
            estimatedFinishAt =
                if (draft.endDate != base.endDate || draft.endTime != base.endTime) {
                    Clearable(instantFromDraft(draft.endDate, draft.endTime))
                } else {
                    null
                },
            notifyOffsetsMinutes = draft.reminders.takeIf { it != base.reminders },
            tags = draft.tags.takeIf { it != base.tags },
            longRunning = draft.longRunning.takeIf { it != base.longRunning },
            parentTaskId = if (draft.parentTaskId != base.parentTaskId) Clearable(draft.parentTaskId) else null,
            subtaskIds = draft.subtaskIds.takeIf { it != base.subtaskIds },
            artifacts = if (sameArtifactLinks(draft.artifacts, base.artifacts)) null else artifactLinkInputs(draft.artifacts),
            // Voltar ao `personal` manda `null`; outro projeto manda o id. Rascunho sem projeto não mexe.
            projectId =
                draft.project
                    ?.takeIf { it.id != base.project?.id }
                    ?.let { Clearable(if (it.personal) null else it.id) },
        )
    return patch.takeUnless { it.isEmpty }
}

/**
 * As recusas da própria tela, antes de enviar; a API continua valendo. Na tarefa persistente o prazo não se compara
 * com o início, o status é obrigatório e não pode ser "não realizado", e sem prazo não há lembrete. Fora dela, o bloco
 * não termina antes de começar nem dura mais de 31 dias.
 */
fun validateTaskDraft(draft: TaskDraft): TaskDraftErrors {
    val errors = linkedMapOf<TaskDraftField, String>()
    if (draft.name.isBlank()) errors[TaskDraftField.Name] = NAME_REQUIRED_MESSAGE
    if (draft.location.length > LOCATION_MAX) errors[TaskDraftField.Location] = LOCATION_TOO_LONG_MESSAGE
    if (draft.startTime.isNotEmpty() && draft.startDate.isEmpty()) errors[TaskDraftField.StartTime] = DATE_FOR_TIME_MESSAGE
    if (draft.endTime.isNotEmpty() && draft.endDate.isEmpty()) errors[TaskDraftField.EndTime] = DATE_FOR_TIME_MESSAGE
    val start = instantFromDraft(draft.startDate, draft.startTime)
    val end = instantFromDraft(draft.endDate, draft.endTime)
    if (draft.longRunning) {
        if (draft.status == null || draft.status == TaskStatus.Missed) errors[TaskDraftField.Status] = LONG_STATUS_MESSAGE
        if (end == null && draft.reminders.isNotEmpty()) errors[TaskDraftField.Reminders] = LONG_NO_DEADLINE_REMINDER_MESSAGE
    } else if (start != null && end != null) {
        if (end < start) {
            errors[TaskDraftField.EndDate] = END_BEFORE_START_MESSAGE
        } else if (end.toEpochMilli() - start.toEpochMilli() > MAX_BLOCK_MILLIS) {
            errors[TaskDraftField.EndDate] = LONG_BLOCK_MESSAGE
        }
    }
    return errors
}

/**
 * Quando a tarefa muda em outro lugar, o campo que a pessoa não tocou passa a valer o da versão nova, e o que ela
 * digitou fica para ela conferir.
 */
fun rebaseDraft(
    draft: TaskDraft,
    previous: TaskDetail,
    next: TaskDetail,
): TaskDraft {
    val before = draftFromTask(previous)
    val after = draftFromTask(next)

    fun <T> pick(
        mine: T,
        was: T,
        now: T,
    ): T = if (mine == was) now else mine
    return TaskDraft(
        kind = pick(draft.kind, before.kind, after.kind),
        name = pick(draft.name, before.name, after.name),
        status = pick(draft.status, before.status, after.status),
        priority = pick(draft.priority, before.priority, after.priority),
        startDate = pick(draft.startDate, before.startDate, after.startDate),
        startTime = pick(draft.startTime, before.startTime, after.startTime),
        endDate = pick(draft.endDate, before.endDate, after.endDate),
        endTime = pick(draft.endTime, before.endTime, after.endTime),
        description = pick(draft.description, before.description, after.description),
        location = pick(draft.location, before.location, after.location),
        reminders = pick(draft.reminders, before.reminders, after.reminders),
        tags = pick(draft.tags, before.tags, after.tags),
        longRunning = pick(draft.longRunning, before.longRunning, after.longRunning),
        parentTaskId = pick(draft.parentTaskId, before.parentTaskId, after.parentTaskId),
        subtaskIds = pick(draft.subtaskIds, before.subtaskIds, after.subtaskIds),
        artifacts = pick(draft.artifacts, before.artifacts, after.artifacts),
        project = pick(draft.project, before.project, after.project),
    )
}
