package app.braid.mobile.data.tags

import app.braid.mobile.data.dto.TagSuggestionDto
import retrofit2.Response
import retrofit2.http.GET
import retrofit2.http.Query

interface TagsApi {
    @GET("api/tags")
    suspend fun suggest(
        @Query("query") query: String,
        @Query("limit") limit: Int,
    ): Response<List<TagSuggestionDto>>
}
