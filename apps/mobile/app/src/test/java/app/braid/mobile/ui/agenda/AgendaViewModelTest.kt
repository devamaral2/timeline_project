package app.braid.mobile.ui.agenda

import app.braid.mobile.data.dto.TimelineEventCardDto
import app.braid.mobile.data.dto.TimelineEventPageDto
import app.braid.mobile.data.events.EventErrorKind
import app.braid.mobile.data.events.EventGateway
import app.braid.mobile.data.events.EventQuery
import app.braid.mobile.data.events.EventRepositoryError
import app.braid.mobile.data.events.EventResult
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class AgendaViewModelTest {
    private lateinit var repository: FakeEventGateway

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    @Test
    fun successfulDayLoadCalculatesSummaryForCards() {
        runTest {
            Dispatchers.setMain(StandardTestDispatcher(testScheduler))
            repository = FakeEventGateway()
            val first = event("event-1", "2026-09-22T08:00:00Z", "2026-09-22T09:00:00Z")
            val second = event("event-2", "2026-09-22T10:00:00Z", "2026-09-22T10:15:00Z")
            repository.results["2026-09-22"] =
                EventResult.Success(TimelineEventPageDto(listOf(first, second)))
            val viewModel = AgendaViewModel(repository)

            viewModel.loadDay("2026-09-22")
            advanceUntilIdle()

            val state = viewModel.state.value as AgendaUiState.Content
            assertEquals(75, state.trackedMinutes)
            assertEquals(60, state.longestMinutes)
            assertEquals(listOf("event-1", "event-2"), state.events.map { it.id })
        }
    }

    @Test
    fun emptyAndFailedLoadsKeepTheirDayForTheUi() {
        runTest {
            Dispatchers.setMain(StandardTestDispatcher(testScheduler))
            repository = FakeEventGateway()
            repository.results["2026-09-21"] =
                EventResult.Success(TimelineEventPageDto(emptyList()))
            repository.results["2026-09-20"] =
                EventResult.Failure(EventRepositoryError(EventErrorKind.Unavailable))
            val viewModel = AgendaViewModel(repository)

            viewModel.loadDay("2026-09-21")
            advanceUntilIdle()
            assertEquals(AgendaUiState.Empty("2026-09-21"), viewModel.state.value)

            viewModel.loadDay("2026-09-20")
            advanceUntilIdle()
            assertEquals(AgendaUiState.Error("2026-09-20"), viewModel.state.value)
        }
    }

    @Test
    fun refreshKeepsVisibleEventsWhileLoadingAndReportsARefreshFailure() {
        runTest {
            Dispatchers.setMain(StandardTestDispatcher(testScheduler))
            repository = FakeEventGateway()
            val first = event("event-1", "2026-09-22T08:00:00Z", "2026-09-22T09:00:00Z")
            repository.results["2026-09-22"] = EventResult.Success(TimelineEventPageDto(listOf(first)))
            repository.forcedResults["2026-09-22"] = EventResult.Failure(EventRepositoryError(EventErrorKind.Unavailable))
            val viewModel = AgendaViewModel(repository)

            viewModel.loadDay("2026-09-22")
            advanceUntilIdle()
            viewModel.refreshDay("2026-09-22")

            val refreshing = viewModel.state.value as AgendaUiState.Content
            assertTrue(refreshing.isRefreshing)
            assertEquals(listOf("event-1"), refreshing.events.map { it.id })

            advanceUntilIdle()

            val failed = viewModel.state.value as AgendaUiState.Content
            assertTrue(failed.refreshFailed)
            assertEquals(listOf("event-1"), failed.events.map { it.id })
        }
    }

    private class FakeEventGateway : EventGateway {
        val results = mutableMapOf<String, EventResult<TimelineEventPageDto>>()
        val forcedResults = mutableMapOf<String, EventResult<TimelineEventPageDto>>()

        override suspend fun create(
            input: app.braid.mobile.data.dto.CreateEventInputDto,
        ): EventResult<app.braid.mobile.data.dto.CreateEventResponseDto> = error("not used")

        override suspend fun detail(eventId: String): EventResult<app.braid.mobile.data.dto.EventDetailDto> = error("not used")

        override suspend fun update(input: app.braid.mobile.data.dto.UpdateEventInputDto): EventResult<Unit> = error("not used")

        override suspend fun delete(eventId: String): EventResult<Unit> = error("not used")

        override suspend fun day(
            dayKey: String,
            query: EventQuery,
            forceRefresh: Boolean,
        ): EventResult<TimelineEventPageDto> = if (forceRefresh) forcedResults.getValue(dayKey) else results.getValue(dayKey)
    }

    private fun event(
        id: String,
        startedAt: String,
        finishedAt: String,
    ) = TimelineEventCardDto(
        id = id,
        primaryItemId = "$id-item",
        primaryItemType = "routine",
        itemTypes = listOf("routine"),
        missed = false,
        name = id,
        description = "",
        startedAt = startedAt,
        finishedAt = finishedAt,
        notifyOffsetsMinutes = emptyList(),
        durationLabel = "1h",
        tags = emptyList(),
        interruptions = emptyList(),
    )
}
