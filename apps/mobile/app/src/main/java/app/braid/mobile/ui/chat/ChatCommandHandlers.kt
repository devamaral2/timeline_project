package app.braid.mobile.ui.chat

import androidx.compose.runtime.Immutable
import app.braid.mobile.domain.chat.ChatCommand

/**
 * O que cada comando do chat faz. Só os comandos com tela aparecem como atalho na tela inicial e na barra "/": cada ticket
 * que entrega uma tela (`/tarefa`, `/nota`, `/notificacoes`, `/configuracoes`) acrescenta a sua entrada aqui, em
 * `AppNavHost`, e o chat passa a mostrá-la sem outra mudança. O texto depois do comando chega como argumento.
 */
@Immutable
class ChatCommandHandlers(
    private val handlers: Map<ChatCommand, (argument: String) -> Unit> = emptyMap(),
) {
    /** Os comandos que existem, na ordem do web. */
    val available: List<ChatCommand> = ChatCommand.entries.filter { it in handlers }

    fun run(
        command: ChatCommand,
        argument: String,
    ) {
        handlers[command]?.invoke(argument)
    }
}
