package app.braid.mobile.data.tasks

import app.braid.mobile.data.artifacts.ArtifactDto
import app.braid.mobile.data.artifacts.toDomain
import app.braid.mobile.data.projects.ProjectDto
import app.braid.mobile.data.projects.toDomain
import app.braid.mobile.domain.task.ArtifactRelation
import app.braid.mobile.domain.task.RequestRelation
import app.braid.mobile.domain.task.TaskActor
import app.braid.mobile.domain.task.TaskArtifact
import app.braid.mobile.domain.task.TaskCard
import app.braid.mobile.domain.task.TaskDetail
import app.braid.mobile.domain.task.TaskKind
import app.braid.mobile.domain.task.TaskPriority
import app.braid.mobile.domain.task.TaskRequest
import app.braid.mobile.domain.task.TaskSituation
import app.braid.mobile.domain.task.TaskStatus
import kotlinx.serialization.Serializable
import java.time.Instant
import java.time.OffsetDateTime

/** `taskSchema` do `packages/contracts` (`GET /api/tasks/{id}`): o cartão mais o que só o detalhe traz. */
@Serializable
data class TaskDetailDto(
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
    val notifyOffsetsMinutes: List<Int> = emptyList(),
    val tags: List<String> = emptyList(),
    val parentTaskId: String? = null,
    val recurrence: TaskRecurrenceDto? = null,
    val revision: Int,
    val subtaskIds: List<String> = emptyList(),
    val requests: List<TaskRequestDto> = emptyList(),
    val artifacts: List<TaskArtifactDto> = emptyList(),
)

/** `taskArtifactSchema`: o documento ligado, com a relação e se o vínculo veio da série. */
@Serializable
data class TaskArtifactDto(
    val relation: String,
    val fromRecurrence: Boolean = false,
    val artifact: ArtifactDto,
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
                project = project.toDomain(),
                situation = TaskSituation.fromCode(situation),
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
        artifacts = artifacts.map { TaskArtifact(ArtifactRelation.fromCode(it.relation), it.fromRecurrence, it.artifact.toDomain()) },
    )

private fun TaskRequestDto.toDomain() =
    TaskRequest(
        id = id,
        name = name,
        relation = if (relation == "generates") RequestRelation.Generates else RequestRelation.Updates,
        at = parseInstant(at),
    )
