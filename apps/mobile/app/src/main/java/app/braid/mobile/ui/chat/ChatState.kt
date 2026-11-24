package app.braid.mobile.ui.chat

import app.braid.mobile.domain.agenda.FreeWindow
import app.braid.mobile.domain.chat.ChatAgent
import app.braid.mobile.domain.chat.HermesStep
import app.braid.mobile.domain.chat.ModelPicker
import app.braid.mobile.domain.chat.ModelSelectorState
import app.braid.mobile.domain.request.AgentRequest
import app.braid.mobile.domain.request.AgentTrace
import app.braid.mobile.domain.request.ModelSelection
import app.braid.mobile.domain.request.RequestEntity
import app.braid.mobile.domain.request.RequestRoute

/** Uma linha da conversa. */
sealed interface ChatMessage {
    val id: String

    data class User(
        override val id: String,
        val text: String,
        val failed: Boolean = false,
    ) : ChatMessage

    /** A resposta (ou um aviso do chat, como o do modo Hermes): markdown, sempre texto puro. */
    data class Assistant(
        override val id: String,
        val text: String,
        val entities: List<RequestEntity> = emptyList(),
        /** A escolha que atendeu a resposta (modo modelo): a conversa a mostra no rodapé dela. */
        val model: ModelSelection? = null,
    ) : ChatMessage

    /**
     * [messageId] é o id da mensagem que falhou (o que a API guarda como `clientMessageId`); [reuseMessageId] diz se "Tentar
     * de novo" reenvia com o mesmo id (a API devolve o pedido que já aceitou) ou abre um novo.
     */
    data class Error(
        override val id: String,
        val text: String,
        val retryText: String,
        val messageId: String,
        val reuseMessageId: Boolean,
    ) : ChatMessage

    /** A caixa de processo: [request] é nulo até o servidor responder o primeiro estado. */
    data class Process(
        override val id: String,
        val request: AgentRequest?,
    ) : ChatMessage

    /** Os passos do Hermes ou do modelo (ferramentas e pensamentos), ao vivo e depois do fim do turno. */
    data class HermesSteps(
        override val id: String,
        val steps: List<HermesStep>,
        val running: Boolean,
    ) : ChatMessage
}

/** O rastro de um pedido, para a aba "Processo": um por pedido enviado, na ordem da conversa. */
data class ChatTurn(
    /** O id da mensagem do usuário. */
    val id: String,
    val request: String,
    val route: RequestRoute,
    val running: Boolean,
    val trace: AgentTrace?,
)

data class ChatPending(
    val id: String,
    val label: String?,
    /** O pedido aceito pela API (o que o botão de cancelar cancela); ausente até a API aceitar. */
    val requestId: String? = null,
)

/** O estado do robô do botão do agente: segue o chat mesmo com ele fechado. */
enum class BotState { Idle, Listening, Thinking, Done, Error }

/** "Conversa" mostra as respostas; "Processo", a linha do tempo de cada pedido. */
enum class ChatPane { Conversation, Process }

/** A voz do chat: o microfone aberto, o que já foi ouvido e o que a pessoa precisa saber dele. */
data class VoiceUiState(
    /** O aparelho reconhece fala; sem isso o botão do microfone nem aparece. */
    val available: Boolean = false,
    val listening: Boolean = false,
    /** O que a sessão já ouviu (frases fechadas e a que ainda sai): aparece no campo enquanto o microfone está aberto. */
    val heard: String = "",
    /** O erro de voz que a pessoa vê: só quando foi ela quem tocou no microfone. */
    val notice: String? = null,
    /** A tela deve mostrar o pedido de permissão do sistema e devolver a resposta em `microphoneResult`. */
    val askPermission: Boolean = false,
)

data class ChatUiState(
    val open: Boolean = false,
    val messages: List<ChatMessage> = emptyList(),
    val pending: ChatPending? = null,
    val turns: List<ChatTurn> = emptyList(),
    /**
     * O agente que recebe as mensagens: `/hermes` ou um comando de modelo (`/modelo`, `/claude`…) liga o modo até `/app`, ou
     * até começar de novo. `null` é o assistente da agenda.
     */
    val agentMode: ChatAgent? = null,
    /** A escolha de modelo do app: o que o servidor oferece e a escolha atual (cada troca vale já e fica no aparelho). */
    val model: ModelSelectorState = ModelSelectorState(),
    /** Há usuário: sem ele nada é enviado. */
    val ready: Boolean = false,
    val signedOut: Boolean = false,
    val bot: BotState = BotState.Idle,
    val pane: ChatPane = ChatPane.Conversation,
    /** A janela livre da Agenda que abriu o chat: vai anexada ao campo e ao próximo pedido. */
    val freeWindow: FreeWindow? = null,
    val todayKey: String = "",
    val voice: VoiceUiState = VoiceUiState(),
) {
    val isConversation: Boolean get() = messages.isNotEmpty()

    /**
     * O seletor de modelo do campo: existe com as opções do servidor lidas, no assistente da agenda (a escolha vai em cada
     * pedido) e no modo modelo. No modo Hermes não há escolha de modelo, e ele some.
     */
    val picker: ModelPicker? get() = if (agentMode == ChatAgent.Hermes) null else model.picker
}
