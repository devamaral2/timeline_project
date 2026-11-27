package app.braid.mobile.support

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.mockwebserver.MockResponse

private fun json(text: String) = MockResponse().setHeader("Content-Type", "application/json").setBody(text)

/** `GET /api/tasks/{id}` serve cada tarefa de `task-artifacts-tasks`, pelo id. */
fun TestBackend.serveArtifactTasks() {
    val tasks: JsonObject = Fixtures.json("task-artifacts-tasks").jsonObject
    for (task in tasks.values) {
        route("GET", "/api/tasks/${task.jsonObject.getValue("id").jsonPrimitive.content}", json(task.toString()))
    }
}

/**
 * `GET /api/artifacts` como os seletores da tarefa o consomem: o catálogo global de alimentos, os alimentos do usuário,
 * os exercícios globais e os artefatos do usuário; com `q`, a versão filtrada.
 */
fun TestBackend.serveArtifactChoices() {
    route("GET", "/api/artifacts") { request ->
        val url = request.requestUrl
        val type = url?.queryParameter("type")
        val global = url?.queryParameter("scope") == "global"
        val filtered = url?.queryParameter("q") != null
        val name =
            when {
                type == "food" && global -> "task-artifacts-picker-foods-global" + if (filtered) "-filtered" else ""
                type == "food" -> "task-artifacts-picker-foods-own" + if (filtered) "-filtered" else ""
                type == "workout" -> "task-artifacts-picker-exercises"
                else -> if (filtered) "task-artifacts-picker-own-filtered" else "task-artifacts-picker-own"
            }
        json(Fixtures.text(name))
    }
}
