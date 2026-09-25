package app.braid.mobile.ui.event

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.braid.mobile.data.dto.CreateEventInputDto
import app.braid.mobile.data.dto.CreateEventItemDto
import app.braid.mobile.data.dto.CreateEventResponseDto
import app.braid.mobile.data.dto.CreateMealItemDto
import app.braid.mobile.data.dto.CreateRoutineItemDto
import app.braid.mobile.data.dto.CreateSleepItemDto
import app.braid.mobile.data.dto.CreateTrainingItemDto
import app.braid.mobile.data.dto.MealCreateInputDto
import app.braid.mobile.data.dto.SleepInputDto
import app.braid.mobile.data.dto.TrainingInputDto
import app.braid.mobile.data.events.EventGateway
import app.braid.mobile.data.events.EventResult
import app.braid.mobile.domain.timeline.TIMELINE_TIME_ZONE
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.time.LocalDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import javax.inject.Inject

enum class NewEventType(
    val label: String,
) {
    Routine("Rotina"),
    Meal("Refeição"),
    Sleep("Sono"),
    Training("Treino"),
}

data class NewEventDraft(
    val type: NewEventType = NewEventType.Routine,
    val name: String = "",
    val description: String = "",
    val tags: List<String> = emptyList(),
    val startedAtLocal: String = "",
    val finishedAtLocal: String = "",
    val notifyOffsetsMinutes: List<Double> = listOf(5.0),
    val mealText: String = "",
    val sleepTrackedMinutes: String = "",
    val sleepScore: String = "",
) {
    fun toInput(): CreateEventInputDto? {
        val startedAt = parseLocal(startedAtLocal) ?: return null
        val finishedAt =
            finishedAtLocal.takeIf(String::isNotBlank)?.let(::parseLocal) ?: if (finishedAtLocal.isBlank()) null else return null
        val item: CreateEventItemDto =
            when (type) {
                NewEventType.Routine -> CreateRoutineItemDto()
                NewEventType.Meal -> CreateMealItemDto(data = MealCreateInputDto(mealText.trim()))
                NewEventType.Sleep ->
                    CreateSleepItemDto(
                        data =
                            SleepInputDto(
                                trackedSleepTime = sleepTrackedMinutes.toDoubleOrNull(),
                                score = sleepScore.toDoubleOrNull(),
                            ),
                    )
                NewEventType.Training -> CreateTrainingItemDto(data = TrainingInputDto(workouts = emptyList()))
            }
        return CreateEventInputDto(
            name = name.trim().takeIf(String::isNotBlank),
            description = description.trim().takeIf(String::isNotBlank),
            tags = tags,
            priority = "normal",
            notifyOffsetsMinutes = notifyOffsetsMinutes,
            startedAt = startedAt,
            finishedAt = finishedAt,
            items = listOf(item),
        )
    }

    private fun parseLocal(value: String): String? =
        runCatching {
            LocalDateTime
                .parse(value, localDateTimeFormatter)
                .atZone(ZoneId.of(TIMELINE_TIME_ZONE))
                .toInstant()
                .toString()
        }.getOrNull()
}

sealed interface CreateEventUiState {
    data object Idle : CreateEventUiState

    data object Submitting : CreateEventUiState

    data class Error(
        val message: String,
    ) : CreateEventUiState

    data class Success(
        val eventId: String,
    ) : CreateEventUiState
}

@HiltViewModel
class CreateEventViewModel
    @Inject
    constructor(
        private val gateway: EventGateway,
    ) : ViewModel() {
        private val mutableState = MutableStateFlow<CreateEventUiState>(CreateEventUiState.Idle)

        val state: StateFlow<CreateEventUiState> = mutableState.asStateFlow()

        fun submit(draft: NewEventDraft) {
            if (draft.name.isBlank()) {
                mutableState.value = CreateEventUiState.Error("Dê um nome para o evento.")
                return
            }
            val input = draft.toInput()
            if (input == null) {
                mutableState.value = CreateEventUiState.Error("Confira as datas no formato AAAA-MM-DDTHH:MM.")
                return
            }

            mutableState.value = CreateEventUiState.Submitting
            viewModelScope.launch {
                mutableState.value =
                    when (val result = gateway.create(input)) {
                        is EventResult.Failure -> CreateEventUiState.Error("Não foi possível criar o evento. Tente novamente.")
                        is EventResult.Success<CreateEventResponseDto> -> CreateEventUiState.Success(result.value.eventId)
                    }
            }
        }

        fun reset() {
            mutableState.value = CreateEventUiState.Idle
        }
    }

private val localDateTimeFormatter = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm")
