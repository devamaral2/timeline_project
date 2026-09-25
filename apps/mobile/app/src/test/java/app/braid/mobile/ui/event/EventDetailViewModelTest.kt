package app.braid.mobile.ui.event

import app.braid.mobile.data.dto.EventDetailDto
import app.braid.mobile.data.dto.EventDetailInterruptionDto
import app.braid.mobile.data.dto.RoutineEventItemDto
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
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class EventDetailViewModelTest {
    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    @Test
    fun successfulLoadPublishesTheWholeDetailContract() {
        runTest {
            Dispatchers.setMain(StandardTestDispatcher(testScheduler))
            val detail = detail()
            val viewModel = EventDetailViewModel(FakeEventGateway(EventResult.Success(detail)))

            viewModel.load("event-1")
            advanceUntilIdle()

            assertEquals(EventDetailUiState.Content(detail), viewModel.state.value)
        }
    }

    @Test
    fun successfulDeletePublishesDeletedState() {
        runTest {
            Dispatchers.setMain(StandardTestDispatcher(testScheduler))
            val detail = detail()
            val viewModel =
                EventDetailViewModel(
                    FakeEventGateway(EventResult.Success(detail), EventResult.Success(Unit)),
                )

            viewModel.load("event-1")
            advanceUntilIdle()
            viewModel.delete("event-1")
            advanceUntilIdle()

            assertEquals(EventDetailUiState.Deleted, viewModel.state.value)
        }
    }

    @Test
    fun failedDeleteKeepsTheDetailAndExposesRecoverableError() {
        runTest {
            Dispatchers.setMain(StandardTestDispatcher(testScheduler))
            val detail = detail()
            val viewModel =
                EventDetailViewModel(
                    FakeEventGateway(
                        EventResult.Success(detail),
                        EventResult.Failure(EventRepositoryError(EventErrorKind.Unavailable)),
                    ),
                )

            viewModel.load("event-1")
            advanceUntilIdle()
            viewModel.delete("event-1")
            advanceUntilIdle()

            assertEquals(
                EventDetailUiState.Content(
                    event = detail,
                    deleteError = "Não foi possível excluir o evento. Tente novamente.",
                ),
                viewModel.state.value,
            )
        }
    }

    @Test
    fun failedLoadPublishesARecoverableErrorState() {
        runTest {
            Dispatchers.setMain(StandardTestDispatcher(testScheduler))
            val viewModel =
                EventDetailViewModel(
                    FakeEventGateway(EventResult.Failure(EventRepositoryError(EventErrorKind.Unavailable))),
                )

            viewModel.load("event-1")
            advanceUntilIdle()

            assertEquals(EventDetailUiState.Error, viewModel.state.value)
        }
    }

    private fun detail(): EventDetailDto {
        val interruption =
            EventDetailInterruptionDto(
                id = "pause-1",
                name = "Água",
                description = "Pausa",
                startedAt = "2026-09-22T08:20:00Z",
                finishedAt = "2026-09-22T08:25:00Z",
            )
        val routineItem =
            RoutineEventItemDto(
                id = "item-1",
                position = 0,
                schemaVersion = 1,
                isPrimary = true,
                data = kotlinx.serialization.json.JsonObject(emptyMap()),
            )
        return EventDetailDto(
            id = "event-1",
            name = "Rotina da manhã",
            description = "Começar o dia",
            startedAt = "2026-09-22T08:00:00Z",
            finishedAt = "2026-09-22T09:00:00Z",
            tags = listOf("foco"),
            missed = false,
            priority = "normal",
            notifyOffsetsMinutes = listOf(10.0),
            interruptions = listOf(interruption),
            revision = 1,
            primaryItemId = "item-1",
            items = listOf(routineItem),
            taskIds = listOf("task-1"),
        )
    }

    private class FakeEventGateway(
        private val result: EventResult<EventDetailDto>,
        private val deleteResult: EventResult<Unit> = EventResult.Success(Unit),
    ) : EventGateway {
        override suspend fun create(
            input: app.braid.mobile.data.dto.CreateEventInputDto,
        ): EventResult<app.braid.mobile.data.dto.CreateEventResponseDto> = error("not used")

        override suspend fun detail(eventId: String): EventResult<EventDetailDto> = result

        override suspend fun update(input: app.braid.mobile.data.dto.UpdateEventInputDto): EventResult<Unit> = error("not used")

        override suspend fun delete(eventId: String): EventResult<Unit> = deleteResult

        override suspend fun day(
            dayKey: String,
            query: EventQuery,
            forceRefresh: Boolean,
        ): EventResult<TimelineEventPageDto> = error("not used")
    }
}
