package app.braid.mobile.domain.artifact

import app.braid.mobile.domain.task.TaskActor
import app.braid.mobile.domain.task.TaskKind
import java.time.Instant

/**
 * Um documento (o artefato do contrato). [data] tem a forma que o [type] diz; o texto e o roteador
 * guardam um [TextData], o alimento um [FoodData], e assim por diante.
 */
data class Artifact(
    val id: String,
    val name: String,
    val type: ArtifactType,
    val data: ArtifactData,
    /** Documento global: sem dono, todos leem e ninguém edita pelo app. */
    val global: Boolean,
    val tags: List<String>,
    val revision: Int,
    val createdAt: Instant,
    val updatedAt: Instant,
    /** As tarefas em que o documento aparece; vazio no que uma lista devolve sem elas. */
    val tasks: List<ArtifactTaskLink> = emptyList(),
)

/** Uma tarefa em que o documento aparece. [relation] é o código do contrato (`creates`, `updates`, `uses`, `deletes`), que a tela mostra como está. */
data class ArtifactTaskLink(
    val taskId: String,
    val relation: String,
    val name: String,
    val actor: TaskActor,
    val kind: TaskKind,
    val startedAt: Instant?,
    val estimatedFinishAt: Instant?,
)

sealed interface ArtifactData

data class TextData(
    val body: String,
) : ArtifactData

/** O arquivo de skill ou agente do Hermes que o documento aponta (o ticket 18 o lê). */
data class AgentFileData(
    val path: String,
    val hash: String,
    val missing: Boolean,
    val description: String?,
) : ArtifactData

data class SleepData(
    /** Minutos. */
    val trackedSleepTime: Double,
    val score: Double,
) : ArtifactData

data class WorkoutCatalogData(
    val code: String,
    val category: WorkoutCategory,
    val active: Boolean,
) : ArtifactData

enum class WorkoutCategory(
    val code: String,
    val label: String,
) {
    Cardio("cardio", "Cardio"),
    Strength("strength", "Força"),
    Free("free", "Livre"),
    ;

    companion object {
        fun fromCode(code: String): WorkoutCategory =
            entries.firstOrNull { it.code == code } ?: error("Categoria de exercício desconhecida: $code")
    }
}

data class WorkoutSet(
    val id: String,
    val exercise: String,
    val repetitions: Int,
    val weight: Double,
)

/** O treino que um documento de treino guarda: corrida e caminhada têm ritmo e distância, musculação tem séries. */
sealed interface WorkoutSnapshot {
    val id: String
    val name: String
    val calories: Double

    /** Minutos. */
    val duration: Double

    data class Cardio(
        override val id: String,
        override val name: String,
        override val calories: Double,
        override val duration: Double,
        /** Minutos decimais por quilômetro. */
        val pace: Double,
        val distance: Double,
    ) : WorkoutSnapshot

    data class Weightlifting(
        override val id: String,
        override val name: String,
        override val calories: Double,
        override val duration: Double,
        val sets: List<WorkoutSet>,
    ) : WorkoutSnapshot

    data class Free(
        override val id: String,
        override val name: String,
        override val calories: Double,
        override val duration: Double,
    ) : WorkoutSnapshot
}

data class TrainingData(
    val workouts: List<WorkoutSnapshot>,
    val caloriesBurned: Double,
) : ArtifactData

data class FoodTotals(
    val calories: Double,
    val proteinGrams: Double,
    val carbohydrateGrams: Double,
    val fatGrams: Double,
)

data class FoodItem(
    val id: String,
    val name: String,
    val portion: String,
    val weightGrams: Double,
    val calories: Double,
)

data class RecipeIngredient(
    val name: String,
    val quantity: String,
)

data class FoodRecipe(
    /** O modelo propôs o preparo: a tela diz "Sugerida". */
    val suggested: Boolean,
    val servings: Double?,
    val prepTimeMinutes: Double?,
    val ingredients: List<RecipeIngredient>,
    val steps: List<String>,
)

/** Onde está o cálculo dos nutrientes que o agente faz; ausente (`null`) num alimento que já nasceu pronto. */
enum class FoodGeneration { Pending, Completed, Failed }

data class FoodData(
    val description: String,
    val items: List<FoodItem>,
    val totals: FoodTotals,
    val recipe: FoodRecipe?,
    val generation: FoodGeneration?,
    /** A estimativa nutricional é do modelo. */
    val modelEstimate: Boolean,
    /** A quantidade que a pessoa deu ao alimento copiado para a tarefa (ticket 16); ausente no que não é cópia. */
    val quantity: String? = null,
) : ArtifactData
