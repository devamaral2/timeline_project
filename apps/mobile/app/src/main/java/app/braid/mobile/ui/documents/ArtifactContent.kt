package app.braid.mobile.ui.documents

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import app.braid.mobile.core.designsystem.BraidDisplayFont
import app.braid.mobile.core.designsystem.BraidIcons
import app.braid.mobile.core.designsystem.BraidMonoFont
import app.braid.mobile.core.designsystem.SvgIcon
import app.braid.mobile.core.designsystem.documentTokens
import app.braid.mobile.domain.artifact.AgentFileData
import app.braid.mobile.domain.artifact.Artifact
import app.braid.mobile.domain.artifact.FoodData
import app.braid.mobile.domain.artifact.FoodGeneration
import app.braid.mobile.domain.artifact.FoodRecipe
import app.braid.mobile.domain.artifact.FoodTotals
import app.braid.mobile.domain.artifact.SleepData
import app.braid.mobile.domain.artifact.TextData
import app.braid.mobile.domain.artifact.TrainingData
import app.braid.mobile.domain.artifact.WorkoutCatalogData
import app.braid.mobile.domain.artifact.WorkoutSnapshot
import app.braid.mobile.domain.artifact.formatDecimal
import app.braid.mobile.domain.artifact.formatMinutes
import app.braid.mobile.domain.artifact.formatPace
import app.braid.mobile.domain.artifact.groupSetsByExercise
import app.braid.mobile.domain.artifact.macroShares
import app.braid.mobile.domain.artifact.markdownBodyOf
import app.braid.mobile.domain.artifact.pluralize
import app.braid.mobile.domain.artifact.sleepAgendaOfArtifact
import kotlin.math.floor
import kotlin.math.roundToInt

const val PENDING_MEAL_MESSAGE = "Preparando informações nutricionais e receita…"
const val FAILED_MEAL_MESSAGE = "Não foi possível gerar as informações da refeição. Seu registro foi preservado."
const val MODEL_ESTIMATE_MESSAGE = "Estimativa nutricional gerada por IA."

/**
 * O conteúdo de um documento aberto, conforme o tipo, como o `ArtifactContent` do web: texto e roteador em markdown
 * (sem o título repetido na primeira linha), alimento, treino e sono com o número principal na serifa, exercício do
 * catálogo com categoria e situação. É o mesmo componente do detalhe do documento e do da tarefa. Skill e agente
 * mostram só o caminho do arquivo; a leitura dele é do ticket 18.
 */
@Composable
fun ArtifactContent(
    artifact: Artifact,
    modifier: Modifier = Modifier,
) {
    when (val data = artifact.data) {
        is TextData -> {
            val body = markdownBodyOf(artifact)
            if (body.isNotEmpty()) MarkdownView(body, modifier)
        }
        is FoodData -> MealContent(data, modifier)
        is TrainingData -> TrainingContent(data, modifier)
        is SleepData -> {
            val sleep = sleepAgendaOfArtifact(artifact.tasks)
            Column(modifier, verticalArrangement = Arrangement.spacedBy(18.dp)) {
                sleep?.let {
                    Text(
                        it.title,
                        color = MaterialTheme.colorScheme.onBackground,
                        fontFamily = BraidDisplayFont,
                        fontSize = 24.sp,
                        lineHeight = 28.sp,
                    )
                }
                SleepContent(data, sleep?.agendaMinutes)
            }
        }
        is WorkoutCatalogData ->
            Column(modifier) {
                FactRow("Categoria", data.category.label)
                FactRow("Situação", if (data.active) "Ativo" else "Inativo")
            }
        is AgentFileData ->
            Column(modifier, verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(
                    data.path,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    fontFamily = BraidMonoFont,
                    fontSize = 12.sp,
                    lineHeight = 18.sp,
                )
                data.description?.let { Text(it, color = MaterialTheme.colorScheme.onBackground, fontSize = 15.sp, lineHeight = 22.sp) }
            }
    }
}

