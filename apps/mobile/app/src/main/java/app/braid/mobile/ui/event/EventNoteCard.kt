@file:Suppress("ktlint:standard:function-naming")

package app.braid.mobile.ui.event

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.ArrowDownward
import androidx.compose.material.icons.outlined.ArrowUpward
import androidx.compose.material.icons.outlined.Bedtime
import androidx.compose.material.icons.outlined.Grain
import androidx.compose.material.icons.outlined.KeyboardArrowDown
import androidx.compose.material.icons.outlined.KeyboardArrowUp
import androidx.compose.material.icons.outlined.LocalFireDepartment
import androidx.compose.material.icons.outlined.Restaurant
import androidx.compose.material.icons.outlined.Schedule
import androidx.compose.material.icons.outlined.StickyNote2
import androidx.compose.material.icons.outlined.Timer
import androidx.compose.material.icons.outlined.WaterDrop
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.braid.mobile.core.designsystem.BraidDisplayFont
import app.braid.mobile.core.designsystem.BraidMonoFont
import app.braid.mobile.data.dto.EventItemDto
import app.braid.mobile.data.dto.FreeWorkoutDto
import app.braid.mobile.data.dto.MealEventItemDto
import app.braid.mobile.data.dto.MealItemDto
import app.braid.mobile.data.dto.RunningWorkoutDto
import app.braid.mobile.data.dto.SleepEventItemDto
import app.braid.mobile.data.dto.SleepItemDto
import app.braid.mobile.data.dto.TrainingDataDto
import app.braid.mobile.data.dto.TrainingEventItemDto
import app.braid.mobile.data.dto.TreadmillWorkoutDto
import app.braid.mobile.data.dto.WeightliftingWorkoutDto
import app.braid.mobile.data.dto.WorkoutSnapshotDto
import app.braid.mobile.domain.timeline.formatDecimal
import app.braid.mobile.domain.timeline.formatMinutes
import app.braid.mobile.domain.timeline.formatPace
import app.braid.mobile.domain.timeline.groupSetsByExercise
import app.braid.mobile.domain.timeline.pluralize

/** Notas anexadas: treino, refeição e sono trazem os dados num cartão; rotina não tem. */
internal fun hasNoteCard(item: EventItemDto): Boolean =
    item is MealEventItemDto || item is TrainingEventItemDto || item is SleepEventItemDto

