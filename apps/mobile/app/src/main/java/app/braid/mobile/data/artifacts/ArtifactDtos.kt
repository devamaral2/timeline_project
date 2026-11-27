package app.braid.mobile.data.artifacts

import app.braid.mobile.core.network.BraidJson
import app.braid.mobile.domain.artifact.AgentFileData
import app.braid.mobile.domain.artifact.Artifact
import app.braid.mobile.domain.artifact.ArtifactData
import app.braid.mobile.domain.artifact.ArtifactTaskLink
import app.braid.mobile.domain.artifact.ArtifactType
import app.braid.mobile.domain.artifact.FoodData
import app.braid.mobile.domain.artifact.FoodGeneration
import app.braid.mobile.domain.artifact.FoodItem
import app.braid.mobile.domain.artifact.FoodRecipe
import app.braid.mobile.domain.artifact.FoodTotals
import app.braid.mobile.domain.artifact.RecipeIngredient
import app.braid.mobile.domain.artifact.SleepData
import app.braid.mobile.domain.artifact.TextData
import app.braid.mobile.domain.artifact.TrainingData
import app.braid.mobile.domain.artifact.WorkoutCatalogData
import app.braid.mobile.domain.artifact.WorkoutCategory
import app.braid.mobile.domain.artifact.WorkoutSet
import app.braid.mobile.domain.artifact.WorkoutSnapshot
import app.braid.mobile.domain.task.TaskActor
import app.braid.mobile.domain.task.TaskKind
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement
import java.time.Instant
import java.time.OffsetDateTime

/** `artifactSchema` do `packages/contracts`: o `data` só tem forma depois de olhar o `type`. */
@Serializable
data class ArtifactDto(
    val id: String,
    val name: String,
    val type: String,
    val data: JsonElement,
    val global: Boolean,
    val derived: Boolean = false,
    val tasks: List<ArtifactTaskLinkDto> = emptyList(),
    val tags: List<String> = emptyList(),
    val revision: Int,
    val createdAt: String,
    val updatedAt: String,
)

/** `createArtifactResponseSchema`. */
@Serializable
data class CreateArtifactResponseDto(
    val artifactId: String,
)

@Serializable
data class ArtifactTaskLinkDto(
    val taskId: String,
    val relation: String,
    val name: String,
    val actor: String,
    val kind: String,
    val startedAt: String? = null,
    val estimatedFinishAt: String? = null,
)

@Serializable
data class TextDataDto(
    val body: String,
)

@Serializable
data class AgentFileDataDto(
    val path: String,
    val hash: String,
    val missing: Boolean,
    val description: String? = null,
)

@Serializable
data class SleepDataDto(
    val trackedSleepTime: Double,
    val score: Double,
)

@Serializable
data class WorkoutCatalogDataDto(
    val code: String,
    val category: String,
    val active: Boolean,
)

@Serializable
data class WorkoutSetDto(
    val id: String,
    val exercise: String,
    val repetitions: Int,
    val weight: Double,
)

/** O treino de qualquer `workoutCode`: ritmo e distância só vêm na corrida, na caminhada e na esteira; séries, na musculação. */
@Serializable
data class WorkoutSnapshotDto(
    val id: String,
    val workoutCode: String,
    val workoutName: String,
    val calories: Double,
    val duration: Double,
    val pace: Double? = null,
    val distance: Double? = null,
    val sets: List<WorkoutSetDto>? = null,
)

@Serializable
data class TrainingDataDto(
    val workouts: List<WorkoutSnapshotDto>,
    val caloriesBurned: Double,
)

@Serializable
data class FoodItemDto(
    val id: String,
    val name: String,
    val portion: String,
    val approximateWeightGrams: Double,
    val caloriesKcal: Double,
)

@Serializable
data class FoodTotalsDto(
    val totalCaloriesKcal: Double,
    val totalProteinGrams: Double,
    val totalCarbohydrateGrams: Double,
    val totalFatGrams: Double,
)

@Serializable
data class RecipeIngredientDto(
    val name: String,
    val quantity: String,
)

@Serializable
data class FoodRecipeDto(
    val source: String,
    val servings: Double? = null,
    val prepTimeMinutes: Double? = null,
    val ingredients: List<RecipeIngredientDto>,
    val steps: List<String>,
)

@Serializable
data class FoodGenerationDto(
    val status: String,
)

