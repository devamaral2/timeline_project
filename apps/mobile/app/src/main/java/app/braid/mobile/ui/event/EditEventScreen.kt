@file:Suppress("ktlint:standard:function-naming")

package app.braid.mobile.ui.event

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.ArrowBack
import androidx.compose.material3.Button
import androidx.compose.material3.CenterAlignedTopAppBar
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TextField
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.braid.mobile.data.dto.EventDetailDto
import app.braid.mobile.data.dto.FoodItemDto
import app.braid.mobile.data.dto.FreeWorkoutDto
import app.braid.mobile.data.dto.MealEventNoteDto
import app.braid.mobile.data.dto.MealItemDto
import app.braid.mobile.data.dto.MealTotalsDto
import app.braid.mobile.data.dto.RunningWorkoutDto
import app.braid.mobile.data.dto.SleepEventNoteDto
import app.braid.mobile.data.dto.SleepItemDto
import app.braid.mobile.data.dto.TrainingDataDto
import app.braid.mobile.data.dto.TrainingEventNoteDto
import app.braid.mobile.data.dto.TreadmillWorkoutDto
import app.braid.mobile.data.dto.UpdateEventInputDto
import app.braid.mobile.data.dto.UpdateEventNoteDto
import app.braid.mobile.data.dto.WeightliftingWorkoutDto
import app.braid.mobile.data.dto.WorkoutSetDto
import app.braid.mobile.data.dto.WorkoutSnapshotDto
import app.braid.mobile.domain.events.notesPatchedWith
import app.braid.mobile.domain.events.primaryNote
import app.braid.mobile.domain.timeline.TIMELINE_TIME_ZONE
import java.time.Instant
import java.time.LocalDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter

