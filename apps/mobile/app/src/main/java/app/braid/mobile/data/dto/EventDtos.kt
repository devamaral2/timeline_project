@file:OptIn(kotlinx.serialization.ExperimentalSerializationApi::class)

package app.braid.mobile.data.dto

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject

/** DTOs espelham os contratos TypeScript de `packages/contracts/src/events/contracts`. */
@Serializable
data class TimelineEventCardDto(
    val id: String,
    /** A natureza do evento (routine, meal, sleep, training); decide o visual do cartão. */
    val kind: String,
    /** Os tipos das notes do evento, na ordem em que aparecem. */
    val noteTypes: List<String>,
    val missed: Boolean,
    val name: String,
    val description: String,
    val startedAt: String,
    val finishedAt: String? = null,
    val notifyOffsetsMinutes: List<Double>,
    val durationLabel: String,
    val tags: List<String>,
    val interruptions: List<TimelineInterruptionDto>,
)

@Serializable
data class TimelineInterruptionDto(
    val name: String,
    val description: String,
    val durationLabel: String,
)

@Serializable
data class TimelineEventPageDto(
    val items: List<TimelineEventCardDto>,
    val nextCursor: String? = null,
)

@Serializable
data class EventDetailInterruptionDto(
    val id: String,
    val name: String,
    val description: String,
    val startedAt: String,
    val finishedAt: String,
)

@Serializable
data class FoodItemMacronutrientsDto(
    val carbohydratesGrams: Double,
    val proteinsGrams: Double,
    val totalFatGrams: Double,
    val fiberGrams: Double,
)

@Serializable
data class FoodItemDto(
    val id: String,
    val sourceFoodId: String? = null,
    val sourceFoodRevision: Int? = null,
    val name: String,
    val portion: String,
    val approximateWeightGrams: Double,
    val caloriesKcal: Double,
    val macronutrients: FoodItemMacronutrientsDto,
    val micronutrients: Map<String, Double>,
)

@Serializable
data class MealTotalsDto(
    val totalCaloriesKcal: Double,
    val totalProteinGrams: Double,
    val totalCarbohydrateGrams: Double,
    val totalFatGrams: Double,
    val totalFiberGrams: Double,
)

@Serializable
data class MealItemDto(
    val sourceMealId: String? = null,
    val sourceMealRevision: Int? = null,
    val name: String,
    val description: String,
    val foodItems: List<FoodItemDto>,
    val totals: MealTotalsDto,
)

@Serializable
data class SleepItemDto(
    val trackedSleepTime: Double,
    val score: Double,
)

@Serializable
data class WorkoutSetDto(
    val id: String,
    val exercise: String,
    val repetitions: Int,
    val weight: Double,
)

@Serializable
@kotlinx.serialization.json.JsonClassDiscriminator("workoutCode")
sealed interface WorkoutSnapshotDto {
    val id: String
    val workoutName: String
    val calories: Double
    val duration: Double
}

@Serializable
@SerialName("treadmill")
data class TreadmillWorkoutDto(
    override val id: String,
    override val workoutName: String,
    override val calories: Double,
    override val duration: Double,
    val pace: Double,
    val distance: Double,
) : WorkoutSnapshotDto

@Serializable
@SerialName("running")
data class RunningWorkoutDto(
    override val id: String,
    override val workoutName: String,
    override val calories: Double,
    override val duration: Double,
    val pace: Double,
    val distance: Double,
) : WorkoutSnapshotDto

@Serializable
@SerialName("weightlifting")
data class WeightliftingWorkoutDto(
    override val id: String,
    override val workoutName: String,
    override val calories: Double,
    override val duration: Double,
    val sets: List<WorkoutSetDto>,
) : WorkoutSnapshotDto

@Serializable
@SerialName("free")
data class FreeWorkoutDto(
    override val id: String,
    override val workoutName: String,
    override val calories: Double,
    override val duration: Double,
) : WorkoutSnapshotDto

@Serializable
data class TrainingDataDto(
    val workouts: List<WorkoutSnapshotDto>,
    val caloriesBurned: Double,
)

@Serializable
data class TextNoteDataDto(
    val body: String,
)