/** Uma linha de fato: o rótulo à esquerda, o valor à direita. */
@Composable
fun FactRow(
    label: String,
    value: String,
) {
    Row(
        Modifier.fillMaxWidth().padding(vertical = 8.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(label, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 14.sp, lineHeight = 20.sp)
        Text(value, color = MaterialTheme.colorScheme.onBackground, fontSize = 14.sp, lineHeight = 20.sp, fontWeight = FontWeight.Medium)
    }
}

/** O texto digitado, na serifa não: no corpo de 15sp. */
@Composable
private fun BodyText(text: String) {
    Text(text, color = MaterialTheme.colorScheme.onBackground, fontSize = 15.sp, lineHeight = 25.sp)
}

@Composable
private fun StatusLine(
    text: String,
    alert: Boolean = false,
) {
    Text(
        text = text,
        modifier = Modifier.semantics { liveRegion = if (alert) LiveRegionMode.Assertive else LiveRegionMode.Polite },
        color = if (alert) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant,
        fontSize = 14.sp,
        lineHeight = 20.sp,
    )
}

/** O número com a unidade miúda ao lado: `612,5 kcal`. */
private fun unitText(
    value: String,
    unit: String,
    muted: Color,
    valueSize: Int,
    unitSize: Int = 14,
): AnnotatedString =
    buildAnnotatedString {
        withStyle(SpanStyle(fontFamily = BraidDisplayFont, fontSize = valueSize.sp, letterSpacing = (-0.02).em)) { append(value) }
        withStyle(SpanStyle(fontSize = unitSize.sp, color = muted)) { append(" $unit") }
    }

/** O número principal da nota: o rótulo em cima e o valor na serifa. */
@Composable
private fun BigNumber(
    label: String,
    value: String,
    unit: String,
    modifier: Modifier = Modifier,
) {
    val muted = MaterialTheme.colorScheme.onSurfaceVariant
    Column(modifier.semantics(mergeDescendants = true) {}, verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(label, color = muted, fontSize = 13.sp, lineHeight = 20.sp)
        Text(unitText(value, unit, muted, valueSize = 48), color = MaterialTheme.colorScheme.onBackground, lineHeight = 48.sp, maxLines = 1)
    }
}

/** O número ao lado do principal (tempo ativo, tempo registrado): o rótulo em cima e o valor na serifa. */
@Composable
private fun Metric(
    label: String,
    minutes: Double,
) {
    val muted = MaterialTheme.colorScheme.onSurfaceVariant
    Column(
        Modifier.semantics(mergeDescendants = true) { contentDescription = "$label: ${formatMinutes(minutes)}" },
        horizontalAlignment = Alignment.End,
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Text(label, color = muted, fontSize = 13.sp, lineHeight = 20.sp)
        Text(durationText(minutes, muted), color = MaterialTheme.colorScheme.onBackground, lineHeight = 28.sp, maxLines = 1)
    }
}

private const val MINUTES_PER_HOUR = 60

/** Horas e minutos com a unidade miúda: 7 h 02 min. */
private fun durationText(
    minutes: Double,
    muted: Color,
): AnnotatedString {
    val total = floor(minutes + 0.5).toInt()
    val hours = total / MINUTES_PER_HOUR
    val rest = total % MINUTES_PER_HOUR
    return buildAnnotatedString {
        fun part(
            value: String,
            unit: String,
        ) {
            if (length > 0) append(" ")
            withStyle(SpanStyle(fontFamily = BraidDisplayFont, fontSize = 28.sp)) { append(value) }
            withStyle(SpanStyle(fontSize = 12.sp, color = muted)) { append(" $unit") }
        }
        if (hours != 0) part("$hours", "h")
        if (rest != 0 || hours == 0) part(if (hours != 0) rest.toString().padStart(2, '0') else "$rest", "min")
    }
}

@Composable
private fun SectionHeading(
    title: String,
    count: Int? = null,
) {
    Row(
        Modifier.padding(bottom = 4.dp),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            title.uppercase(),
            color = documentTokens().faint,
            fontFamily = BraidMonoFont,
            fontSize = 12.sp,
            lineHeight = 16.sp,
            letterSpacing = 0.1.em,
            fontWeight = FontWeight.Medium,
        )
        count?.let { Text("$it", color = documentTokens().faint, fontFamily = BraidMonoFont, fontSize = 12.sp, lineHeight = 16.sp) }
    }
}

/** As calorias de uma linha: o número na serifa e "kcal" miúdo. */
@Composable
private fun Calories(
    value: Double,
    consumed: Boolean,
) {
    val muted = MaterialTheme.colorScheme.onSurfaceVariant
    Text(
        text = unitText(formatDecimal(value), "kcal", muted, valueSize = 18, unitSize = 12),
        modifier =
            Modifier.semantics {
                contentDescription =
                    "${formatDecimal(value)} quilocalorias ${if (consumed) "consumidas" else "gastas"}"
            },
        color = MaterialTheme.colorScheme.onBackground,
        lineHeight = 24.sp,
        maxLines = 1,
    )
}