@Composable
@OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
fun EditEventScreen(
    eventId: String,
    onBack: () -> Unit,
    onSaved: () -> Unit,
    viewModel: EditEventViewModel = hiltViewModel(),
    tagViewModel: TagSuggestionViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    LaunchedEffect(eventId) { viewModel.load(eventId) }
    LaunchedEffect(state) {
        if (state is EditEventUiState.Saved) onSaved()
    }

    Scaffold(
        topBar = {
            CenterAlignedTopAppBar(
                title = { Text("Editar evento") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Outlined.ArrowBack, contentDescription = "Voltar")
                    }
                },
            )
        },
    ) { paddingValues ->
        when (val current = state) {
            EditEventUiState.Loading, EditEventUiState.Saving ->
                Column(
                    modifier = Modifier.fillMaxSize().padding(paddingValues),
                    verticalArrangement = Arrangement.Center,
                ) {
                    Text(
                        modifier = Modifier.fillMaxWidth(),
                        text = if (state is EditEventUiState.Saving) "Salvando…" else "Carregando…",
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            EditEventUiState.Error -> {
                EditMessage(
                    Modifier.padding(paddingValues),
                    "Não foi possível carregar o evento.",
                ) {
                    viewModel.load(eventId)
                }
            }
            is EditEventUiState.SaveError -> {
                EditMessage(
                    Modifier.padding(paddingValues),
                    current.message,
                ) {
                    viewModel.load(eventId)
                }
            }
            EditEventUiState.Saved -> Unit
            is EditEventUiState.Content -> {
                val event = current.event
                val primary = event.primaryNote()
                if (event.notes.any { it is MealEventNoteDto && it.data.generation?.status == "pending" }) {
                    Column(modifier = Modifier.padding(paddingValues).padding(20.dp)) {
                        Text("Gerando informações da refeição. Aguarde para editar.")
                        TextButton(onClick = onBack) { Text("Voltar") }
                    }
                } else when (event.kind) {
                    "meal" ->
                        MealEditContent(
                            event = event,
                            note = primary as? MealEventNoteDto,
                            modifier = Modifier.padding(paddingValues),
                            tagViewModel = tagViewModel,
                            onCancel = onBack,
                            onSave = viewModel::save,
                        )
                    "routine" ->
                        RoutineEditContent(
                            event = event,
                            modifier = Modifier.padding(paddingValues),
                            tagViewModel = tagViewModel,
                            onCancel = onBack,
                            onSave = viewModel::save,
                        )
                    "sleep" ->
                        SleepEditContent(
                            event = event,
                            note = primary as? SleepEventNoteDto,
                            modifier = Modifier.padding(paddingValues),
                            tagViewModel = tagViewModel,
                            onCancel = onBack,
                            onSave = viewModel::save,
                        )
                    "training" ->
                        TrainingEditContent(
                            event = event,
                            note = primary as? TrainingEventNoteDto,
                            modifier = Modifier.padding(paddingValues),
                            tagViewModel = tagViewModel,
                            onCancel = onBack,
                            onSave = viewModel::save,
                        )
                    else ->
                        // Uma natureza que este app ainda não conhece: editar as tripas dela às cegas estragaria o payload.
                        EditMessage(Modifier.padding(paddingValues), "Este tipo de evento ainda não pode ser editado por aqui.") {
                            onBack()
                        }
                }
            }
        }
    }
}

@Composable
private fun MealEditContent(
    event: EventDetailDto,
    note: MealEventNoteDto?,
    modifier: Modifier,
    tagViewModel: TagSuggestionViewModel,
    onCancel: () -> Unit,
    onSave: (UpdateEventInputDto) -> Unit,
) {
    var name by remember(event.id) { mutableStateOf(event.name) }
    var description by remember(event.id) { mutableStateOf(event.description) }
    var tags by remember(event.id) { mutableStateOf(event.tags) }
    var startedAt by remember(event.id) { mutableStateOf(localValueOf(event.startedAt)) }
    var finishedAt by remember(event.id) { mutableStateOf(event.finishedAt?.let(::localValueOf) ?: "") }
    var missed by remember(event.id) { mutableStateOf(event.missed) }
    var priority by remember(event.id) { mutableStateOf(event.priority) }
    var notifyOffsetsMinutes by remember(event.id) { mutableStateOf(event.notifyOffsetsMinutes) }
    var foods by remember(event.id) { mutableStateOf(note?.data?.foodItems.orEmpty()) }
    val submitting = false

    Column(
        modifier = modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        EditCommonFields(
            name = name,
            onNameChange = { name = it },
            description = description,
            onDescriptionChange = { description = it },
            tags = tags,
            onTagsChange = { tags = it },
            startedAt = startedAt,
            onStartedAtChange = { startedAt = it },
            finishedAt = finishedAt,
            onFinishedAtChange = { finishedAt = it },
            missed = missed,
            onMissedChange = { missed = it },
            priority = priority,
            onPriorityChange = { priority = it },
            notifyOffsetsMinutes = notifyOffsetsMinutes,
            onNotifyOffsetsChange = { notifyOffsetsMinutes = it },
            tagViewModel = tagViewModel,
        )
        Text(text = "Itens da refeição", style = MaterialTheme.typography.titleMedium)
        foods.forEachIndexed { index, food ->
            TextField(
                modifier = Modifier.fillMaxWidth(),
                value = food.name,
                onValueChange = { value -> foods = foods.updated(index) { copy(name = value) } },
                label = { Text("Alimento ${index + 1}") },
                singleLine = true,
            )
            TextField(
                modifier = Modifier.fillMaxWidth(),
                value = food.portion,
                onValueChange = { value -> foods = foods.updated(index) { copy(portion = value) } },
                label = { Text("Porção") },
                singleLine = true,
            )
        }
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            OutlinedButton(modifier = Modifier.weight(1f), onClick = onCancel, enabled = !submitting) {
                Text("Cancelar")
            }
            Button(
                modifier = Modifier.weight(1f),
                onClick = {
                    onSave(
                        updateInput(
                            event = event,
                            name = name,
                            description = description,
                            tags = tags,
                            startedAt = startedAt,
                            finishedAt = finishedAt,
                            missed = missed,
                            priority = priority,
                            notifyOffsetsMinutes = notifyOffsetsMinutes,
                            notes =
                                event.notesPatchedWith(
                                    note?.id,
                                    note?.let { UpdateEventNoteDto.edited(it, it.data.copy(foodItems = foods)) }
                                        ?: UpdateEventNoteDto.created(newMealData(event.name, foods)),
                                ),
                        ),
                    )
                },
            ) {
                Text("Salvar alterações")
            }
        }
    }
}

