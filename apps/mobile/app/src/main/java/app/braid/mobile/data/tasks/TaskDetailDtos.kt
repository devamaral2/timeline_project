package app.braid.mobile.data.tasks

import app.braid.mobile.domain.task.RecurrenceFrequency
import app.braid.mobile.domain.task.RecurrenceRule
import app.braid.mobile.domain.task.RequestRelation
import app.braid.mobile.domain.task.TaskActor
import app.braid.mobile.domain.task.TaskCard
import app.braid.mobile.domain.task.TaskDetail
import app.braid.mobile.domain.task.TaskKind
import app.braid.mobile.domain.task.TaskPriority
import app.braid.mobile.domain.task.TaskRecurrence
import app.braid.mobile.domain.task.TaskRequest
import app.braid.mobile.domain.task.TaskStatus
import kotlinx.serialization.Serializable
import java.time.Instant
import java.time.OffsetDateTime

/** `taskSchema` do `packages/contracts` (`GET /api/tasks/{id}`): o cartão mais o que só o detalhe traz. Os documentos ficam para o ticket 16. */
@Serializable
data class TaskDetailDto(
    val id: String,
    val actor: String,
    val kind: String,
    val status: String? = null,
    val priority: String,
    val name: String,
    val description: String,
    val location: String? = null,
    val startedAt: String? = null,
    val estimatedFinishAt: String? = null,
    val finishedAt: String? = null,
    val longRunning: Boolean,
    val notifyOffsetsMinutes: List<Int> = emptyList(),
    val tags: List<String> = emptyList(),
    val parentTaskId: String? = null,
    val recurrence: DetailRecurrenceDto? = null,
    val revision: Int,
    val subtaskIds: List<String> = emptyList(),
    val requests: List<TaskRequestDto> = emptyList(),
)

@Serializable
data class DetailRecurrenceDto(
    val id: String,
    val occurrenceOn: String,
    val detached: Boolean,
    val rule: RecurrenceRuleDto,
)

@Serializable
data class RecurrenceRuleDto(
    val frequency: String,
    val interval: Int,
    val byWeekday: Int? = null,
    val byMonthDay: Int? = null,
    val byMonth: Int? = null,
    val timeOfDay: String,
    val startsOn: String,
    val endsOn: String? = null,
)

@Serializable
data class TaskRequestDto(
    val id: String,
    val name: String,
    val relation: String,
    val at: String,
)

private fun parseInstant(value: String): Instant = OffsetDateTime.parse(value).toInstant()

fun TaskDetailDto.toDomain(): TaskDetail =
    TaskDetail(
        card =
            TaskCard(
                id = id,
                actor = if (actor == "agent") TaskActor.Agent else TaskActor.Human,
                kind = TaskKind.fromCode(kind),
                status = status?.let(TaskStatus::fromCode),
                name = name,
                startedAt = startedAt?.let(::parseInstant),
                estimatedFinishAt = estimatedFinishAt?.let(::parseInstant),
                longRunning = longRunning,
                tags = tags,
                revision = revision,
            ),
        priority = TaskPriority.fromCode(priority),
        description = description,
        location = location,
        finishedAt = finishedAt?.let(::parseInstant),
        notifyOffsetsMinutes = notifyOffsetsMinutes,
        parentTaskId = parentTaskId,
        recurrence = recurrence?.toDomain(),
        subtaskIds = subtaskIds,
        requests = requests.map { it.toDomain() },
    )

fun DetailRecurrenceDto.toDomain() =
    TaskRecurrence(
        id = id,
        occurrenceOn = occurrenceOn,
        detached = detached,
        rule =
            RecurrenceRule(
                frequency = RecurrenceFrequency.fromCode(rule.frequency),
                interval = rule.interval,
                byWeekday = rule.byWeekday,
                byMonthDay = rule.byMonthDay,
                byMonth = rule.byMonth,
                timeOfDay = rule.timeOfDay,
                startsOn = rule.startsOn,
                endsOn = rule.endsOn,
            ),
    )

private fun TaskRequestDto.toDomain() =
    TaskRequest(
        id = id,
        name = name,
        relation = if (relation == "generates") RequestRelation.Generates else RequestRelation.Updates,
        at = parseInstant(at),
    )
