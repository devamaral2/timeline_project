package app.braid.mobile.domain.executor

import app.braid.mobile.domain.task.TaskActor
import kotlinx.coroutines.flow.Flow

/**
 * De quem são as tarefas que as seções mostram: as suas, as dos agentes ou as
 * duas. [actor] é o filtro que vai às consultas; `null` deixa a API devolver os
 * dois. A escolha é uma só para Agenda, Tarefas e Artefatos.
 */
enum class ViewMode(
    val code: String,
    val actor: TaskActor?,
) {
    Human("human", TaskActor.Human),
    Agent("agent", TaskActor.Agent),
    All("all", null),
    ;

    companion object {
        val Default = All

        /** O modo com este código; qualquer outro valor (inclusive `null`) vale o padrão. */
        fun fromCode(code: String?): ViewMode = entries.firstOrNull { it.code == code } ?: Default
    }
}

/** A escolha de executor, guardada no aparelho: sobrevive a fechar o app. */
interface ViewModeRepository {
    val mode: Flow<ViewMode>

    suspend fun select(mode: ViewMode)
}