@Composable
private fun SleepEditContent(
    event: EventDetailDto,
    note: SleepEventNoteDto?,
    modifier: Modifier,
    tagViewModel: TagSuggestionViewModel,
    onCancel: () -> Unit,
    onSave: (UpdateEventInputDto) -> Unit,
) {
    var name by remember(event.id) { mutableStateOf(event.name) }
    var description by remember(event.id) { mutableStateOf(event.description) }
    var tags by remember(event.id) { mutableStateOf(event.tags) }
    var startedAt by remember(event.id) { mutableStateOf(localValueOf(event.startedAt)) }
    var finishedAt by remember(event.id) { mutableStateOf(event.finishedAt?.let(::localValueOf) ?: "") }
    var missed by remember(event.id) { mutableStateOf(event.missed) }
    var priority by remember(event.id) { mutableStateOf(event.priority) }
    var notifyOffsetsMinutes by remember(event.id) { mutableStateOf(event.notifyOffsetsMinutes) }
    var trackedSleepTime by remember(event.id) { mutableStateOf(decimalText(note?.data?.trackedSleepTime)) }
    var score by remember(event.id) { mutableStateOf(decimalText(note?.data?.score)) }

    Column(
        modifier = modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        TextField(
            modifier = Modifier.fillMaxWidth(),
            value = trackedSleepTime,
            onValueChange = { trackedSleepTime = it },
            label = { Text("Horas dormidas") },
            singleLine = true,
        )
        TextField(
            modifier = Modifier.fillMaxWidth(),
            value = score,
            onValueChange = { score = it },
            label = { Text("Qualidade (0-100)") },
            singleLine = true,
        )
        EditCommonFields(
            name = name,
            onNameChange = { name = it },
            description = description,
            onDescriptionChange = { description = it },
            tags = tags,
            onTagsChange = { tags = it },
            startedAt = startedAt,
            onStartedAtChange = { startedAt = it },
            finishedAt = finishedAt,
            onFinishedAtChange = { finishedAt = it },
            missed = missed,
            onMissedChange = { missed = it },
            priority = priority,
            onPriorityChange = { priority = it },
            notifyOffsetsMinutes = notifyOffsetsMinutes,
            onNotifyOffsetsChange = { notifyOffsetsMinutes = it },
            tagViewModel = tagViewModel,
        )
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            OutlinedButton(modifier = Modifier.weight(1f), onClick = onCancel) {
                Text("Cancelar")
            }
            Button(
                modifier = Modifier.weight(1f),
                onClick = {
                    val sleepData =
                        SleepItemDto(
                            trackedSleepTime = trackedSleepTime.toDoubleOrNull() ?: 0.0,
                            score = score.toDoubleOrNull() ?: 0.0,
                        )
                    onSave(
                        updateInput(
                            event = event,
                            name = name,
                            description = description,
                            tags = tags,
                            startedAt = startedAt,
                            finishedAt = finishedAt,
                            missed = missed,
                            priority = priority,
                            notifyOffsetsMinutes = notifyOffsetsMinutes,
                            notes =
                                sleepData.let { data ->
                                    event.notesPatchedWith(
                                        note?.id,
                                        note?.let { UpdateEventNoteDto.edited(it, data) } ?: UpdateEventNoteDto.created(data),
                                    )
                                },
                        ),
                    )
                },
            ) {
                Text("Salvar alterações")
            }
        }
    }
}

