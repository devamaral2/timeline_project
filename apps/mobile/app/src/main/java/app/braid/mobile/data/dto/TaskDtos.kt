package app.braid.mobile.data.dto

import kotlinx.serialization.Serializable

/** Espelha `TaskSummaryDto` de `packages/contracts/src/tasks/contracts`. */
@Serializable
data class TaskSummaryDto(
    val id: String,
    val parentTaskId: String? = null,
    val name: String,
    /** `inHold`, `todo`, `inProgress`, `done` ou `cancel`. */
    val status: String,
    /** `low`, `medium`, `high` ou `urgent`. */
    val priority: String,
    val notifyOffsetsMinutes: List<Double> = emptyList(),
    val tags: List<String> = emptyList(),
    val startedAt: String? = null,
    val estimatedFinishAt: String? = null,
    val finishedAt: String? = null,
)

/** Espelha `CreateTaskInput`: só o que o hub “Criar” preenche. */
@Serializable
data class CreateTaskInputDto(
    val name: String,
    val description: String? = null,
    val status: String? = null,
    val priority: String? = null,
)

@Serializable
data class CreateTaskResponseDto(
    val taskId: String,
)