@Composable
internal fun EventNoteCard(
    item: EventItemDto,
    eventName: String,
    dateTitle: String,
    agendaMinutes: Int?,
) {
    var open by rememberSaveable(item.id) { mutableStateOf(true) }
    val title =
        when (item) {
            is MealEventItemDto -> item.data.name.ifBlank { eventName }
            is SleepEventItemDto -> dateTitle
            else -> eventName
        }
    Column {
        Row(
            modifier = Modifier.fillMaxWidth().padding(bottom = 14.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.Bottom,
        ) {
            SectionLabel("Notas")
            Text("1", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Surface(
            modifier = Modifier.fillMaxWidth(),
            shape = MaterialTheme.shapes.large,
            color = MaterialTheme.colorScheme.surface,
            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
        ) {
            Column(modifier = Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(18.dp)) {
                Row(
                    modifier = Modifier.fillMaxWidth().clickable { open = !open },
                    verticalAlignment = Alignment.Top,
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Icon(
                                Icons.Outlined.StickyNote2,
                                contentDescription = null,
                                modifier = Modifier.size(16.dp),
                                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                            SectionLabel("Nota")
                        }
                        Text(title, style = MaterialTheme.typography.headlineSmall.copy(fontSize = 26.sp, lineHeight = 30.sp))
                    }
                    Icon(
                        imageVector = if (open) Icons.Outlined.KeyboardArrowUp else Icons.Outlined.KeyboardArrowDown,
                        contentDescription = if (open) "Recolher nota" else "Expandir nota",
                        tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                if (open) {
                    when (item) {
                        is MealEventItemDto -> MealNote(item.data)
                        is TrainingEventItemDto -> TrainingNote(item.data)
                        is SleepEventItemDto -> SleepNote(item.data, agendaMinutes)
                        else -> Unit
                    }
                }
            }
        }
    }
}

@Composable
internal fun SectionLabel(text: String) {
    Text(
        text = text.uppercase(),
        style = MaterialTheme.typography.labelSmall.copy(letterSpacing = 1.3.sp),
        color = MaterialTheme.colorScheme.onSurfaceVariant,
    )
}

@Composable
private fun MealNote(data: MealItemDto) {
    val palette = eventDetailPalette()
    if (data.description.isNotBlank()) {
        Text(data.description, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
    Text("Informações nutricionais", style = MaterialTheme.typography.titleSmall)
    BigNumber(
        label = "Calorias consumidas",
        value = formatDecimal(data.totals.totalCaloriesKcal),
        unit = "kcal",
        color = palette.kcalConsumed,
        icon = { KcalIcon(consumed = true, size = 30.dp, color = palette.kcalConsumed) },
    )
    HorizontalDivider(color = MaterialTheme.colorScheme.outline)
    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Metric("Carboidratos", Icons.Outlined.Grain, data.totals.totalCarbohydrateGrams, "g", Modifier.weight(1f))
        Metric("Proteína", Icons.Outlined.Restaurant, data.totals.totalProteinGrams, "g", Modifier.weight(1f))
        Metric("Gorduras", Icons.Outlined.WaterDrop, data.totals.totalFatGrams, "g", Modifier.weight(1f))
    }
    if (data.foodItems.isNotEmpty()) {
        Column {
            ListHeading("Alimentos")
            data.foodItems.forEach { food ->
                HorizontalDivider(color = MaterialTheme.colorScheme.outline)
                Row(
                    modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp).padding(vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                        Text(food.name, style = MaterialTheme.typography.titleSmall)
                        Text(
                            food.portion.ifBlank { "${formatDecimal(food.approximateWeightGrams)} g" },
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    Kcal(food.caloriesKcal, consumed = true, color = palette.kcalConsumed, fontSize = 18.sp)
                }
            }
        }
    }
}

@Composable
private fun TrainingNote(data: TrainingDataDto) {
    val palette = eventDetailPalette()
    val active = data.workouts.sumOf { it.duration }
    val burned = if (data.caloriesBurned > 0) data.caloriesBurned else data.workouts.sumOf { it.calories }
    BigNumber(
        label = "Calorias gastas",
        value = formatDecimal(burned),
        unit = "kcal",
        color = palette.kcalBurned,
        icon = { KcalIcon(consumed = false, size = 30.dp, color = palette.kcalBurned) },
    )
    HorizontalDivider(color = MaterialTheme.colorScheme.outline)
    Row(horizontalArrangement = Arrangement.spacedBy(28.dp)) {
        DurationMetric("Tempo ativo", Icons.Outlined.Timer, active)
    }
    if (data.workouts.isNotEmpty()) {
        Column {
            ListHeading("Treinos")
            data.workouts.forEach { workout ->
                HorizontalDivider(color = MaterialTheme.colorScheme.outline)
                WorkoutRow(workout, palette.kcalBurned)
            }
            HorizontalDivider(color = MaterialTheme.colorScheme.outline)
        }
    }
}

@Composable
private fun WorkoutRow(
    workout: WorkoutSnapshotDto,
    burnedColor: Color,
) {
    val exercises = (workout as? WeightliftingWorkoutDto)?.let { groupSetsByExercise(it.sets) }.orEmpty()
    var open by rememberSaveable(workout.id) { mutableStateOf(false) }
    val summary =
        buildList {
            add(formatMinutes(workout.duration))
            when (workout) {
                is TreadmillWorkoutDto -> {
                    add("${formatDecimal(workout.distance)} km")
                    add(formatPace(workout.pace))
                }
                is RunningWorkoutDto -> {
                    add("${formatDecimal(workout.distance)} km")
                    add(formatPace(workout.pace))
                }
                is WeightliftingWorkoutDto -> {
                    add(pluralize(exercises.size, "exercício", "exercícios"))
                    add(pluralize(workout.sets.size, "série", "séries"))
                }
                is FreeWorkoutDto -> Unit
            }
        }.joinToString(" · ")
    Column(modifier = Modifier.fillMaxWidth()) {
        Row(
            modifier =
                Modifier
                    .fillMaxWidth()
                    .heightIn(min = 56.dp)
                    .let { if (exercises.isNotEmpty()) it.clickable { open = !open } else it }
                    .padding(top = 14.dp, bottom = if (exercises.isNotEmpty()) 8.dp else 14.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(workout.workoutName, style = MaterialTheme.typography.titleSmall)
                Text(summary, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Kcal(workout.calories, consumed = false, color = burnedColor, fontSize = 22.sp)
        }
        if (exercises.isNotEmpty()) {
            Box(modifier = Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
                Icon(
                    imageVector = if (open) Icons.Outlined.KeyboardArrowUp else Icons.Outlined.KeyboardArrowDown,
                    contentDescription = if (open) "Recolher ${workout.workoutName}" else "Expandir ${workout.workoutName}",
                    modifier = Modifier.size(18.dp),
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            if (open) {
                Column(modifier = Modifier.padding(top = 12.dp, bottom = 18.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                    exercises.forEach { (exercise, sets) ->
                        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                Text(exercise, style = MaterialTheme.typography.titleSmall)
                                Text(
                                    pluralize(sets.size, "série", "séries"),
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                sets.forEach { set ->
                                    Surface(shape = MaterialTheme.shapes.extraSmall, color = MaterialTheme.colorScheme.surfaceVariant) {
                                        Text(
                                            "${set.repetitions} × ${formatDecimal(set.weight)} kg",
                                            modifier = Modifier.padding(horizontal = 7.dp, vertical = 3.dp),
                                            style = MaterialTheme.typography.bodySmall.copy(fontFamily = BraidMonoFont, fontSize = 12.sp),
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun SleepNote(
    data: SleepItemDto,
    agendaMinutes: Int?,
) {
    val palette = eventDetailPalette()
    BigNumber(
        label = "Pontuação do sono",
        value = formatDecimal(data.score),
        unit = "de 100",
        color = palette.sleep,
        icon = { Icon(Icons.Outlined.Bedtime, contentDescription = null, modifier = Modifier.size(30.dp), tint = palette.sleep) },
    )
    HorizontalDivider(color = MaterialTheme.colorScheme.outline)
    Row(horizontalArrangement = Arrangement.spacedBy(28.dp)) {
        DurationMetric("Tempo registrado", Icons.Outlined.Schedule, data.trackedSleepTime)
    }
    if (agendaMinutes != null) {
        Text(
            "Registrado pelo app de sono. Na agenda, o evento durou ${formatMinutes(agendaMinutes.toDouble())}.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
private fun ListHeading(text: String) {
    Text(
        text,
        modifier = Modifier.padding(bottom = 10.dp),
        style = MaterialTheme.typography.labelMedium,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
    )
}

@Composable
private fun BigNumber(
    label: String,
    value: String,
    unit: String,
    color: Color,
    icon: @Composable () -> Unit,
) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
        icon()
        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
            SectionLabel(label)
            Text(
                text =
                    buildAnnotatedString {
                        append(value)
                        withStyle(SpanStyle(fontSize = 13.sp, fontFamily = FontFamily.Default)) { append(" $unit") }
                    },
                style = MaterialTheme.typography.headlineMedium.copy(fontFamily = BraidDisplayFont, fontSize = 40.sp, lineHeight = 40.sp),
                color = color,
            )
        }
    }
}

@Composable
private fun KcalIcon(
    consumed: Boolean,
    size: androidx.compose.ui.unit.Dp,
    color: Color,
) {
    Box(modifier = Modifier.size(size), contentAlignment = Alignment.Center) {
        Icon(Icons.Outlined.LocalFireDepartment, contentDescription = null, modifier = Modifier.size(size), tint = color)
        Surface(
            modifier = Modifier.align(Alignment.TopEnd).size(size * 0.5f),
            shape = MaterialTheme.shapes.extraLarge,
            color = MaterialTheme.colorScheme.surface,
        ) {
            Icon(
                imageVector = if (consumed) Icons.Outlined.ArrowDownward else Icons.Outlined.ArrowUpward,
                contentDescription = null,
                modifier = Modifier.padding(1.dp),
                tint = color,
            )
        }
    }
}

@Composable
private fun Kcal(
    value: Double,
    consumed: Boolean,
    color: Color,
    fontSize: androidx.compose.ui.unit.TextUnit,
) {
    val description = "${formatDecimal(value)} quilocalorias ${if (consumed) "consumidas" else "gastas"}"
    Row(
        modifier = Modifier.semantics { contentDescription = description },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(7.dp),
    ) {
        KcalIcon(consumed = consumed, size = 20.dp, color = color)
        Text(
            text =
                buildAnnotatedString {
                    append(formatDecimal(value))
                    withStyle(SpanStyle(fontSize = 12.sp, fontFamily = FontFamily.Default)) { append(" kcal") }
                },
            style = MaterialTheme.typography.titleMedium.copy(fontFamily = BraidDisplayFont, fontSize = fontSize),
            color = color,
        )
    }
}

@Composable
private fun Metric(
    label: String,
    icon: ImageVector,
    value: Double,
    unit: String,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier.semantics { contentDescription = "$label: ${formatDecimal(value)} $unit" },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Icon(icon, contentDescription = null, modifier = Modifier.size(20.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(
            text =
                buildAnnotatedString {
                    append(formatDecimal(value))
                    withStyle(SpanStyle(fontSize = 12.sp, fontFamily = FontFamily.Default)) { append(" $unit") }
                },
            style = MaterialTheme.typography.headlineSmall.copy(fontFamily = BraidDisplayFont, fontSize = 28.sp, lineHeight = 28.sp),
            maxLines = 1,
        )
    }
}

@Composable
private fun DurationMetric(
    label: String,
    icon: ImageVector,
    minutes: Double,
) {
    val total = Math.round(minutes).toInt().coerceAtLeast(0)
    val hours = total / 60
    val rest = total % 60
    Row(
        modifier = Modifier.semantics { contentDescription = "$label: ${formatMinutes(minutes)}" },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Icon(icon, contentDescription = null, modifier = Modifier.size(20.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(
            text =
                buildAnnotatedString {
                    val small = SpanStyle(fontSize = 12.sp, fontFamily = FontFamily.Default, color = Color.Unspecified)
                    if (hours > 0) {
                        append(hours.toString())
                        withStyle(small) { append("h ") }
                    }
                    if (rest > 0 || hours == 0) {
                        append(if (hours > 0) rest.toString().padStart(2, '0') else rest.toString())
                        withStyle(small) { append("min") }
                    }
                },
            style = MaterialTheme.typography.headlineSmall.copy(fontFamily = BraidDisplayFont, fontSize = 28.sp, lineHeight = 28.sp),
            maxLines = 1,
        )
    }
}