@Composable
private fun RoutineEditContent(
    event: EventDetailDto,
    modifier: Modifier,
    tagViewModel: TagSuggestionViewModel,
    onCancel: () -> Unit,
    onSave: (UpdateEventInputDto) -> Unit,
) {
    var name by remember(event.id) { mutableStateOf(event.name) }
    var description by remember(event.id) { mutableStateOf(event.description) }
    var tags by remember(event.id) { mutableStateOf(event.tags) }
    var startedAt by remember(event.id) { mutableStateOf(localValueOf(event.startedAt)) }
    var finishedAt by remember(event.id) { mutableStateOf(event.finishedAt?.let(::localValueOf) ?: "") }
    var missed by remember(event.id) { mutableStateOf(event.missed) }
    var priority by remember(event.id) { mutableStateOf(event.priority) }
    var notifyOffsetsMinutes by remember(event.id) { mutableStateOf(event.notifyOffsetsMinutes) }

    Column(
        modifier = modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        EditCommonFields(
            name = name,
            onNameChange = { name = it },
            description = description,
            onDescriptionChange = { description = it },
            tags = tags,
            onTagsChange = { tags = it },
            startedAt = startedAt,
            onStartedAtChange = { startedAt = it },
            finishedAt = finishedAt,
            onFinishedAtChange = { finishedAt = it },
            missed = missed,
            onMissedChange = { missed = it },
            priority = priority,
            onPriorityChange = { priority = it },
            notifyOffsetsMinutes = notifyOffsetsMinutes,
            onNotifyOffsetsChange = { notifyOffsetsMinutes = it },
            tagViewModel = tagViewModel,
        )
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            OutlinedButton(modifier = Modifier.weight(1f), onClick = onCancel) {
                Text("Cancelar")
            }
            Button(
                modifier = Modifier.weight(1f),
                onClick = {
                    onSave(
                        updateInput(
                            event = event,
                            name = name,
                            description = description,
                            tags = tags,
                            startedAt = startedAt,
                            finishedAt = finishedAt,
                            missed = missed,
                            priority = priority,
                            notifyOffsetsMinutes = notifyOffsetsMinutes,
                        ),
                    )
                },
            ) {
                Text("Salvar alterações")
            }
        }
    }
}

