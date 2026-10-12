package app.braid.mobile.ui.hub

import androidx.compose.runtime.saveable.listSaver

/** Guarda o rascunho da tarefa ao girar a tela, como os campos do web que ficam no estado do painel. */
internal val TaskDraftSaver =
    listSaver<TaskDraft, String>(
        save = { listOf(it.name, it.details, it.status, it.priority) },
        restore = { TaskDraft(name = it[0], details = it[1], status = it[2], priority = it[3]) },
    )