/**
 * Uma note do evento: `type` + `schemaVersion` dizem que forma o `data` tem.
 * O detalhe do evento não preenche `links` (só a API de notas preenche), então
 * o DTO não os modela.
 */
@Serializable
@kotlinx.serialization.json.JsonClassDiscriminator("type")
sealed interface EventNoteDto {
    val id: String
    val name: String
    val schemaVersion: Int
    val tags: List<String>
    val revision: Int
    val createdAt: String
    val updatedAt: String
}

@Serializable
@SerialName("text")
data class TextEventNoteDto(
    override val id: String,
    override val name: String,
    override val schemaVersion: Int,
    override val tags: List<String>,
    override val revision: Int,
    override val createdAt: String,
    override val updatedAt: String,
    val data: TextNoteDataDto,
) : EventNoteDto

@Serializable
@SerialName("meal")
data class MealEventNoteDto(
    override val id: String,
    override val name: String,
    override val schemaVersion: Int,
    override val tags: List<String>,
    override val revision: Int,
    override val createdAt: String,
    override val updatedAt: String,
    val data: MealItemDto,
) : EventNoteDto

@Serializable
@SerialName("sleep")
data class SleepEventNoteDto(
    override val id: String,
    override val name: String,
    override val schemaVersion: Int,
    override val tags: List<String>,
    override val revision: Int,
    override val createdAt: String,
    override val updatedAt: String,
    val data: SleepItemDto,
) : EventNoteDto

@Serializable
@SerialName("training")
data class TrainingEventNoteDto(
    override val id: String,
    override val name: String,
    override val schemaVersion: Int,
    override val tags: List<String>,
    override val revision: Int,
    override val createdAt: String,
    override val updatedAt: String,
    val data: TrainingDataDto,
) : EventNoteDto

@Serializable
data class EventDetailDto(
    val id: String,
    val name: String,
    val description: String,
    val startedAt: String,
    val finishedAt: String? = null,
    val tags: List<String>,
    val missed: Boolean,
    val priority: String,
    val notifyOffsetsMinutes: List<Double>,
    val interruptions: List<EventDetailInterruptionDto>,
    val revision: Int,
    /** A natureza do evento: decide o formulário de edição e o visual. */
    val kind: String,
    /** As notes do evento, na ordem em que aparecem. */
    val notes: List<EventNoteDto>,
    val taskIds: List<String>? = null,
)

/** Uma note nova, criada junto com o evento. `type` ausente na API é texto livre; o app sempre o envia. */
@Serializable
@kotlinx.serialization.json.JsonClassDiscriminator("type")
sealed interface CreateEventNoteDto {
    val name: String?
    val tags: List<String>?
}

@Serializable
@SerialName("text")
data class CreateTextNoteDto(
    override val name: String? = null,
    override val tags: List<String>? = null,
    val data: TextNoteDataDto,
) : CreateEventNoteDto

@Serializable
@SerialName("meal")
data class CreateMealNoteDto(
    override val name: String? = null,
    override val tags: List<String>? = null,
    val data: MealCreateInputDto,
) : CreateEventNoteDto

@Serializable
@SerialName("sleep")
data class CreateSleepNoteDto(
    override val name: String? = null,
    override val tags: List<String>? = null,
    val data: SleepInputDto? = null,
) : CreateEventNoteDto

@Serializable
@SerialName("training")
data class CreateTrainingNoteDto(
    override val name: String? = null,
    override val tags: List<String>? = null,
    val data: TrainingInputDto? = null,
) : CreateEventNoteDto

@Serializable
data class MealCreateInputDto(
    val inputText: String,
)

@Serializable
data class SleepInputDto(
    val trackedSleepTime: Double? = null,
    val score: Double? = null,
)

@Serializable
data class TrainingInputDto(
    val workouts: List<JsonObject>,
)

@Serializable
data class CreateEventInputDto(
    val name: String? = null,
    val description: String? = null,
    val tags: List<String>? = null,
    val missed: Boolean? = null,
    val priority: String? = null,
    val notifyOffsetsMinutes: List<Double>? = null,
    val startedAt: String? = null,
    val finishedAt: String? = null,
    /** A natureza do evento; ausente é rotina e não exige nenhuma note. */
    val kind: String? = null,
    /** Notes novas, criadas junto com o evento, na ordem em que aparecem. */
    val notes: List<CreateEventNoteDto>? = null,
    /** Notes que já existem e passam a aparecer no evento, depois das novas. */
    val noteIds: List<String>? = null,
    val taskIds: List<String>? = null,
)

