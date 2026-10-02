@file:OptIn(kotlinx.serialization.ExperimentalSerializationApi::class)

package app.braid.mobile.data.dto

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject

/** DTOs espelham os contratos TypeScript de `packages/contracts/src/events/contracts`. */
@Serializable
data class TimelineEventCardDto(
    val id: String,
    val primaryItemId: String,
    val primaryItemType: String,
    val itemTypes: List<String>,
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
@kotlinx.serialization.json.JsonClassDiscriminator("type")
sealed interface EventItemDto {
    val id: String
    val position: Int
    val schemaVersion: Int
    val isPrimary: Boolean
}

@Serializable
@SerialName("routine")
data class RoutineEventItemDto(
    override val id: String,
    override val position: Int,
    override val schemaVersion: Int,
    override val isPrimary: Boolean,
    val data: JsonObject,
) : EventItemDto

@Serializable
@SerialName("meal")
data class MealEventItemDto(
    override val id: String,
    override val position: Int,
    override val schemaVersion: Int,
    override val isPrimary: Boolean,
    val data: MealItemDto,
) : EventItemDto

@Serializable
@SerialName("sleep")
data class SleepEventItemDto(
    override val id: String,
    override val position: Int,
    override val schemaVersion: Int,
    override val isPrimary: Boolean,
    val data: SleepItemDto,
) : EventItemDto

@Serializable
@SerialName("training")
data class TrainingEventItemDto(
    override val id: String,
    override val position: Int,
    override val schemaVersion: Int,
    override val isPrimary: Boolean,
    val data: TrainingDataDto,
) : EventItemDto

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
    val primaryItemId: String,
    val items: List<EventItemDto>,
    val taskIds: List<String>? = null,
)

@Serializable
@kotlinx.serialization.json.JsonClassDiscriminator("type")
sealed interface CreateEventItemDto

@Serializable
@SerialName("routine")
data class CreateRoutineItemDto(
    val isPrimary: Boolean? = null,
    val data: JsonObject? = null,
) : CreateEventItemDto

@Serializable
@SerialName("meal")
data class CreateMealItemDto(
    val isPrimary: Boolean? = null,
    val data: MealCreateInputDto,
) : CreateEventItemDto

@Serializable
@SerialName("sleep")
data class CreateSleepItemDto(
    val isPrimary: Boolean? = null,
    val data: SleepInputDto? = null,
) : CreateEventItemDto

@Serializable
@SerialName("training")
data class CreateTrainingItemDto(
    val isPrimary: Boolean? = null,
    val data: TrainingInputDto? = null,
) : CreateEventItemDto

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
    val items: List<CreateEventItemDto>,
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
    val primaryItemType: String,
)

@Serializable
@kotlinx.serialization.json.JsonClassDiscriminator("type")
sealed interface UpdateEventItemDto {
    val id: String?
    val schemaVersion: Int
    val isPrimary: Boolean
}

@Serializable
@SerialName("routine")
data class UpdateRoutineItemDto(
    override val id: String? = null,
    override val schemaVersion: Int,
    override val isPrimary: Boolean,
    val data: JsonObject,
) : UpdateEventItemDto

@Serializable
@SerialName("meal")
data class UpdateMealItemDto(
    override val id: String? = null,
    override val schemaVersion: Int,
    override val isPrimary: Boolean,
    val data: MealItemDto,
) : UpdateEventItemDto

@Serializable
@SerialName("sleep")
data class UpdateSleepItemDto(
    override val id: String? = null,
    override val schemaVersion: Int,
    override val isPrimary: Boolean,
    val data: SleepItemDto,
) : UpdateEventItemDto

@Serializable
@SerialName("training")
data class UpdateTrainingItemDto(
    override val id: String? = null,
    override val schemaVersion: Int,
    override val isPrimary: Boolean,
    val data: TrainingDataDto,
) : UpdateEventItemDto

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
    val items: List<UpdateEventItemDto>? = null,
    val taskIds: List<String>? = null,
)
