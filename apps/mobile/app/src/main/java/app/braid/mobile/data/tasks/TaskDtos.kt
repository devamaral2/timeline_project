package app.braid.mobile.data.tasks

import app.braid.mobile.domain.task.TaskActor
import app.braid.mobile.domain.task.TaskCard
import app.braid.mobile.domain.task.TaskKind
import app.braid.mobile.domain.task.TaskStatus
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
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
    )

private fun parseInstant(value: String) = OffsetDateTime.parse(value).toInstant()
