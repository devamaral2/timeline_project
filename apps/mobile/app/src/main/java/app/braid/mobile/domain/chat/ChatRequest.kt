package app.braid.mobile.domain.chat

/** Por onde o pedido anda: `steps` desdobra em passos, `hermes` entrega ao Hermes; as outras duas o chat não mostra. */
enum class ChatRoute(
    val code: String,
) {
    Steps("steps"),
    Hermes("hermes"),
    Voice("voice"),
    Food("food"),
    ;

    companion object {
        fun fromCode(code: String): ChatRoute = entries.firstOrNull { it.code == code } ?: Steps
    }
}

/** O estado do pedido na API (`AgentTaskStatus`). Fila, execução e espera são "aberto". */
enum class ChatStatus(
    val code: String,
) {
    Queued("queued"),
    Running("running"),
    Waiting("waiting"),
    Done("done"),
    Failed("failed"),
    Cancel("cancel"),
    ;

    val isOpen: Boolean get() = this == Queued || this == Running || this == Waiting

    companion object {
        fun fromCode(code: String): ChatStatus = entries.firstOrNull { it.code == code } ?: Failed
    }
}

/** As linhas de uma consulta, já como texto de célula (`cellText` do web). */
data class QueryTable(
    val columns: List<String>,
    val rows: List<List<String>>,
    val truncated: Boolean,
)

/** Um passo do pedido: o [label] já é o texto da caixa de processo. */
data class ChatStep(
    val id: String,
    val label: String,
    val status: ChatStatus,
    val result: QueryTable?,
)

enum class ChatEntityKind { Task, Artifact }

enum class ChatEntityChange { Created, Updated, Deleted }

/** Uma tarefa ou documento que o pedido criou, alterou ou apagou. */
data class ChatEntity(
    val kind: ChatEntityKind,
    val id: String,
    val name: String,
    val change: ChatEntityChange,
)

enum class TraceKind(
    val code: String,
    val title: String,
) {
    Request("request", "Pedido"),
    Routing("routing", "Roteamento"),
    Thought("thought", "Raciocínio"),
    Agent("agent", "Agente"),
    Tool("tool", "Ferramenta"),
    Message("message", "Comentário"),
    Answer("answer", "Resposta"),
    ;

    companion object {
        fun fromCodeOrNull(code: String): TraceKind? = entries.firstOrNull { it.code == code }
    }
}

enum class TraceStatus(
    val code: String,
    val text: String,
) {
    Pending("pending", "aguardando"),
    Running("running", "em andamento"),
    Done("done", "concluído"),
    Failed("failed", "falhou"),
    ;

    companion object {
        fun fromCode(code: String): TraceStatus = entries.firstOrNull { it.code == code } ?: Pending
    }
}

data class TraceField(
    val label: String,
    val value: String,
)

data class TraceSection(
    val title: String,
    val text: String,
    val code: Boolean,
)

/** Uma entrada do rastro; o rótulo já vem escrito pelo servidor. */
data class TraceEntry(
    val id: String,
    val kind: TraceKind,
    val label: String,
    val source: String?,
    val summary: String?,
    val status: TraceStatus,
    val startedAtMs: Long?,
    val durationMs: Double?,
    val fields: List<TraceField>,
    val sections: List<TraceSection>,
    /** O registro como o servidor o tem, em JSON legível, para a vista "Bruto". */
    val rawJson: String,
)

enum class TraceRunStatus { Running, Done, Failed }

/** O rastro do pedido, para a aba "Processo"; a rota por passos e a do Hermes falam a mesma forma. */
data class ChatTrace(
    val status: TraceRunStatus,
    val startedAtMs: Long?,
    val durationMs: Double?,
    val fields: List<TraceField>,
    val entries: List<TraceEntry>,
)

/** O pedido ao agente (`RequestDto`): o que o chat lê e acompanha. */
data class ChatRequest(
    val id: String,
    val route: ChatRoute,
    val status: ChatStatus,
    val title: String,
    val text: String?,
    val steps: List<ChatStep>,
    val entities: List<ChatEntity>,
    val message: String?,
    val errorCode: String?,
    val trace: ChatTrace?,
)
