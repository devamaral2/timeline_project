package app.braid.mobile.domain.task

import java.time.Instant

interface TaskRepository {
    /**
     * Os cartões de tarefa com início na janela [from, to]. [actor] pede só as tarefas da pessoa ou só as dos
     * agentes; `null` traz as duas.
     * Segue o cursor até a última página e descarta o cartão que uma página
     * repete (o usuário pode criar uma tarefa entre duas páginas). Falha de rede
     * ou de resposta sobe como exceção.
     */
    suspend fun agenda(
        from: Instant,
        to: Instant,
        actor: TaskActor? = null,
    ): List<TaskCard>
}
