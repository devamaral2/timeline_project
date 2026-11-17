package app.braid.mobile.support

import app.braid.mobile.core.network.BraidJson
import app.braid.mobile.data.tasks.TaskDetailDto
import app.braid.mobile.data.tasks.toDomain
import app.braid.mobile.domain.task.TaskDetail
import app.braid.mobile.domain.task.TaskDraft
import app.braid.mobile.domain.task.TaskKind
import app.braid.mobile.domain.task.TaskPriority
import app.braid.mobile.domain.task.TaskStatus
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

/** Os rascunhos e as tarefas das fixtures do formulário, lidos como o app os lê. */
object TaskEditFixtures {
    fun detail(element: JsonElement): TaskDetail = BraidJson.decodeFromJsonElement(TaskDetailDto.serializer(), element).toDomain()

    /** A tarefa [key] de `task-edit-tasks`. */
    fun task(key: String): TaskDetail = detail(Fixtures.json("task-edit-tasks").jsonObject.getValue(key))

    fun draft(element: JsonElement): TaskDraft {
        val fields = element.jsonObject

        fun text(name: String) = fields.getValue(name).jsonPrimitive.content
        return TaskDraft(
            kind = TaskKind.fromCode(text("kind")),
            name = text("name"),
            status = fields.getValue("status").takeUnless { it is JsonNull }?.let { TaskStatus.fromCode(it.jsonPrimitive.content) },
            priority = TaskPriority.fromCode(text("priority")),
            startDate = text("startDate"),
            startTime = text("startTime"),
            endDate = text("endDate"),
            endTime = text("endTime"),
            description = text("description"),
            location = text("location"),
            reminders = fields.getValue("reminders").jsonArray.map { it.jsonPrimitive.int },
            tags = fields.getValue("tags").jsonArray.map { it.jsonPrimitive.content },
            longRunning = fields.getValue("longRunning").jsonPrimitive.boolean,
        )
    }

    fun cases(name: String): List<JsonObject> = Fixtures.json(name).jsonArray.map { it.jsonObject }
}
