package app.braid.mobile.data.dto

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement

/** DTOs espelham `packages/contracts/src/agent/contracts/ai-process.dto.ts` (ADR 003, rota de IA por processo). */
@Serializable
data class StartAiProcessDto(
    val userId: String,
    val text: String,
    val context: AgentScreenContextDto? = null,
)

@Serializable
data class StartAiProcessResponseDto(
    val processId: String,
)

/** As linhas de uma consulta, limitadas pelo servidor. */
@Serializable
data class AiProcessQueryResultDto(
    val columns: List<String>,
    val rows: List<List<JsonElement>>,
    val truncated: Boolean,
)

/** Um trabalho do processo; `label` já é o texto predefinido que a caixa mostra. */
@Serializable
data class AiProcessStepDto(
    val id: String,
    val agent: String,
    val label: String,
    val status: String,
    val errorCode: String? = null,
    val result: AiProcessQueryResultDto? = null,
) {
    val succeeded: Boolean get() = status == "succeeded"
    val failed: Boolean get() = status == "failed"
    val running: Boolean get() = status == "running"
}

@Serializable
data class AiProcessLinkDto(
    val kind: String,
    val id: String,
)

@Serializable
data class AiProcessEntityDto(
    val kind: String,
    val id: String,
    val name: String,
    val operation: String,
    val linkedTo: List<AiProcessLinkDto> = emptyList(),
)

/** A caixa de processo: título, passos com seu estado e, no fim, a mensagem (resposta do fallback ou o que falhou). */
@Serializable
data class AiProcessDto(
    val id: String,
    val status: String,
    val title: String,
    val steps: List<AiProcessStepDto> = emptyList(),
    val entities: List<AiProcessEntityDto> = emptyList(),
    val message: String? = null,
) {
    val terminal: Boolean get() = status == "completed" || status == "failed"
}
