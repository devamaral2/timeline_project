package app.braid.mobile.domain.task

/*
 * Port de `apps/web/src/lib/tasks/task-drawers.ts`: as quatro gavetas da lista de Tarefas, pela ação que a tarefa pede.
 * Funções puras, conferidas contra o fixture gerado pela função do web (`TaskDrawersTest`). Os grupos de status de agente
 * vêm de `AgentStatusGroups.kt`, nunca de lista própria.
 */

/** As gavetas da lista, na ordem da tela, e a de execução, que não é desenhada na lista. */
enum class TaskDrawerKey(
    /** O nome que o web usa para a gaveta: o fixture e o teste se entendem por ele. */
    val code: String,
    val title: String,
    /** Para depois e Finalizadas vêm fechadas; abrem ao toque. */
    val collapsedByDefault: Boolean,
    /** Desenhada na lista; o trabalho em andamento do agente só aparece na gaveta de execução do shell. */
    val listed: Boolean = true,
) {
    Now("now", "Para agora", false),
    Continuous("continuous", "Contínuas", false),
    Later("later", "Para depois", true),
    Ended("ended", "Finalizadas", true),
    Execution("execution", "Execução", false, listed = false),
}

class TaskDrawer(
    val key: TaskDrawerKey,
    /** Os cartões da gaveta: primeiro os de pessoa, depois os de agente, cada grupo na ordem recebida. */
    val cards: List<TaskCard>,
) {
    val title: String get() = key.title
    val collapsedByDefault: Boolean get() = key.collapsedByDefault
}

/** A gaveta de uma situação de pedido de agente que terminou; sem situação ou desconhecida, Finalizadas. */
private fun drawerOfSituation(situation: TaskSituation?): TaskDrawerKey =
    when (situation) {
        TaskSituation.ToReview -> TaskDrawerKey.Now
        TaskSituation.Bookmarked -> TaskDrawerKey.Later
        TaskSituation.Reviewed, TaskSituation.Unknown, null -> TaskDrawerKey.Ended
    }

/** A gaveta de um status de pessoa; o status desconhecido fica à vista, em Para agora, como antes ficava em "A fazer". */
private fun drawerOfHuman(status: TaskStatus): TaskDrawerKey =
    when (status) {
        TaskStatus.ToDefine, TaskStatus.InHold -> TaskDrawerKey.Later
        TaskStatus.Done, TaskStatus.Cancel, TaskStatus.Missed -> TaskDrawerKey.Ended
        else -> TaskDrawerKey.Now
    }

/**
 * A gaveta de um cartão. Pedido de agente em andamento é [TaskDrawerKey.Execution] (fora da lista); esperando a resposta é
 * Para agora; terminado vai pela situação (sem nenhuma, Finalizadas). A execução agendada é sempre Contínuas, com qualquer
 * status, assim como a tarefa longa de pessoa que ainda não acabou. Sem status (referência) não há gaveta.
 */
fun drawerOf(card: TaskCard): TaskDrawerKey? {
    val status = card.status ?: return null
    if (card.actor == TaskActor.Agent) {
        return when {
            card.kind == TaskKind.Cron -> TaskDrawerKey.Continuous
            isInProgressAgentStatus(status) -> TaskDrawerKey.Execution
            isOpenAgentStatus(status) || status == TaskStatus.Unknown -> TaskDrawerKey.Now
            else -> drawerOfSituation(card.situation)
        }
    }
    if (card.longRunning && !isClosedStatus(card.actor, status)) return TaskDrawerKey.Continuous
    return drawerOfHuman(status)
}

/**
 * Os cartões que podem virar linha da lista: tira o trabalho em andamento do agente, que mora só na gaveta de execução.
 * Vai antes de [nestSubtasks], para a subtarefa cuja principal está em andamento continuar como linha.
 */
fun listedCards(cards: List<TaskCard>): List<TaskCard> = cards.filter { drawerOf(it) != TaskDrawerKey.Execution }

/**
 * Reparte as linhas nas gavetas da lista, na ordem da tela. Em cada uma a pessoa vem antes do agente. Cartão em andamento,
 * sem status ou de gaveta vazia não é devolvido.
 */
fun drawersOf(cards: List<TaskCard>): List<TaskDrawer> =
    TaskDrawerKey.entries
        .filter { it.listed }
        .map { key ->
            val inDrawer = cards.filter { drawerOf(it) == key }
            TaskDrawer(key, inDrawer.filter { it.actor != TaskActor.Agent } + inDrawer.filter { it.actor == TaskActor.Agent })
        }.filter { it.cards.isNotEmpty() }

/** "5 tarefas para agora": a legenda em mono no topo da tela. */
fun toNowLabel(count: Int): String =
    when (count) {
        0 -> "Nenhuma tarefa para agora"
        1 -> "1 tarefa para agora"
        else -> "$count tarefas para agora"
    }