@Serializable
data class CreateEventResponseDto(
    val eventId: String,
)

@Serializable
data class VoiceEventInputDto(
    val transcript: String,
)

@Serializable
data class VoiceEventResponseDto(
    val eventId: String,
    val kind: String,
)

/**
 * Uma entrada da lista de notes do PATCH. Só com `id`, a note existente entra
 * (ou continua) na lista sem ser reescrita; com `id` e `data` ela também é
 * editada; sem `id`, nasce uma note nova com o `data` completo. É uma união no
 * contrato — por isso um tipo só, com o `data` já como JSON.
 */
@Serializable
data class UpdateEventNoteDto(
    val id: String? = null,
    val schemaVersion: Int? = null,
    val type: String? = null,
    val name: String? = null,
    val tags: List<String>? = null,
    val data: JsonElement? = null,
) {
    companion object {
        private val dataJson = Json { explicitNulls = false }

        /** A note que só atravessa o PATCH: mantém-se na lista sem ser reescrita. */
        fun keep(note: EventNoteDto): UpdateEventNoteDto = UpdateEventNoteDto(id = note.id)

        /** A note existente com o conteúdo novo. */
        fun edited(
            note: EventNoteDto,
            data: TextNoteDataDto,
        ) = typed(note.id, note.schemaVersion, "text", dataJson.encodeToJsonElement(TextNoteDataDto.serializer(), data))

        fun edited(
            note: EventNoteDto,
            data: MealItemDto,
        ) = typed(note.id, note.schemaVersion, "meal", dataJson.encodeToJsonElement(MealItemDto.serializer(), data))

        fun edited(
            note: EventNoteDto,
            data: SleepItemDto,
        ) = typed(note.id, note.schemaVersion, "sleep", dataJson.encodeToJsonElement(SleepItemDto.serializer(), data))

        fun edited(
            note: EventNoteDto,
            data: TrainingDataDto,
        ) = typed(note.id, note.schemaVersion, "training", dataJson.encodeToJsonElement(TrainingDataDto.serializer(), data))

        /** Uma note nova: sem `id`, com o `data` completo. */
        fun created(data: TextNoteDataDto) = typed(null, null, "text", dataJson.encodeToJsonElement(TextNoteDataDto.serializer(), data))

        fun created(data: MealItemDto) = typed(null, null, "meal", dataJson.encodeToJsonElement(MealItemDto.serializer(), data))

        fun created(data: SleepItemDto) = typed(null, null, "sleep", dataJson.encodeToJsonElement(SleepItemDto.serializer(), data))

        fun created(data: TrainingDataDto) = typed(null, null, "training", dataJson.encodeToJsonElement(TrainingDataDto.serializer(), data))

        private fun typed(
            id: String?,
            schemaVersion: Int?,
            type: String,
            data: JsonElement,
        ) = UpdateEventNoteDto(id = id, schemaVersion = schemaVersion, type = type, data = data)
    }
}

@Serializable
data class InterruptionPatchInputDto(
    val id: String? = null,
    val name: String? = null,
    val description: String? = null,
    val startedAt: String? = null,
    val finishedAt: String? = null,
)

@Serializable
data class UpdateEventInputDto(
    val eventId: String,
    val expectedRevision: Int,
    val name: String? = null,
    val description: String? = null,
    val startedAt: String? = null,
    val finishedAt: String? = null,
    val tags: List<String>? = null,
    val missed: Boolean? = null,
    val priority: String? = null,
    val notifyOffsetsMinutes: List<Double>? = null,
    val interruptions: List<InterruptionPatchInputDto>? = null,
    val kind: String? = null,
    /** A lista completa de notes do evento, na ordem; as que ficam de fora deixam de aparecer, mas não são apagadas. */
    val notes: List<UpdateEventNoteDto>? = null,
    val taskIds: List<String>? = null,
)
