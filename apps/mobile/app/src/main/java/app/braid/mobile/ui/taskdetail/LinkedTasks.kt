package app.braid.mobile.ui.taskdetail

import app.braid.mobile.domain.task.TaskDetailRepository
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope

/** Lê uma tarefa por id, em paralelo: a que não carregou (apagada, de outro dono) some da lista e acende `failed`. */
internal suspend fun TaskDetailRepository.readLinked(ids: List<String>): LinkedTasks =
    coroutineScope {
        val results =
            ids
                .map { id ->
                    async {
                        try {
                            task(id).card
                        } catch (cancelled: CancellationException) {
                            throw cancelled
                        } catch (failure: Exception) {
                            null
                        }
                    }
                }.awaitAll()
        LinkedTasks(cards = results.filterNotNull(), failed = results.any { it == null })
    }