@Composable
private fun TrainingEditContent(
    event: EventDetailDto,
    note: TrainingEventNoteDto?,
    modifier: Modifier,
    tagViewModel: TagSuggestionViewModel,
    onCancel: () -> Unit,
    onSave: (UpdateEventInputDto) -> Unit,
) {
    var name by remember(event.id) { mutableStateOf(event.name) }
    var description by remember(event.id) { mutableStateOf(event.description) }
    var tags by remember(event.id) { mutableStateOf(event.tags) }
    var startedAt by remember(event.id) { mutableStateOf(localValueOf(event.startedAt)) }
    var finishedAt by remember(event.id) { mutableStateOf(event.finishedAt?.let(::localValueOf) ?: "") }
    var missed by remember(event.id) { mutableStateOf(event.missed) }
    var priority by remember(event.id) { mutableStateOf(event.priority) }
    var notifyOffsetsMinutes by remember(event.id) { mutableStateOf(event.notifyOffsetsMinutes) }
    val savedWorkouts = note?.data?.workouts.orEmpty()
    var workouts by remember(event.id) { mutableStateOf(savedWorkouts.map(::workoutDraftOf)) }

    fun updateWorkout(
        index: Int,
        transform: (WorkoutDraft) -> WorkoutDraft,
    ) {
        workouts = workouts.mapIndexed { current, workout -> if (current == index) transform(workout) else workout }
    }

    fun updateSet(
        workoutIndex: Int,
        setIndex: Int,
        transform: (WorkoutSetDraft) -> WorkoutSetDraft,
    ) {
        updateWorkout(workoutIndex) { workout ->
            workout.copy(
                sets = workout.sets.mapIndexed { current, set -> if (current == setIndex) transform(set) else set },
            )
        }
    }

    Column(
        modifier = modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text(text = "Treinos", style = MaterialTheme.typography.titleMedium)
        workouts.forEachIndexed { index, workout ->
            Column(
                modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text(text = "Treino ${index + 1}", style = MaterialTheme.typography.titleSmall)
                    TextButton(onClick = { workouts = workouts.filterIndexed { current, _ -> current != index } }) {
                        Text("Remover")
                    }
                }
                SelectField(
                    label = "Modalidade",
                    options = workoutCodeOptions.map { (code, label) -> SelectOption(code, label) },
                    selected = workout.code,
                    onSelect = { code -> updateWorkout(index) { it.copy(code = code) } },
                )
                TextField(
                    modifier = Modifier.fillMaxWidth(),
                    value = workout.name,
                    onValueChange = { value -> updateWorkout(index) { it.copy(name = value) } },
                    label = { Text("Nome do treino") },
                    singleLine = true,
                )
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    TextField(
                        modifier = Modifier.weight(1f),
                        value = workout.calories,
                        onValueChange = { value -> updateWorkout(index) { it.copy(calories = value) } },
                        label = { Text("Calorias") },
                        singleLine = true,
                    )
                    TextField(
                        modifier = Modifier.weight(1f),
                        value = workout.duration,
                        onValueChange = { value -> updateWorkout(index) { it.copy(duration = value) } },
                        label = { Text("Duração (min)") },
                        singleLine = true,
                    )
                }
                if (workout.code == "treadmill" || workout.code == "running") {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        TextField(
                            modifier = Modifier.weight(1f),
                            value = workout.pace,
                            onValueChange = { value -> updateWorkout(index) { it.copy(pace = value) } },
                            label = { Text("Ritmo (min/km)") },
                            singleLine = true,
                        )
                        TextField(
                            modifier = Modifier.weight(1f),
                            value = workout.distance,
                            onValueChange = { value -> updateWorkout(index) { it.copy(distance = value) } },
                            label = { Text("Distância (km)") },
                            singleLine = true,
                        )
                    }
                }
                if (workout.code == "weightlifting") {
                    workout.sets.forEachIndexed { setIndex, set ->
                        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            TextField(
                                modifier = Modifier.weight(1.6f),
                                value = set.exercise,
                                onValueChange = { value -> updateSet(index, setIndex) { it.copy(exercise = value) } },
                                label = { Text("Exercício") },
                                singleLine = true,
                            )
                            TextField(
                                modifier = Modifier.weight(0.8f),
                                value = set.repetitions,
                                onValueChange = { value -> updateSet(index, setIndex) { it.copy(repetitions = value) } },
                                label = { Text("Reps") },
                                singleLine = true,
                            )
                            TextField(
                                modifier = Modifier.weight(0.8f),
                                value = set.weight,
                                onValueChange = { value -> updateSet(index, setIndex) { it.copy(weight = value) } },
                                label = { Text("Kg") },
                                singleLine = true,
                            )
                            TextButton(onClick = {
                                updateWorkout(index) { workoutDraft ->
                                    workoutDraft.copy(
                                        sets =
                                            workoutDraft.sets.filterIndexed { current, _ ->
                                                current !=
                                                    setIndex
                                            },
                                    )
                                }
                            }) {
                                Text("×")
                            }
                        }
                    }
                    TextButton(
                        onClick = {
                            updateWorkout(index) { it.copy(sets = it.sets + WorkoutSetDraft(newKey(), "", "", "")) }
                        },
                    ) {
                        Text("Adicionar série")
                    }
                }
            }
        }
        OutlinedButton(onClick = { workouts = workouts + newWorkoutDraft() }) {
            Text("Adicionar treino")
        }
        EditCommonFields(
            name = name,
            onNameChange = { name = it },
            description = description,
            onDescriptionChange = { description = it },
            tags = tags,
            onTagsChange = { tags = it },
            startedAt = startedAt,
            onStartedAtChange = { startedAt = it },
            finishedAt = finishedAt,
            onFinishedAtChange = { finishedAt = it },
            missed = missed,
            onMissedChange = { missed = it },
            priority = priority,
            onPriorityChange = { priority = it },
            notifyOffsetsMinutes = notifyOffsetsMinutes,
            onNotifyOffsetsChange = { notifyOffsetsMinutes = it },
            tagViewModel = tagViewModel,
        )
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            OutlinedButton(modifier = Modifier.weight(1f), onClick = onCancel) {
                Text("Cancelar")
            }
            Button(
                modifier = Modifier.weight(1f),
                onClick = {
                    val builtWorkouts = workouts.map(WorkoutDraft::toDto)
                    val trainingData =
                        TrainingDataDto(
                            workouts = builtWorkouts,
                            caloriesBurned = builtWorkouts.sumOf { workout -> workout.calories },
                        )
                    onSave(
                        updateInput(
                            event = event,
                            name = name,
                            description = description,
                            tags = tags,
                            startedAt = startedAt,
                            finishedAt = finishedAt,
                            missed = missed,
                            priority = priority,
                            notifyOffsetsMinutes = notifyOffsetsMinutes,
                            notes =
                                event.notesPatchedWith(
                                    note?.id,
                                    note?.let { UpdateEventNoteDto.edited(it, trainingData) }
                                        ?: UpdateEventNoteDto.created(trainingData),
                                ),
                        ),
                    )
                },
            ) {
                Text("Salvar alterações")
            }
        }
    }
}

