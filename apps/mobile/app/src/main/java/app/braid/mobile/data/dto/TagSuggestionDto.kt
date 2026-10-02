package app.braid.mobile.data.dto

import kotlinx.serialization.Serializable

/** DTO espelha `packages/contracts/src/events/contracts/tag-suggestion.dto.ts`. */
@Serializable
data class TagSuggestionDto(
    val id: String,
    val name: String,
)