/** O alimento (ou a refeição): os totais, os alimentos e a receita; enquanto o agente calcula, só o texto digitado e o aviso. */
@Composable
fun MealContent(
    data: FoodData,
    modifier: Modifier = Modifier,
) {
    Column(modifier, verticalArrangement = Arrangement.spacedBy(16.dp)) {
        when (data.generation) {
            FoodGeneration.Pending, FoodGeneration.Failed -> {
                if (data.description.isNotEmpty()) BodyText(data.description)
                if (data.generation ==
                    FoodGeneration.Pending
                ) {
                    StatusLine(PENDING_MEAL_MESSAGE)
                } else {
                    StatusLine(FAILED_MEAL_MESSAGE, alert = true)
                }
            }
            else -> {
                // O texto digitado só aparece enquanto não há a lista de alimentos: com ela, repeti-lo seria redundante.
                if (data.description.isNotEmpty() && data.items.isEmpty()) BodyText(data.description)
                BigNumber("Calorias consumidas", formatDecimal(data.totals.calories), "kcal")
                Macros(data.totals)
                if (data.modelEstimate) StatusLine(MODEL_ESTIMATE_MESSAGE)
                if (data.items.isNotEmpty()) FoodList(data)
                data.recipe?.let { RecipeView(it) }
            }
        }
    }
}

@Composable
private fun Macros(totals: FoodTotals) {
    val tokens = documentTokens()
    val (protein, carbohydrates, fat) = macroShares(totals)
    val macros =
        listOf(
            Triple("Proteínas", totals.proteinGrams to protein, tokens.protein),
            Triple("Carboidratos", totals.carbohydrateGrams to carbohydrates, tokens.carbohydrates),
            Triple("Gorduras", totals.fatGrams to fat, tokens.fat),
        )
    val hasShares = protein + carbohydrates + fat > 0
    Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
        if (hasShares) {
            Row(
                Modifier.fillMaxWidth().height(4.dp).semantics {
                    contentDescription =
                        "De onde vêm as calorias: " +
                        macros.joinToString(", ") { (name, grams, _) -> "${name.lowercase()} ${grams.second}%" }
                },
                horizontalArrangement = Arrangement.spacedBy(2.dp),
            ) {
                macros.forEach { (_, grams, color) ->
                    Box(
                        Modifier
                            .weight(
                                grams.second.toFloat().coerceAtLeast(MIN_SEGMENT_WEIGHT),
                            ).height(4.dp)
                            .background(color, RoundedCornerShape(2.dp)),
                    )
                }
            }
        }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            macros.forEach { (name, grams, color) ->
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        Box(Modifier.size(8.dp).background(color, CircleShape))
                        Text(
                            name,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            fontSize = 13.sp,
                            lineHeight = 20.sp,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.Bottom) {
                        Text(
                            text =
                                unitText(
                                    formatDecimal(grams.first),
                                    "g",
                                    MaterialTheme.colorScheme.onSurfaceVariant,
                                    valueSize = 22,
                                    unitSize = 12,
                                ),
                            modifier = Modifier.semantics { contentDescription = "$name: ${formatDecimal(grams.first)} gramas" },
                            color = MaterialTheme.colorScheme.onBackground,
                            lineHeight = 24.sp,
                            maxLines = 1,
                        )
                        if (hasShares) Text("${grams.second}%", color = tokens.faint, fontSize = 13.sp, lineHeight = 20.sp)
                    }
                }
            }
        }
    }
}

private const val MIN_SEGMENT_WEIGHT = 0.01f

