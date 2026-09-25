package app.braid.mobile.ui.event

import app.braid.mobile.data.dto.CreateEventInputDto
import app.braid.mobile.data.dto.CreateEventResponseDto
import app.braid.mobile.data.dto.CreateMealItemDto
import app.braid.mobile.data.dto.EventDetailDto
import app.braid.mobile.data.dto.TimelineEventPageDto
import app.braid.mobile.data.events.EventGateway
import app.braid.mobile.data.events.EventQuery
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
class CreateEventViewModelTest {
    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    @Test
    fun happyPathBuildsMealScheduleAndReminderAndPublishesCreatedId() {
        runTest {
            Dispatchers.setMain(StandardTestDispatcher(testScheduler))
            val gateway = FakeEventGateway()
            val viewModel = CreateEventViewModel(gateway)
            val draft =
                NewEventDraft(
                    type = NewEventType.Meal,
                    name = "Café da manhã",
                    description = "Aveia",
                    startedAtLocal = "2026-09-24T08:00",
                    finishedAtLocal = "2026-09-24T08:30",
                    notifyOffsetsMinutes = listOf(15.0),
                    mealText = "Aveia com frutas",
                )

            viewModel.submit(draft)
            advanceUntilIdle()

            assertEquals(CreateEventUiState.Success("event-created"), viewModel.state.value)
            assertTrue(gateway.input?.items?.single() is CreateMealItemDto)
            assertEquals(listOf(15.0), gateway.input?.notifyOffsetsMinutes)
            assertEquals("2026-09-24T11:00:00Z", gateway.input?.startedAt)
        }
    }

    @Test
    fun missingNameIsRejectedBeforeTheNetworkCall() {
        runTest {
            Dispatchers.setMain(StandardTestDispatcher(testScheduler))
            val gateway = FakeEventGateway()
            val viewModel = CreateEventViewModel(gateway)

            viewModel.submit(NewEventDraft(startedAtLocal = "2026-09-24T08:00"))

            assertEquals(CreateEventUiState.Error("Dê um nome para o evento."), viewModel.state.value)
            assertEquals(null, gateway.input)
        }
    }

    private class FakeEventGateway : EventGateway {
        var input: CreateEventInputDto? = null

        override suspend fun create(input: CreateEventInputDto): EventResult<CreateEventResponseDto> {
            this.input = input
            return EventResult.Success(CreateEventResponseDto("event-created"))
        }

        override suspend fun update(input: app.braid.mobile.data.dto.UpdateEventInputDto): EventResult<Unit> = error("not used")

        override suspend fun delete(eventId: String): EventResult<Unit> = error("not used")

        override suspend fun detail(eventId: String): EventResult<EventDetailDto> = error("not used")

        override suspend fun day(
            dayKey: String,
            query: EventQuery,
            forceRefresh: Boolean,
        ): EventResult<TimelineEventPageDto> = error("not used")
    }
}
