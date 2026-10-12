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
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class AgendaListViewModelTest {
    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    @Test
    fun startLoadsSevenDaysFromTheAnchor() =
        runTest {
            Dispatchers.setMain(StandardTestDispatcher(testScheduler))
            val viewModel = AgendaListViewModel(FakeGateway())

            viewModel.start("2026-09-22")
            advanceUntilIdle()

            val state = viewModel.state.value
            assertFalse(state.isLoading)
            assertEquals(
                listOf("2026-09-22", "2026-09-23", "2026-09-24", "2026-09-25", "2026-09-26", "2026-09-27", "2026-09-28"),
                state.days.map { it.dayKey },
            )
        }

    @Test
    fun extendNextAppendsTheFollowingWeek() =
        runTest {
            Dispatchers.setMain(StandardTestDispatcher(testScheduler))
            val viewModel = AgendaListViewModel(FakeGateway())
            viewModel.start("2026-09-22")
            advanceUntilIdle()

            viewModel.extendNext()
            advanceUntilIdle()

            val days =
                viewModel.state.value.days
                    .map { it.dayKey }
            assertEquals(14, days.size)
            assertEquals("2026-09-22", days.first())
            assertEquals("2026-10-05", days.last())
        }

    @Test
    fun extendPreviousPrependsThePreviousWeek() =
        runTest {
            Dispatchers.setMain(StandardTestDispatcher(testScheduler))
            val viewModel = AgendaListViewModel(FakeGateway())
            viewModel.start("2026-09-22")
            advanceUntilIdle()

            viewModel.extendPrevious()
            advanceUntilIdle()

            val days =
                viewModel.state.value.days
                    .map { it.dayKey }
            assertEquals(14, days.size)
            assertEquals("2026-09-15", days.first())
            assertEquals("2026-09-28", days.last())
        }

    @Test
    fun aFailedExtensionKeepsTheDaysAndStopsUntilRetried() =
        runTest {
            Dispatchers.setMain(StandardTestDispatcher(testScheduler))
            val gateway = FakeGateway()
            val viewModel = AgendaListViewModel(gateway)
            viewModel.start("2026-09-22")
            advanceUntilIdle()

            gateway.failing += "2026-09-30"
            viewModel.extendNext()
            advanceUntilIdle()

            val failed = viewModel.state.value
            assertTrue(failed.failedAtEnd)
            assertEquals(7, failed.days.size)

            // Enquanto a falha não é reconhecida, a lista não insiste.
            viewModel.extendNext()
            advanceUntilIdle()
            assertEquals(7, viewModel.state.value.days.size)

            gateway.failing.clear()
            viewModel.retryEdges()
            viewModel.extendNext()
            advanceUntilIdle()
            assertEquals(14, viewModel.state.value.days.size)
        }

    @Test
    fun anInitialFailureIsReportedSoTheListCanOfferRetry() =
        runTest {
            Dispatchers.setMain(StandardTestDispatcher(testScheduler))
            val gateway = FakeGateway().apply { failing += "2026-09-24" }
            val viewModel = AgendaListViewModel(gateway)

            viewModel.start("2026-09-22")
            advanceUntilIdle()

            assertTrue(viewModel.state.value.loadFailed)
            assertTrue(
                viewModel.state.value.days
                    .isEmpty(),
            )
        }

    @Test
    fun startingAgainReplacesTheRange() =
        runTest {
            Dispatchers.setMain(StandardTestDispatcher(testScheduler))
            val viewModel = AgendaListViewModel(FakeGateway())
            viewModel.start("2026-09-22")
            advanceUntilIdle()
            viewModel.extendNext()
            advanceUntilIdle()

            viewModel.start("2026-11-01")
            advanceUntilIdle()

            val days =
                viewModel.state.value.days
                    .map { it.dayKey }
            assertEquals(7, days.size)
            assertEquals("2026-11-01", days.first())
        }

    private class FakeGateway : EventGateway {
        val failing = mutableSetOf<String>()

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
        ): EventResult<TimelineEventPageDto> =
            if (dayKey in failing) {
                EventResult.Failure(EventRepositoryError(EventErrorKind.Unavailable))
            } else {
                EventResult.Success(TimelineEventPageDto(listOf(event("event-$dayKey", "${dayKey}T12:00:00Z"))))
            }
    }
}

private fun event(
    id: String,
    startedAt: String,
) = TimelineEventCardDto(
    id = id,
    kind = "routine",
    noteTypes = emptyList(),
    missed = false,
    name = id,
    description = "",
    startedAt = startedAt,
    finishedAt = null,
    notifyOffsetsMinutes = emptyList(),
    durationLabel = "1h",
    tags = emptyList(),
    interruptions = emptyList(),
)
