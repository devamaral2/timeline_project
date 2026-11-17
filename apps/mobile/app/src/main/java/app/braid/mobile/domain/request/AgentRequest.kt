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

/** O estado de uma entrada do rastro; [text] é o que o leitor de tela ouve. */
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

/** Um par "Modelo: gpt-x" do resumo de um passo ou do pedido inteiro. */
data class TraceField(
    val label: String,
    val value: String,
)

/** Um bloco de texto do passo (a entrada, o resultado, o raciocínio); [code] pede fonte mono. */
data class TraceSection(
    val title: String,
    val text: String,
    val code: Boolean,
)

/**
 * Uma entrada do rastro: o que o agente fez, em ordem; o texto da tela é o [summary] ou, sem ele, o [label]. A aba "Processo"
 * do chat lê também o estado, a duração, os campos, os blocos de texto e o registro bruto ([rawJson], em JSON legível).
 */
data class TraceEntry(
    val id: String,
    val kind: TraceKind,
    val label: String,
    val source: String?,
    val summary: String?,
    val startedAt: Instant?,
    val status: TraceStatus = TraceStatus.Pending,
    val durationMs: Double? = null,
    val fields: List<TraceField> = emptyList(),
    val sections: List<TraceSection> = emptyList(),
    val rawJson: String = "",
)

enum class TraceRunStatus { Running, Done, Failed }

/** O rastro do pedido inteiro, para a aba "Processo" do chat; a rota por passos e a do Hermes falam a mesma forma. */
data class AgentTrace(
    val status: TraceRunStatus,
    val startedAt: Instant?,
    val durationMs: Double?,
    val fields: List<TraceField>,
    val entries: List<TraceEntry>,
)

/** As linhas de uma consulta, já como texto de célula. */
data class QueryTable(
    val columns: List<String>,
    val rows: List<List<String>>,
    val truncated: Boolean,
)

/** Um passo do pedido, com o agente interno que o executa; o [label] já é o texto da tela. */
data class RequestStep(
    val id: String,
    val agent: String,
    val label: String,
    val status: TaskStatus,
    /** As linhas da consulta, só no passo de consulta. */
    val result: QueryTable? = null,
)

/** Por onde o pedido anda: `steps` desdobra em passos, `hermes` entrega ao Hermes; as outras duas o chat não mostra. */
enum class RequestRoute(
    val code: String,
) {
    Steps("steps"),
    Hermes("hermes"),
    Voice("voice"),
    Food("food"),
    ;

    companion object {
        fun fromCode(code: String): RequestRoute = entries.firstOrNull { it.code == code } ?: Steps
    }
}

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
    /** A resposta do Hermes quando o pedido termina; ausente nos pedidos que só mexem na agenda. */
    val message: String? = null,
    val route: RequestRoute = RequestRoute.Steps,
    /** O que o usuário escreveu ou falou. */
    val text: String? = null,
    /** O rastro com os totais, para a aba "Processo"; [entries] é a lista dele. */
    val trace: AgentTrace? = null,
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

    /**
     * Abre um pedido na sessão [sessionId] (`null`: um pedido sem sessão, como o do seletor de tarefas) e devolve o id
     * dele; reenviar o mesmo [clientMessageId] não abre outro.
     */
    suspend fun start(
        userId: String,
        text: String,
        sessionId: String?,
        clientMessageId: String,
    ): String

    /** Abre um pedido de edição da entidade aberta na tela (`POST /api/requests/edit`) e devolve o id dele. */
    suspend fun startEdit(
        userId: String,
        text: String,
        entityType: EditEntityType,
        entityId: String,
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
