package app.braid.mobile.domain.task

/**
 * A situação da tarefa de agente que terminou, que o usuário controla (`TaskSituation` do contrato). [Unknown] é o código
 * que a API mandou e este app não conhece: lê-se sem erro e se desenha neutro; nunca é enviado.
 */
enum class TaskSituation(
    val code: String,
) {
    ToReview("to_review"),
    Reviewed("reviewed"),
    Bookmarked("bookmarked"),
    Unknown("unknown"),
    ;

    companion object {
        /** Ausente é a tarefa sem situação (`null`); um código fora do enum vira [Unknown] em vez de derrubar a leitura. */
        fun fromCode(code: String?): TaskSituation? = code?.let { value -> entries.firstOrNull { it.code == value } ?: Unknown }
    }
}

/** As três situações que o menu oferece, na ordem em que o web as mostra (`TASK_SITUATIONS`). */
val TASK_SITUATIONS: List<TaskSituation> = listOf(TaskSituation.ToReview, TaskSituation.Reviewed, TaskSituation.Bookmarked)