private data class WorkoutSetDraft(
    val id: String,
    val exercise: String,
    val repetitions: String,
    val weight: String,
)

private data class WorkoutDraft(
    val id: String,
    val code: String,
    val name: String,
    val calories: String,
    val duration: String,
    val pace: String,
    val distance: String,
    val sets: List<WorkoutSetDraft>,
) {
    fun toDto(): WorkoutSnapshotDto {
        val id = id.ifBlank(::newKey)
        val calories = calories.toDoubleOrNull() ?: 0.0
        val duration = duration.toDoubleOrNull() ?: 0.0
        return when (code) {
            "treadmill" -> TreadmillWorkoutDto(id, name, calories, duration, pace.toDoubleOrNull() ?: 0.0, distance.toDoubleOrNull() ?: 0.0)
            "running" -> RunningWorkoutDto(id, name, calories, duration, pace.toDoubleOrNull() ?: 0.0, distance.toDoubleOrNull() ?: 0.0)
            "weightlifting" ->
                WeightliftingWorkoutDto(
                    id = id,
                    workoutName = name,
                    calories = calories,
                    duration = duration,
                    sets =
                        sets.map { set ->
                            WorkoutSetDto(
                                id = set.id.ifBlank(::newKey),
                                exercise = set.exercise.trim(),
                                repetitions = set.repetitions.toIntOrNull() ?: 0,
                                weight = set.weight.toDoubleOrNull() ?: 0.0,
                            )
                        },
                )
            else -> FreeWorkoutDto(id, name, calories, duration)
        }
    }
}

private val workoutCodeOptions =
    listOf(
        "treadmill" to "Esteira",
        "running" to "Corrida",
        "weightlifting" to "Musculação",
        "free" to "Livre",
    )

private fun workoutDraftOf(workout: WorkoutSnapshotDto): WorkoutDraft =
    when (workout) {
        is TreadmillWorkoutDto -> workout.draft(pace = workout.pace, distance = workout.distance)
        is RunningWorkoutDto -> workout.draft(pace = workout.pace, distance = workout.distance)
        is WeightliftingWorkoutDto ->
            workout.draft(
                sets =
                    workout.sets.map { set ->
                        WorkoutSetDraft(set.id, set.exercise, set.repetitions.toString(), set.weight.toString())
                    },
            )
        is FreeWorkoutDto -> workout.draft()
    }

private fun WorkoutSnapshotDto.draft(
    pace: Double = 0.0,
    distance: Double = 0.0,
    sets: List<WorkoutSetDraft> = emptyList(),
): WorkoutDraft =
    WorkoutDraft(
        id = id,
        code =
            when (this) {
                is TreadmillWorkoutDto -> "treadmill"
                is RunningWorkoutDto -> "running"
                is WeightliftingWorkoutDto -> "weightlifting"
                is FreeWorkoutDto -> "free"
            },
        name = workoutName,
        calories = calories.toString(),
        duration = duration.toString(),
        pace = pace.toString(),
        distance = distance.toString(),
        sets = sets,
    )

private fun newKey(): String =
    java.util.UUID
        .randomUUID()
        .toString()

private fun newWorkoutDraft(): WorkoutDraft = WorkoutDraft(newKey(), "free", "", "", "", "", "", emptyList())

