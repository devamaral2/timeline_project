package app.braid.mobile.domain.request

import app.braid.mobile.domain.artifact.ArtifactType
import app.braid.mobile.domain.task.TaskKind
import app.braid.mobile.domain.task.TaskStatus
import java.time.Instant

/** O tipo de uma entrada do rastro do pedido; [code] é o nome do contrato. */
enum class TraceKind(
    val code: String,
) {
    Request("request"),
    Routing("routing"),
    Thought("thought"),
    Agent("agent"),
    Tool("tool"),
    Message("message"),
    Answer("answer"),
    ;

    companion object {
        fun fromCodeOrNull(code: String): TraceKind? = entries.firstOrNull { it.code == code }
    }
}

/** Uma entrada do rastro: o que o agente fez, em ordem; o texto da tela é o [summary] ou, sem ele, o [label]. */
data class TraceEntry(
    val id: String,
    val kind: TraceKind,
    val label: String,
    val source: String?,
    val summary: String?,
    val startedAt: Instant?,
)

/** Um passo do pedido, com o agente interno que o executa; o [label] já é o texto da tela. */
data class RequestStep(
    val id: String,
    val agent: String,
    val label: String,
    val status: TaskStatus,
)

enum class RequestOperation(
    val code: String,
) {
    Create("create"),
    Update("update"),
    Delete("delete"),
    ;

    companion object {
        fun fromCode(code: String): RequestOperation = entries.firstOrNull { it.code == code } ?: error("Operação desconhecida: $code")
    }
}

enum class EntityKind { Task, Artifact }

/** Uma tarefa ou documento que o pedido criou, alterou ou apagou. */
data class RequestEntity(
    val kind: EntityKind,
    val id: String,
    val name: String,
    /** Só no documento; ausente, a tela escreve "Nota". */
    val artifactType: ArtifactType?,
    val operation: RequestOperation,
)

/** O pedido ao agente (`RequestDto`): o que o detalhe da tarefa de agente lê. */
data class AgentRequest(
    val id: String,
    val kind: TaskKind,
    val status: TaskStatus,
    val title: String,
    /** O primeiro pedido da sessão; ausente quando este é o primeiro. */
    val sessionId: String?,
    val createdAt: Instant,
    val updatedAt: Instant,
    /** O que o agente faz agora; some quando o pedido termina. */
    val progress: String?,
    val errorCode: String?,
    val steps: List<RequestStep>,
    val entities: List<RequestEntity>,
    val entries: List<TraceEntry>,
)

/** O primeiro pedido da sessão, que a seção "Sessão" mostra e abre. */
sealed interface PreviousRequest {
    /** O pedido é o primeiro da sessão: a seção não aparece. */
    data object None : PreviousRequest

    data object Loading : PreviousRequest

    data class Found(
        val id: String,
        val title: String,
        val createdAt: Instant,
    ) : PreviousRequest

    data object NotFound : PreviousRequest
}

interface AgentRequestRepository {
    /** O pedido pelo id. Não existe ou é de outro usuário (404 e 403) sobe como [RequestNotFoundException]. */
    suspend fun request(id: String): AgentRequest

    /** Abre um pedido na sessão [sessionId] e devolve o id dele; reenviar o mesmo [clientMessageId] não abre outro. */
    suspend fun start(
        userId: String,
        text: String,
        sessionId: String,
        clientMessageId: String,
    ): String

    /** Cancela o que o agente não terminou e devolve o pedido. O pedido de alimento (409) sobe como [FoodRequestCancelException]. */
    suspend fun cancel(id: String): AgentRequest
}

class RequestNotFoundException(
    cause: Throwable? = null,
) : Exception("Pedido não encontrado.", cause)

class FoodRequestCancelException(
    cause: Throwable? = null,
) : Exception(FOOD_CANCEL_TEXT, cause)

const val FOOD_CANCEL_TEXT = "Este pedido calcula um alimento: apague o alimento para parar o cálculo."
