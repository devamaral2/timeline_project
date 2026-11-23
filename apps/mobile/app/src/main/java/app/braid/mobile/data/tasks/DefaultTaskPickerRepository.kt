package app.braid.mobile.data.tasks

import app.braid.mobile.domain.task.TaskCard
import app.braid.mobile.domain.task.TaskPickerRepository
import javax.inject.Inject

/** Quantas tarefas o seletor pede de cada vez, como o web (`CHOICE_LIMIT`). */
const val PICKER_LIMIT = 50

class DefaultTaskPickerRepository
    @Inject
    constructor(
        private val api: TaskPickerApi,
    ) : TaskPickerRepository {
        override suspend fun search(query: String): List<TaskCard> =
            api.search(query.ifEmpty { null }, PICKER_LIMIT).map(TaskCardDto::toDomain)
    }
