package app.braid.mobile.data.events

import app.braid.mobile.data.dto.CreateEventInputDto
import app.braid.mobile.data.dto.CreateEventResponseDto
import app.braid.mobile.data.dto.EventDetailDto
import app.braid.mobile.data.dto.TimelineEventPageDto
import app.braid.mobile.data.dto.UpdateEventInputDto
import app.braid.mobile.data.dto.VoiceEventInputDto
import app.braid.mobile.data.dto.VoiceEventResponseDto
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

interface EventsApi {
    @POST("api/events")
    suspend fun create(
        @Body input: CreateEventInputDto,
    ): Response<CreateEventResponseDto>

    @GET("api/events/{eventId}")
    suspend fun detail(
        @Path("eventId") eventId: String,
    ): Response<EventDetailDto>

    @PATCH("api/events/{eventId}")
    suspend fun update(
        @Path("eventId") eventId: String,
        @Body input: UpdateEventInputDto,
    ): Response<Unit>

    @DELETE("api/events/{eventId}")
    suspend fun delete(
        @Path("eventId") eventId: String,
    ): Response<Unit>

    @POST("api/events/voice")
    suspend fun createFromVoice(
        @Body input: VoiceEventInputDto,
    ): Response<VoiceEventResponseDto>

    @GET("api/events")
    suspend fun window(
        @Query("from") from: String,
        @Query("to") to: String,
        @Query("type") type: String? = null,
        @Query("tag") tag: String? = null,
        @Query("cursor") cursor: String? = null,
        @Query("limit") limit: Int? = null,
    ): Response<TimelineEventPageDto>
}
