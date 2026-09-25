package app.braid.mobile.ui.event

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.braid.mobile.data.dto.TagSuggestionDto
import app.braid.mobile.data.tags.TagGateway
import app.braid.mobile.data.tags.TagResult
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class TagSuggestionViewModel
    @Inject
    constructor(
        private val gateway: TagGateway,
    ) : ViewModel() {
        private val mutableSuggestions = MutableStateFlow<List<TagSuggestionDto>>(emptyList())
        private var searchJob: Job? = null

        val suggestions: StateFlow<List<TagSuggestionDto>> = mutableSuggestions.asStateFlow()

        fun search(
            query: String,
            selectedTags: List<String>,
        ) {
            searchJob?.cancel()
            val normalized = query.trim()
            if (normalized.isEmpty()) {
                mutableSuggestions.value = emptyList()
                return
            }
            searchJob =
                viewModelScope.launch {
                    delay(200)
                    mutableSuggestions.value =
                        when (val result = gateway.suggest(normalized, limit = 6)) {
                            is TagResult.Failure -> emptyList()
                            is TagResult.Success -> result.suggestions.filterNot { it.name in selectedTags }
                        }
                }
        }

        fun clear() {
            searchJob?.cancel()
            mutableSuggestions.value = emptyList()
        }
    }
