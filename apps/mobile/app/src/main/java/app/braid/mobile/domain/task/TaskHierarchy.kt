package app.braid.mobile.domain.task

/**
 * A hierarquia na edição (ADR 0016): a tarefa principal, um lugar só, e as subtarefas, uma lista. As regras do web
 * (`TaskEditHierarchySection.tsx`) como funções puras sobre o [TaskDraft]; o rascunho guarda só os ids.
 */
enum class HierarchySlot { Parent, Subtasks }

/** Os ids que o seletor de [slot] não oferece: a tarefa aberta e, conforme o lado, as subtarefas ou a principal já ligadas. */
fun pickerExclusions(
    slot: HierarchySlot,
    openTaskId: String,
    draft: TaskDraft,
): Set<String> =
    when (slot) {
        // As subtarefas não podem ser também a principal.
        HierarchySlot.Parent -> setOf(openTaskId) + draft.subtaskIds
        // A principal não pode ser também subtarefa, e uma subtarefa já na lista não entra de novo.
        HierarchySlot.Subtasks -> setOf(openTaskId) + listOfNotNull(draft.parentTaskId) + draft.subtaskIds
    }

/** Os ids ligados à tarefa, a principal primeiro: o que a tela precisa ler para mostrar nome, tipo e quando. */
fun linkedTaskIds(draft: TaskDraft): List<String> = (listOfNotNull(draft.parentTaskId) + draft.subtaskIds).distinct()

/**
 * As tarefas que o seletor entrega entram no rascunho. Um lugar só na principal: das tarefas que o Hermes criou, a
 * primeira de cima vira a principal. Nas subtarefas entram todas, menos as que já estavam na lista.
 */
fun draftWithPicked(
    slot: HierarchySlot,
    draft: TaskDraft,
    picked: List<TaskCard>,
): TaskDraft =
    when (slot) {
        HierarchySlot.Parent -> picked.firstOrNull()?.let { draft.copy(parentTaskId = it.id) } ?: draft
        HierarchySlot.Subtasks ->
            draft.copy(
                subtaskIds =
                    draft.subtaskIds + picked.map { it.id }.filter { it !in draft.subtaskIds }.distinct(),
            )
    }

fun draftWithoutParent(draft: TaskDraft): TaskDraft = draft.copy(parentTaskId = null)

fun draftWithoutSubtask(
    draft: TaskDraft,
    id: String,
): TaskDraft = draft.copy(subtaskIds = draft.subtaskIds.filter { it != id })

/**
 * Do que o pedido ao Hermes criou, só as tarefas de cima: as que o próprio pedido pôs como subtarefa de outra criada
 * junto continuam onde ele as pôs.
 */
fun topCreatedTasks(created: List<TaskDetail>): List<TaskDetail> {
    val ids = created.map { it.id }.toSet()
    return created.filter { it.parentTaskId == null || it.parentTaskId !in ids }
}