@Composable
private fun FoodList(data: FoodData) {
    Column {
        SectionHeading("Alimentos", data.items.size)
        data.items.forEach { food ->
            HorizontalDivider(color = MaterialTheme.colorScheme.outline)
            Row(
                Modifier.fillMaxWidth().heightIn(min = 56.dp).padding(vertical = 6.dp),
                horizontalArrangement = Arrangement.spacedBy(16.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(Modifier.weight(1f)) {
                    Text(
                        food.name,
                        color = MaterialTheme.colorScheme.onBackground,
                        fontSize = 15.sp,
                        lineHeight = 22.sp,
                        fontWeight = FontWeight.Medium,
                    )
                    Text(
                        food.portion.ifEmpty {
                            "${formatDecimal(food.weightGrams)} g"
                        },
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        fontSize = 13.sp,
                        lineHeight = 20.sp,
                    )
                }
                Calories(food.calories, consumed = true)
            }
        }
        HorizontalDivider(color = MaterialTheme.colorScheme.outline)
    }
}

/** A receita: os ingredientes e o modo de preparo; "Sugerida" quando foi o modelo que a propôs. */
@Composable
fun RecipeView(recipe: FoodRecipe) {
    val muted = MaterialTheme.colorScheme.onSurfaceVariant
    val meta =
        listOfNotNull(
            recipe.servings?.takeIf { it != 0.0 }?.let { pluralize(it.roundToInt(), "porção", "porções") },
            recipe.prepTimeMinutes?.takeIf { it != 0.0 }?.let { "Preparo em ${formatMinutes(it)}" },
        )
    Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
            SectionHeading("Receita")
            if (recipe.suggested) {
                Text(
                    "Sugerida",
                    modifier =
                        Modifier
                            .border(
                                1.dp,
                                MaterialTheme.colorScheme.outline,
                                CircleShape,
                            ).padding(horizontal = 10.dp, vertical = 2.dp),
                    color = muted,
                    fontSize = 12.sp,
                    lineHeight = 16.sp,
                )
            }
        }
        if (meta.isNotEmpty()) Text(meta.joinToString(" · "), color = muted, fontSize = 13.sp, lineHeight = 20.sp)
        if (recipe.ingredients.isNotEmpty()) {
            Column {
                Text(
                    "Ingredientes",
                    color = muted,
                    fontSize = 13.sp,
                    lineHeight = 20.sp,
                    fontWeight = FontWeight.Medium,
                    modifier = Modifier.padding(bottom = 4.dp),
                )
                recipe.ingredients.forEach { ingredient ->
                    HorizontalDivider(color = MaterialTheme.colorScheme.outline)
                    Row(Modifier.fillMaxWidth().padding(vertical = 9.dp), horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                        Text(
                            ingredient.name,
                            Modifier.weight(1f),
                            color = MaterialTheme.colorScheme.onBackground,
                            fontSize = 14.sp,
                            lineHeight = 22.sp,
                        )
                        Text(ingredient.quantity, color = muted, fontSize = 14.sp, lineHeight = 22.sp)
                    }
                }
                HorizontalDivider(color = MaterialTheme.colorScheme.outline)
            }
        }
        Column {
            Text(
                "Modo de preparo",
                color = muted,
                fontSize = 13.sp,
                lineHeight = 20.sp,
                fontWeight = FontWeight.Medium,
                modifier = Modifier.padding(bottom = 4.dp),
            )
            recipe.steps.forEachIndexed { index, step ->
                HorizontalDivider(color = MaterialTheme.colorScheme.outline)
                Row(Modifier.fillMaxWidth().padding(vertical = 9.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    Box(
                        Modifier.size(22.dp).border(1.dp, MaterialTheme.colorScheme.outline, CircleShape),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text("${index + 1}", color = muted, fontFamily = BraidMonoFont, fontSize = 12.sp, lineHeight = 16.sp)
                    }
                    Text(step, Modifier.weight(1f), color = MaterialTheme.colorScheme.onBackground, fontSize = 14.sp, lineHeight = 22.sp)
                }
            }
            HorizontalDivider(color = MaterialTheme.colorScheme.outline)
        }
    }
}

private fun workoutSummary(workout: WorkoutSnapshot): String {
    val parts = mutableListOf(formatMinutes(workout.duration))
    when (workout) {
        is WorkoutSnapshot.Cardio -> {
            parts += "${formatDecimal(workout.distance)} km"
            parts += formatPace(workout.pace)
        }
        is WorkoutSnapshot.Weightlifting -> {
            parts += pluralize(groupSetsByExercise(workout.sets).size, "exercício", "exercícios")
            parts += pluralize(workout.sets.size, "série", "séries")
        }
        is WorkoutSnapshot.Free -> Unit
    }
    return parts.joinToString(" · ")
}

