package app.braid.mobile.ui.voice

import app.braid.mobile.data.dto.VoiceEventResponseDto
import app.braid.mobile.data.events.EventErrorKind
import app.braid.mobile.data.events.EventRepositoryError
import app.braid.mobile.data.events.EventResult
import app.braid.mobile.data.events.VoiceEventGateway
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
class VoiceEventQueueViewModelTest {
    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    @Test
    fun jobsAreSentSeriallyAndRemovedAfterSuccess() {
        runTest {
            Dispatchers.setMain(StandardTestDispatcher(testScheduler))
            val gateway = FakeVoiceEventGateway()
            val viewModel = VoiceEventQueueViewModel(gateway)

            viewModel.enqueue("primeiro")
            viewModel.enqueue("segundo")
            advanceUntilIdle()

            assertEquals(listOf("primeiro", "segundo"), gateway.transcripts)
            assertEquals(emptyList<VoiceJob>(), viewModel.jobs.value)
        }
    }

    @Test
    fun failedJobCanBeRetriedWithoutLosingItsTranscript() {
        runTest {
            Dispatchers.setMain(StandardTestDispatcher(testScheduler))
            val gateway = FakeVoiceEventGateway(failuresBeforeSuccess = 1)
            val viewModel = VoiceEventQueueViewModel(gateway)

            viewModel.enqueue("criar treino")
            advanceUntilIdle()
            assertEquals(
                VoiceJobStatus.Error,
                viewModel.jobs.value
                    .single()
                    .status,
            )

            viewModel.retry(
                viewModel.jobs.value
                    .single()
                    .id,
            )
            advanceUntilIdle()

            assertEquals(listOf("criar treino", "criar treino"), gateway.transcripts)
            assertEquals(emptyList<VoiceJob>(), viewModel.jobs.value)
        }
    }

    private class FakeVoiceEventGateway(
        private var failuresBeforeSuccess: Int = 0,
    ) : VoiceEventGateway {
        val transcripts = mutableListOf<String>()

        override suspend fun create(transcript: String): EventResult<VoiceEventResponseDto> {
            transcripts += transcript
            if (failuresBeforeSuccess > 0) {
                failuresBeforeSuccess -= 1
                return EventResult.Failure(EventRepositoryError(EventErrorKind.Unavailable))
            }
            return EventResult.Success(VoiceEventResponseDto("event-1", "routine"))
        }
    }
}