@Composable
private fun EditCommonFields(
    name: String,
    onNameChange: (String) -> Unit,
    description: String,
    onDescriptionChange: (String) -> Unit,
    tags: List<String>,
    onTagsChange: (List<String>) -> Unit,
    startedAt: String,
    onStartedAtChange: (String) -> Unit,
    finishedAt: String,
    onFinishedAtChange: (String) -> Unit,
    missed: Boolean,
    onMissedChange: (Boolean) -> Unit,
    priority: String,
    onPriorityChange: (String) -> Unit,
    notifyOffsetsMinutes: List<Double>,
    onNotifyOffsetsChange: (List<Double>) -> Unit,
    tagViewModel: TagSuggestionViewModel,
) {
    TextField(
        modifier = Modifier.fillMaxWidth(),
        value = name,
        onValueChange = onNameChange,
        label = { Text("Nome") },
        singleLine = true,
    )
    TextField(
        modifier = Modifier.fillMaxWidth(),
        value = description,
        onValueChange = onDescriptionChange,
        label = { Text("Descrição") },
        minLines = 2,
    )
    TagInput(tags = tags, onTagsChange = onTagsChange, viewModel = tagViewModel)
    TextField(
        modifier = Modifier.fillMaxWidth(),
        value = startedAt,
        onValueChange = onStartedAtChange,
        label = { Text("Início (AAAA-MM-DDTHH:MM)") },
        singleLine = true,
    )
    TextField(
        modifier = Modifier.fillMaxWidth(),
        value = finishedAt,
        onValueChange = onFinishedAtChange,
        label = { Text("Fim (opcional)") },
        singleLine = true,
    )
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Button(onClick = { onMissedChange(!missed) }) {
            Text(if (missed) "Não realizado" else "Marcar como não realizado")
        }
    }
    SelectField(
        label = "Prioridade",
        options = priorityOptions,
        selected = priority,
        onSelect = onPriorityChange,
    )
    SelectField(
        label = "Lembrete",
        options = reminderOptions,
        selected = notifyOffsetsMinutes.selectedReminder(),
        onSelect = { minutes -> onNotifyOffsetsChange(if (minutes == 0.0) emptyList() else listOf(minutes)) },
    )
}

private val priorityOptions =
    listOf(
        SelectOption("urgent", "Urgente"),
        SelectOption("normal", "Normal"),
        SelectOption("flexible", "Flexível"),
    )

private fun updateInput(
    event: EventDetailDto,
    name: String,
    description: String,
    tags: List<String>,
    startedAt: String,
    finishedAt: String,
    missed: Boolean,
    priority: String,
    notifyOffsetsMinutes: List<Double>,
    notes: List<UpdateEventNoteDto>? = null,
): UpdateEventInputDto =
    UpdateEventInputDto(
        eventId = event.id,
        expectedRevision = event.revision,
        name = name.trim(),
        description = description.trim(),
        tags = tags,
        startedAt = isoValueOf(startedAt),
        finishedAt = finishedAt.takeIf(String::isNotBlank)?.let(::isoValueOf),
        missed = missed,
        priority = priority,
        notifyOffsetsMinutes = notifyOffsetsMinutes,
        notes = notes,
        taskIds = event.taskIds,
    )

private fun decimalText(value: Double?): String = value?.toString().orEmpty()

/** Sem refeição anterior, a note nasce com o nome do evento; os totais a API recalcula a partir dos alimentos. */
private fun newMealData(
    eventName: String,
    foods: List<FoodItemDto>,
): MealItemDto =
    MealItemDto(
        name = eventName,
        description = "",
        foodItems = foods,
        totals = MealTotalsDto(0.0, 0.0, 0.0, 0.0, 0.0),
    )

private fun List<FoodItemDto>.updated(
    index: Int,
    transform: FoodItemDto.() -> FoodItemDto,
): List<FoodItemDto> = mapIndexed { current, food -> if (current == index) food.transform() else food }

private val editDateFormatter = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm")

private fun localValueOf(instant: String): String =
    LocalDateTime
        .ofInstant(Instant.parse(instant), ZoneId.of(TIMELINE_TIME_ZONE))
        .format(editDateFormatter)

private fun isoValueOf(value: String): String =
    LocalDateTime
        .parse(value, editDateFormatter)
        .atZone(ZoneId.of(TIMELINE_TIME_ZONE))
        .toInstant()
        .toString()

@Composable
private fun EditMessage(
    modifier: Modifier,
    message: String,
    onAction: () -> Unit,
) {
    Column(
        modifier = modifier.fillMaxSize().padding(24.dp),
        verticalArrangement = Arrangement.Center,
    ) {
        Text(text = message, color = MaterialTheme.colorScheme.error)
        Button(onClick = onAction) { Text("Tentar novamente") }
    }
}