/** O treino: as calorias gastas e o tempo ativo, e cada treino numa linha que abre as séries. */
@Composable
fun TrainingContent(
    data: TrainingData,
    modifier: Modifier = Modifier,
) {
    val active = data.workouts.sumOf { it.duration }
    val burned = if (data.caloriesBurned != 0.0) data.caloriesBurned else data.workouts.sumOf { it.calories }
    Column(modifier, verticalArrangement = Arrangement.spacedBy(16.dp)) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.Bottom) {
            BigNumber("Calorias gastas", formatDecimal(burned), "kcal")
            Metric("Tempo ativo", active)
        }
        if (data.workouts.isNotEmpty()) {
            Column {
                SectionHeading("Treinos", data.workouts.size)
                data.workouts.forEach { workout ->
                    HorizontalDivider(color = MaterialTheme.colorScheme.outline)
                    WorkoutRow(workout)
                }
                HorizontalDivider(color = MaterialTheme.colorScheme.outline)
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun WorkoutRow(workout: WorkoutSnapshot) {
    val muted = MaterialTheme.colorScheme.onSurfaceVariant
    val groups = if (workout is WorkoutSnapshot.Weightlifting) groupSetsByExercise(workout.sets) else emptyList()
    var open by rememberSaveable(workout.id) { mutableStateOf(false) }
    val expandable = groups.isNotEmpty()
    Column {
        Row(
            Modifier
                .fillMaxWidth()
                .heightIn(min = 64.dp)
                .then(
                    if (expandable) {
                        Modifier.clickable(role = Role.Button, onClick = { open = !open }).semantics {
                            stateDescription =
                                if (open) "Aberto" else "Fechado"
                        }
                    } else {
                        Modifier
                    },
                ),
            horizontalArrangement = Arrangement.spacedBy(16.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(Modifier.weight(1f)) {
                Text(
                    workout.name,
                    color = MaterialTheme.colorScheme.onBackground,
                    fontSize = 15.sp,
                    lineHeight = 22.sp,
                    fontWeight = FontWeight.SemiBold,
                )
                Text(workoutSummary(workout), color = muted, fontSize = 13.sp, lineHeight = 20.sp)
            }
            Calories(workout.calories, consumed = false)
            if (expandable) {
                SvgIcon(
                    BraidIcons.chevronDown,
                    size = 16.dp,
                    color = documentTokens().faint,
                    modifier = Modifier.rotate(if (open) 180f else 0f),
                )
            } else {
                Box(Modifier.width(16.dp))
            }
        }
        if (expandable && open) {
            Column(Modifier.padding(bottom = 14.dp)) {
                groups.forEach { group ->
                    Row(
                        Modifier.fillMaxWidth().padding(vertical = 8.dp),
                        horizontalArrangement = Arrangement.spacedBy(16.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Column(Modifier.widthIn(max = 140.dp)) {
                            Text(
                                group.exercise,
                                color = MaterialTheme.colorScheme.onBackground,
                                fontSize = 14.sp,
                                lineHeight = 20.sp,
                                fontWeight = FontWeight.Medium,
                            )
                            Text(pluralize(group.sets.size, "série", "séries"), color = muted, fontSize = 12.sp, lineHeight = 16.sp)
                        }
                        FlowRow(
                            Modifier.weight(1f),
                            horizontalArrangement = Arrangement.spacedBy(6.dp, Alignment.End),
                            verticalArrangement = Arrangement.spacedBy(6.dp),
                        ) {
                            group.sets.forEach { set ->
                                Text(
                                    "${set.repetitions} × ${formatDecimal(set.weight)} kg",
                                    modifier =
                                        Modifier
                                            .border(
                                                1.dp,
                                                MaterialTheme.colorScheme.outline,
                                                CircleShape,
                                            ).padding(horizontal = 10.dp, vertical = 3.dp),
                                    color = MaterialTheme.colorScheme.onBackground,
                                    fontSize = 13.sp,
                                    lineHeight = 20.sp,
                                    maxLines = 1,
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

private const val MAX_SCORE = 100.0

/** A pontuação como o web a escreve: o número cru, sem separador decimal de pt-BR. */
private fun scoreText(score: Double): String = if (score == floor(score)) score.toLong().toString() else score.toString()

/** O sono: a pontuação e o tempo registrado, a barra na cor do sono e, com a tarefa da agenda, quanto ela durou. */
@Composable
fun SleepContent(
    data: SleepData,
    agendaMinutes: Int?,
    modifier: Modifier = Modifier,
) {
    val score = data.score.coerceIn(0.0, MAX_SCORE)
    Column(modifier, verticalArrangement = Arrangement.spacedBy(16.dp)) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.Bottom) {
            BigNumber("Pontuação do sono", scoreText(data.score), "de 100")
            Metric("Tempo registrado", data.trackedSleepTime)
        }
        Box(
            Modifier
                .fillMaxWidth()
                .height(3.dp)
                .background(MaterialTheme.colorScheme.outline, RoundedCornerShape(2.dp))
                .semantics { contentDescription = "Pontuação do sono: ${scoreText(data.score)} de 100" },
        ) {
            Box(
                Modifier
                    .fillMaxWidth(
                        (score / MAX_SCORE).toFloat(),
                    ).height(3.dp)
                    .background(documentTokens().sleep, RoundedCornerShape(2.dp)),
            )
        }
        if (agendaMinutes != null) {
            Text(
                "Registrado pelo app de sono. Na agenda, a tarefa durou ${formatMinutes(agendaMinutes)}.",
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                fontSize = 13.sp,
                lineHeight = 20.sp,
            )
        }
    }
}
