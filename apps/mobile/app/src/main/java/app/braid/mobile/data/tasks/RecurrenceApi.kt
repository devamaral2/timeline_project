package app.braid.mobile.data.tasks

import app.braid.mobile.domain.task.RecurrenceFrequency
import app.braid.mobile.domain.task.RecurrenceRule
import app.braid.mobile.domain.task.RecurrenceSeries
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.Header
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.Path

/** As séries de recorrência (`recurrencesRoutes` do web); os corpos de escrita são montados à mão, campo ausente não muda. */
interface RecurrenceApi {
    @GET("api/recurrences/{id}")
    suspend fun series(
        @Path("id") id: String,
    ): RecurrenceSeriesDto

    /** `POST /api/recurrences` responde 201 `{ recurrenceId }`. */
    @POST("api/recurrences")
    suspend fun create(
        @Header("Idempotency-Key") idempotencyKey: String,
        @Body body: JsonObject,
    ): CreatedRecurrenceDto

    /** `PATCH /api/recurrences/{id}` responde 204; o corpo é o `UpdateRecurrenceInput` sem o id. */
    @PATCH("api/recurrences/{id}")
    suspend fun update(
        @Path("id") id: String,
        @Body body: JsonObject,
    )

    /** `DELETE /api/recurrences/{id}` responde 204. */
    @DELETE("api/recurrences/{id}")
    suspend fun delete(
        @Path("id") id: String,
    )
}

@Serializable
data class CreatedRecurrenceDto(
    val recurrenceId: String,
)

/** `recurrenceSchema`: a regra, a revisão e o modelo (que o app não lê). */
@Serializable
data class RecurrenceSeriesDto(
    val id: String,
    val revision: Int,
    val frequency: String,
    val interval: Int,
    val byWeekday: Int? = null,
    val byMonthDay: Int? = null,
    val byMonth: Int? = null,
    val timeOfDay: String,
    val startsOn: String,
    val endsOn: String? = null,
)

fun RecurrenceSeriesDto.toDomain(): RecurrenceSeries =
    RecurrenceSeries(
        id = id,
        revision = revision,
        rule =
            RecurrenceRule(
                frequency = RecurrenceFrequency.fromCode(frequency),
                interval = interval,
                byWeekday = byWeekday,
                byMonthDay = byMonthDay,
                byMonth = byMonth,
                timeOfDay = timeOfDay,
                startsOn = startsOn,
                endsOn = endsOn,
            ),
    )
