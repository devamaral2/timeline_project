package app.braid.mobile.ui.navigation

import kotlinx.serialization.Serializable

/** Rotas tipadas do Navigation Compose; cada ticket de tela acrescenta as suas aqui. */
@Serializable
data object LoginRoute

/** A Agenda é a primeira tela depois de entrar e a base da pilha: o voltar do sistema nela sai do app. */
@Serializable
data object AgendaRoute

@Serializable
data object TasksRoute

@Serializable
data object DocumentsRoute

/** O detalhe de um documento, aberto pela lista; o ViewModel lê o [documentId] do argumento. */
@Serializable
data class DocumentDetailRoute(
    val documentId: String,
)

/** O detalhe de uma tarefa, aberto pela Agenda e pelas ligações do próprio detalhe; o ViewModel lê o [taskId] do argumento. */
@Serializable
data class TaskDetailRoute(
    val taskId: String,
)

/**
 * O formulário de tarefa: criar (sem [taskId]) ou editar. [name] é o título já digitado no `/tarefa comprar pão` do
 * chat; o ViewModel lê os dois do argumento.
 */
@Serializable
data class TaskEditRoute(
    val taskId: String? = null,
    val name: String? = null,
)