@Serializable
data class FoodDataDto(
    val description: String,
    val items: List<FoodItemDto>,
    val totals: FoodTotalsDto,
    val recipe: FoodRecipeDto? = null,
    val generation: FoodGenerationDto? = null,
    val nutritionSource: String? = null,
    val quantity: String? = null,
)

fun ArtifactDto.toDomain(): Artifact {
    val artifactType = ArtifactType.fromCode(type)
    return Artifact(
        id = id,
        name = name,
        type = artifactType,
        data = decodeData(artifactType, data),
        global = global,
        tags = tags,
        revision = revision,
        createdAt = parseInstant(createdAt),
        updatedAt = parseInstant(updatedAt),
        tasks = tasks.map { it.toDomain() },
    )
}

private fun ArtifactTaskLinkDto.toDomain() =
    ArtifactTaskLink(
        taskId = taskId,
        relation = relation,
        name = name,
        actor = if (actor == "agent") TaskActor.Agent else TaskActor.Human,
        kind = TaskKind.fromCode(kind),
        startedAt = startedAt?.let(::parseInstant),
        estimatedFinishAt = estimatedFinishAt?.let(::parseInstant),
    )

private fun decodeData(
    type: ArtifactType,
    data: JsonElement,
): ArtifactData =
    when (type) {
        ArtifactType.Text, ArtifactType.News, ArtifactType.EmailSummary, ArtifactType.YoutubeTranscript, ArtifactType.Router ->
            TextData(BraidJson.decodeFromJsonElement(TextDataDto.serializer(), data).body)
        ArtifactType.Skill, ArtifactType.Agent ->
            BraidJson
                .decodeFromJsonElement(
                    AgentFileDataDto.serializer(),
                    data,
                ).let { AgentFileData(it.path, it.hash, it.missing, it.description) }
        ArtifactType.Sleep ->
            BraidJson
                .decodeFromJsonElement(
                    SleepDataDto.serializer(),
                    data,
                ).let { SleepData(it.trackedSleepTime, it.score) }
        ArtifactType.Workout ->
            BraidJson.decodeFromJsonElement(WorkoutCatalogDataDto.serializer(), data).let {
                WorkoutCatalogData(it.code, WorkoutCategory.fromCode(it.category), it.active)
            }
        ArtifactType.Training -> BraidJson.decodeFromJsonElement(TrainingDataDto.serializer(), data).toDomain()
        ArtifactType.Food -> BraidJson.decodeFromJsonElement(FoodDataDto.serializer(), data).toDomain()
    }

private fun TrainingDataDto.toDomain() = TrainingData(workouts = workouts.map { it.toDomain() }, caloriesBurned = caloriesBurned)

private fun WorkoutSnapshotDto.toDomain(): WorkoutSnapshot =
    when (workoutCode) {
        "weightlifting" ->
            WorkoutSnapshot.Weightlifting(
                id,
                workoutName,
                calories,
                duration,
                sets.orEmpty().map {
                    WorkoutSet(it.id, it.exercise, it.repetitions, it.weight)
                },
            )
        "walking", "treadmill", "running" -> WorkoutSnapshot.Cardio(id, workoutName, calories, duration, pace ?: 0.0, distance ?: 0.0)
        else -> WorkoutSnapshot.Free(id, workoutName, calories, duration)
    }

private fun FoodDataDto.toDomain() =
    FoodData(
        description = description,
        items = items.map { FoodItem(it.id, it.name, it.portion, it.approximateWeightGrams, it.caloriesKcal) },
        totals = FoodTotals(totals.totalCaloriesKcal, totals.totalProteinGrams, totals.totalCarbohydrateGrams, totals.totalFatGrams),
        recipe =
            recipe?.let { dto ->
                FoodRecipe(
                    suggested = dto.source == "model",
                    servings = dto.servings,
                    prepTimeMinutes = dto.prepTimeMinutes,
                    ingredients = dto.ingredients.map { RecipeIngredient(it.name, it.quantity) },
                    steps = dto.steps,
                )
            },
        generation =
            when (generation?.status) {
                "pending" -> FoodGeneration.Pending
                "completed" -> FoodGeneration.Completed
                "failed" -> FoodGeneration.Failed
                else -> null
            },
        modelEstimate = nutritionSource == "model-estimate",
        quantity = quantity,
    )

private fun parseInstant(value: String): Instant = OffsetDateTime.parse(value).toInstant()
