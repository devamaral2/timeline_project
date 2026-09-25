package app.braid.mobile.data.events

import app.braid.mobile.data.dto.CreateEventInputDto
import app.braid.mobile.data.dto.CreateEventResponseDto
import app.braid.mobile.data.dto.EventDetailDto
import app.braid.mobile.data.dto.TimelineEventPageDto
import app.braid.mobile.data.dto.UpdateEventInputDto
import app.braid.mobile.domain.timeline.zonedDayEnd
import app.braid.mobile.domain.timeline.zonedDayStart
import java.io.IOException
import java.time.Instant
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.util.concurrent.ConcurrentHashMap
import javax.inject.Inject
import javax.inject.Singleton

data class EventQuery(
    val type: String? = null,
    val tag: String? = null,
    val cursor: String? = null,
    val limit: Int? = null,
)

enum class EventErrorKind {
    Unavailable,
    Http,
    Protocol,
}

data class EventRepositoryError(
    val kind: EventErrorKind,
    val status: Int? = null,
)

sealed interface EventResult<out T> {
    data class Success<T>(
        val value: T,
        val fromCache: Boolean = false,
    ) : EventResult<T>

    data class Failure(
        val error: EventRepositoryError,
    ) : EventResult<Nothing>
}

interface EventGateway {
    suspend fun create(input: CreateEventInputDto): EventResult<CreateEventResponseDto>

    suspend fun detail(eventId: String): EventResult<EventDetailDto>

    suspend fun update(input: UpdateEventInputDto): EventResult<Unit>

    suspend fun delete(eventId: String): EventResult<Unit>

    suspend fun day(
        dayKey: String,
        query: EventQuery = EventQuery(),
        forceRefresh: Boolean = false,
    ): EventResult<TimelineEventPageDto>
}

@Singleton
class EventRepository
    @Inject
    constructor(
        private val api: EventsApi,
    ) : EventGateway {
        private val cache = ConcurrentHashMap<CacheKey, TimelineEventPageDto>()

        override suspend fun create(input: CreateEventInputDto): EventResult<CreateEventResponseDto> {
            val response =
                try {
                    api.create(input)
                } catch (_: IOException) {
                    return EventResult.Failure(EventRepositoryError(EventErrorKind.Unavailable))
                }

            if (!response.isSuccessful) {
                return EventResult.Failure(EventRepositoryError(EventErrorKind.Http, response.code()))
            }
            val created = response.body() ?: return EventResult.Failure(EventRepositoryError(EventErrorKind.Protocol, 502))
            return EventResult.Success(created)
        }

        override suspend fun detail(eventId: String): EventResult<EventDetailDto> {
            val response =
                try {
                    api.detail(eventId)
                } catch (_: IOException) {
                    return EventResult.Failure(EventRepositoryError(EventErrorKind.Unavailable))
                }

            if (!response.isSuccessful) {
                return EventResult.Failure(EventRepositoryError(EventErrorKind.Http, response.code()))
            }
            val event = response.body() ?: return EventResult.Failure(EventRepositoryError(EventErrorKind.Protocol, 502))
            return EventResult.Success(event)
        }

        override suspend fun update(input: UpdateEventInputDto): EventResult<Unit> {
            val response =
                try {
                    api.update(input.eventId, input)
                } catch (_: IOException) {
                    return EventResult.Failure(EventRepositoryError(EventErrorKind.Unavailable))
                }
            if (!response.isSuccessful) {
                return EventResult.Failure(EventRepositoryError(EventErrorKind.Http, response.code()))
            }
            return EventResult.Success(Unit)
        }

        override suspend fun delete(eventId: String): EventResult<Unit> {
            val response =
                try {
                    api.delete(eventId)
                } catch (_: IOException) {
                    return EventResult.Failure(EventRepositoryError(EventErrorKind.Unavailable))
                }
            if (!response.isSuccessful) {
                return EventResult.Failure(EventRepositoryError(EventErrorKind.Http, response.code()))
            }
            return EventResult.Success(Unit)
        }

        override suspend fun day(
            dayKey: String,
            query: EventQuery,
            forceRefresh: Boolean,
        ): EventResult<TimelineEventPageDto> =
            window(
                from = formatApiInstant(zonedDayStart(dayKey)),
                to = formatApiInstant(zonedDayEnd(dayKey)),
                query = query,
                cacheKey = dayKey,
                forceRefresh = forceRefresh,
            )

        suspend fun window(
            from: Instant,
            to: Instant,
            query: EventQuery = EventQuery(),
            forceRefresh: Boolean = false,
        ): EventResult<TimelineEventPageDto> =
            window(
                from = formatApiInstant(from),
                to = formatApiInstant(to),
                query = query,
                forceRefresh = forceRefresh,
            )

        suspend fun window(
            from: String,
            to: String,
            query: EventQuery = EventQuery(),
            forceRefresh: Boolean = false,
        ): EventResult<TimelineEventPageDto> = window(from, to, query, cacheKey = null, forceRefresh = forceRefresh)

        fun clear(dayKey: String? = null) {
            if (dayKey == null) {
                cache.clear()
            } else {
                cache.keys.removeIf { it.dayKey == dayKey }
            }
        }

        private suspend fun window(
            from: String,
            to: String,
            query: EventQuery,
            cacheKey: String?,
            forceRefresh: Boolean,
        ): EventResult<TimelineEventPageDto> {
            val key = CacheKey(cacheKey, from, to, query)
            if (!forceRefresh) cache[key]?.let { return EventResult.Success(it, fromCache = true) }

            val response =
                try {
                    api.window(from, to, query.type, query.tag, query.cursor, query.limit)
                } catch (_: IOException) {
                    return EventResult.Failure(EventRepositoryError(EventErrorKind.Unavailable))
                }

            if (!response.isSuccessful) {
                return EventResult.Failure(EventRepositoryError(EventErrorKind.Http, response.code()))
            }
            val page = response.body() ?: return EventResult.Failure(EventRepositoryError(EventErrorKind.Protocol, 502))
            cache[key] = page
            return EventResult.Success(page)
        }

        private data class CacheKey(
            val dayKey: String?,
            val from: String,
            val to: String,
            val query: EventQuery,
        )
    }

private val apiInstantFormatter: DateTimeFormatter =
    DateTimeFormatter
        .ofPattern("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'")
        .withZone(ZoneOffset.UTC)

private fun formatApiInstant(instant: Instant): String = apiInstantFormatter.format(instant)
