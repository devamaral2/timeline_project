package app.braid.mobile.ui.event

import app.braid.mobile.data.dto.TagSuggestionDto
import app.braid.mobile.data.tags.TagGateway
import app.braid.mobile.data.tags.TagResult
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class TagSuggestionViewModelTest {
    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    @Test
    fun searchDebouncesToSixAndExcludesAlreadySelectedTags() {
        runTest {
            Dispatchers.setMain(StandardTestDispatcher(testScheduler))
            val gateway = FakeTagGateway()
            val viewModel = TagSuggestionViewModel(gateway)

            viewModel.search("fo", selectedTags = listOf("foco"))
            advanceTimeBy(199)
            assertEquals(0, gateway.calls)
            advanceTimeBy(1)
            advanceUntilIdle()

            assertEquals(1, gateway.calls)
            assertEquals("fo", gateway.query)
            assertEquals(6, gateway.limit)
            assertEquals(listOf(TagSuggestionDto("tag-2", "força")), viewModel.suggestions.value)
        }
    }

    @Test
    fun failedSuggestionLeavesTheInputUsable() {
        runTest {
            Dispatchers.setMain(StandardTestDispatcher(testScheduler))
            val viewModel = TagSuggestionViewModel(FakeTagGateway(failed = true))

            viewModel.search("fo", emptyList())
            advanceTimeBy(200)
            advanceUntilIdle()

            assertEquals(emptyList<TagSuggestionDto>(), viewModel.suggestions.value)
        }
    }

    private class FakeTagGateway(
        private val failed: Boolean = false,
    ) : TagGateway {
        var calls = 0
        var query: String? = null
        var limit: Int? = null

        override suspend fun suggest(
            query: String,
            limit: Int,
        ): TagResult {
            calls += 1
            this.query = query
            this.limit = limit
            if (failed) return TagResult.Failure
            return TagResult.Success(
                listOf(
                    TagSuggestionDto("tag-1", "foco"),
                    TagSuggestionDto("tag-2", "força"),
                ),
            )
        }
    }
}
