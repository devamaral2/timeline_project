package app.braid.mobile.data.tags

import app.braid.mobile.data.dto.TagSuggestionDto
import java.io.IOException
import javax.inject.Inject
import javax.inject.Singleton

sealed interface TagResult {
    data class Success(
        val suggestions: List<TagSuggestionDto>,
    ) : TagResult

    data object Failure : TagResult
}

interface TagGateway {
    suspend fun suggest(
        query: String,
        limit: Int = 6,
    ): TagResult
}

@Singleton
class TagRepository
    @Inject
    constructor(
        private val api: TagsApi,
    ) : TagGateway {
        override suspend fun suggest(
            query: String,
            limit: Int,
        ): TagResult {
            val response =
                try {
                    api.suggest(query, limit)
                } catch (_: IOException) {
                    return TagResult.Failure
                }
            if (!response.isSuccessful) return TagResult.Failure
            return TagResult.Success(response.body().orEmpty())
        }
    }
