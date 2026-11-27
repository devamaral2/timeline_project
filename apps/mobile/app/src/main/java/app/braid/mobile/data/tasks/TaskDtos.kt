package app.braid.mobile.data.tasks

import app.braid.mobile.data.projects.ProjectDto
import app.braid.mobile.data.projects.toDomain
import app.braid.mobile.domain.task.FinishedAtChange
import app.braid.mobile.domain.task.RecurrenceFrequency
import app.braid.mobile.domain.task.RecurrenceRule
import app.braid.mobile.domain.task.StatusPatch
import app.braid.mobile.domain.task.TaskActor
import app.braid.mobile.domain.task.TaskCard
import app.braid.mobile.domain.task.TaskKind
import app.braid.mobile.domain.task.TaskPriority
import app.braid.mobile.domain.task.TaskRecurrence
import app.braid.mobile.domain.task.TaskSituation
import app.braid.mobile.domain.task.TaskStatus
import app.braid.mobile.domain.timeline.toIsoMillis
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import java.time.OffsetDateTime

/** `taskCardSchema` do `packages/contracts`, campo a campo. */
@Serializable
data class TaskCardDto(
    val id: String,
    val actor: String,
    val kind: String,
    val status: String? = null,
    val priority: String,
    val name: String,
    val description: String,
    val project: ProjectDto,
    val situation: String? = null,
    val location: String? = null,
    val startedAt: String? = null,
    val estimatedFinishAt: String? = null,
    val finishedAt: String? = null,
    val longRunning: Boolean,
    val notifyOffsetsMinutes: List<Double> = emptyList(),
    val tags: List<String> = emptyList(),
    val artifactTypes: List<String> = emptyList(),
    val parentTaskId: String? = null,
    val recurrence: TaskRecurrenceDto? = null,
    val revision: Int,
    val createdAt: String,
    val updatedAt: String,
)

@Serializable
data class TaskRecurrenceDto(
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

/** `setTaskSituationInputSchema`: só a situação nova. */
@Serializable
data class SetSituationBody(
    val situation: String,
)

/** `agendaPageSchema`: a página e o cursor da próxima, que some na última. */
@Serializable
data class AgendaPageDto(
    val items: List<TaskCardDto>,
    @SerialName("nextCursor") val nextCursor: String? = null,
)

fun TaskCardDto.toDomain(): TaskCard =
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
        priority = TaskPriority.fromCode(priority),
        recurrence = recurrence?.toDomain(),
        parentTaskId = parentTaskId,
        notifyOffsetsMinutes = notifyOffsetsMinutes.map { it.toInt() },
        project = project.toDomain(),
        situation = TaskSituation.fromCode(situation),
    )

fun TaskRecurrenceDto.toDomain() =
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

private fun parseInstant(value: String) = OffsetDateTime.parse(value).toInstant()

/** O corpo do `PATCH`: `finishedAt` ausente não muda a conclusão e `null` a apaga, então não dá para ser um DTO com padrão. */
fun StatusPatch.toBody(): JsonObject =
    buildJsonObject {
        put("expectedRevision", expectedRevision)
        put("status", status.code)
        when (val change = finishedAt) {
            FinishedAtChange.Unchanged -> Unit
            FinishedAtChange.Cleared -> put("finishedAt", JsonNull)
            is FinishedAtChange.Set -> put("finishedAt", JsonPrimitive(toIsoMillis(change.at)))
        }
    }
