package app.braid.mobile.data.dto

import kotlinx.serialization.Serializable

/** DTOs espelham `packages/contracts/src/agent/contracts`. */
@Serializable
data class AgentChatEntityRefDto(
    val kind: String,
    val id: String,
    val change: String,
    val label: String? = null,
)

@Serializable
data class AgentScreenContextDto(
    val screen: String,
    val entityId: String? = null,
)
