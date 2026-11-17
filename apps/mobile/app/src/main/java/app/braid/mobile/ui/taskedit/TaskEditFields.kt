package app.braid.mobile.ui.taskedit

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.braid.mobile.core.designsystem.BraidIcons
import app.braid.mobile.core.designsystem.BraidMonoFont
import app.braid.mobile.core.designsystem.SvgIcon
import app.braid.mobile.core.designsystem.braidBrand
import app.braid.mobile.core.designsystem.tagColors
import app.braid.mobile.domain.task.REMINDER_RANGE_MESSAGE
import app.braid.mobile.domain.task.ReminderUnit
import app.braid.mobile.domain.task.TaskActor
import app.braid.mobile.domain.task.TaskDraft
import app.braid.mobile.domain.task.TaskDraftErrors
import app.braid.mobile.domain.task.TaskDraftField
import app.braid.mobile.domain.task.TaskKind
import app.braid.mobile.domain.task.TaskPriority
import app.braid.mobile.domain.task.TaskStatus
import app.braid.mobile.domain.task.humanStatusOptions
import app.braid.mobile.domain.task.reminderLabel
import app.braid.mobile.domain.task.reminderMinutes
import app.braid.mobile.domain.timeline.shortDate
import app.braid.mobile.ui.taskdetail.Section
import app.braid.mobile.ui.taskdetail.openMap
import app.braid.mobile.ui.tasks.TaskKindMark
import app.braid.mobile.ui.tasks.TaskPriorityMark
import app.braid.mobile.ui.tasks.TaskPrioritySheet
import app.braid.mobile.ui.tasks.TaskStatusGlyph
import app.braid.mobile.ui.tasks.taskStatusName

/** Os tipos de tarefa de pessoa, na ordem do web, com o rótulo da tela (`visualForItemType`). */
private val KIND_LABELS =
    listOf(
        TaskKind.Common to "Padrão",
        TaskKind.Meal to "Refeição",
        TaskKind.Training to "Treino",
        TaskKind.Sleep to "Sono",
    )

/**
 * O resumo do formulário: o tipo, o título (serifa, grande) e a linha com status e prioridade. "Sem status" vale só
 * para a tarefa que não é persistente (a persistente sempre tem status).
 */
@Composable
internal fun HeaderFields(
    draft: TaskDraft,
    errors: TaskDraftErrors,
    update: ((TaskDraft) -> TaskDraft) -> Unit,
) {
    var kindOpen by rememberSaveable { mutableStateOf(false) }
    var statusOpen by rememberSaveable { mutableStateOf(false) }
    var priorityOpen by rememberSaveable { mutableStateOf(false) }
    val statusName = taskStatusName(TaskActor.Human, draft.status)
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        ChoiceChip("Tipo: ${kindLabel(draft.kind)}", onClick = { kindOpen = true }) { TaskKindMark(draft.kind) }
        TitleField(draft.name, errors[TaskDraftField.Name]) { value -> update { it.copy(name = value) } }
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            ChoiceChip("Status: $statusName", onClick = { statusOpen = true }) {
                TaskStatusGlyph(actor = TaskActor.Human, status = draft.status, size = 18.dp)
                Column {
                    Text(statusName, color = MaterialTheme.colorScheme.onBackground, fontSize = 14.sp, lineHeight = 20.sp)
                    Text(
                        draft.status?.code ?: "sem status",
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        fontFamily = BraidMonoFont,
                        fontSize = 11.sp,
                        lineHeight = 14.sp,
                    )
                }
            }
            Box(Modifier.weight(1f))
            ChoiceChip("Prioridade: ${draft.priority.label}", onClick = { priorityOpen = true }) {
                TaskPriorityMark(draft.priority)
                Text(draft.priority.label, color = MaterialTheme.colorScheme.onBackground, fontSize = 14.sp, lineHeight = 20.sp)
            }
        }
        FieldError(errors, TaskDraftField.Status)
    }
    if (kindOpen) {
        OptionSheet(
            description = "Tipo da tarefa",
            options = KIND_LABELS.map { (kind, label) -> Option(kind, label, kind == draft.kind) },
            onPick = { kind ->
                kindOpen = false
                update { it.copy(kind = kind) }
            },
            onDismiss = { kindOpen = false },
            leading = { kind -> TaskKindMark(kind) },
        )
    }
    if (statusOpen) {
        val statuses: List<TaskStatus?> = humanStatusOptions(draft.longRunning) + if (draft.longRunning) emptyList() else listOf(null)
        OptionSheet(
            description = "Status da tarefa",
            options =
                statuses.map { status ->
                    Option(
                        status,
                        taskStatusName(TaskActor.Human, status).let { name ->
                            if (status ==
                                null
                            ) {
                                "Sem status"
                            } else {
                                name
                            }
                        },
                        status == draft.status,
                    )
                },
            onPick = { status ->
                statusOpen = false
                update { it.copy(status = status) }
            },
            onDismiss = { statusOpen = false },
            leading = { status -> TaskStatusGlyph(actor = TaskActor.Human, status = status, size = 18.dp) },
        )
    }
    if (priorityOpen) {
        TaskPrioritySheet(
            taskName = draft.name.ifBlank { "tarefa" },
            current = draft.priority,
            onPick = { priority: TaskPriority ->
                priorityOpen = false
                update { it.copy(priority = priority) }
            },
            onDismiss = { priorityOpen = false },
        )
    }
}

private fun kindLabel(kind: TaskKind): String = KIND_LABELS.firstOrNull { it.first == kind }?.second ?: kind.code

/** O botão de escolha do resumo: o desenho do valor atual e a seta, sem moldura, com a área de toque de 48dp. */
@Composable
private fun ChoiceChip(
    description: String,
    onClick: () -> Unit,
    content: @Composable () -> Unit,
) {
    Row(
        Modifier
            .defaultMinSize(minHeight = 48.dp)
            .clip(CircleShape)
            .clickable(role = Role.Button, onClick = onClick)
            .padding(horizontal = 4.dp)
            .semantics { contentDescription = description },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        content()
        SvgIcon(
            BraidIcons.chevronDown,
            size = 14.dp,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier =
                Modifier
                    .clearAndSetSemantics {
                    },
        )
    }
}

/** O título como campo, na serifa do detalhe; o foco ganha o verde da marca. */
@Composable
private fun TitleField(
    value: String,
    error: String?,
    onChange: (String) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        FormField(
            value = value,
            onChange = onChange,
            label = "Título",
            placeholder = "Título da tarefa",
            invalid = error != null,
            textStyle = MaterialTheme.typography.headlineLarge.copy(fontWeight = FontWeight.Normal, lineHeight = 36.sp),
            keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences, imeAction = ImeAction.Next),
        )
        error?.let { Text(it, color = MaterialTheme.colorScheme.error, fontSize = 13.sp, lineHeight = 18.sp) }
    }
}

/** Um campo de texto do formulário: borda fina que ganha o verde da marca no foco (o modelo B do quadro de foco). */
@Composable
internal fun FormField(
    value: String,
    onChange: (String) -> Unit,
    label: String,
    modifier: Modifier = Modifier,
    placeholder: String = "",
    invalid: Boolean = false,
    singleLine: Boolean = false,
    minLines: Int = 1,
    textStyle: androidx.compose.ui.text.TextStyle = MaterialTheme.typography.bodyLarge,
    keyboardOptions: KeyboardOptions = KeyboardOptions.Default,
    keyboardActions: KeyboardActions = KeyboardActions.Default,
    onFocusLost: (() -> Unit)? = null,
) {
    val interaction = remember { MutableInteractionSource() }
    val focused by interaction.collectIsFocusedAsState()
    val borderColor =
        when {
            invalid -> MaterialTheme.colorScheme.error
            focused -> braidBrand()
            else -> MaterialTheme.colorScheme.outline
        }
    BasicTextField(
        value = value,
        onValueChange = onChange,
        singleLine = singleLine,
        minLines = minLines,
        interactionSource = interaction,
        keyboardOptions = keyboardOptions,
        keyboardActions = keyboardActions,
        textStyle = textStyle.copy(color = MaterialTheme.colorScheme.onBackground),
        cursorBrush = SolidColor(braidBrand()),
        modifier =
            modifier
                .fillMaxWidth()
                .onFocusChanged { if (!it.isFocused) onFocusLost?.invoke() }
                .semantics { contentDescription = label },
        decorationBox = { inner ->
            Box(
                Modifier
                    .fillMaxWidth()
                    .defaultMinSize(minHeight = 48.dp)
                    .border(1.dp, borderColor, RoundedCornerShape(14.dp))
                    .padding(horizontal = 14.dp, vertical = 10.dp),
                contentAlignment = Alignment.CenterStart,
            ) {
                if (value.isEmpty() && placeholder.isNotEmpty()) {
                    Text(placeholder, color = MaterialTheme.colorScheme.onSurfaceVariant, style = textStyle)
                }
                inner()
            }
        },
    )
}

/**
 * A seção "Informações": uma linha por dado, o rótulo à esquerda e o controle à direita. Início e fim (ou previsão de
 * entrega, na tarefa persistente), a tarefa persistente (só na edição) e os lembretes. A recorrência (ticket 14) entra
 * entre a tarefa persistente e os lembretes.
 */
@Composable
internal fun InfoSection(
    draft: TaskDraft,
    errors: TaskDraftErrors,
    creating: Boolean,
    actions: TaskEditActions,
) {
    Section("Informações") {
        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
            HorizontalDivider(color = MaterialTheme.colorScheme.outline)
            DateRow(
                label = "Início",
                date = draft.startDate,
                time = draft.startTime,
                dateLabel = "Data de início",
                timeLabel = "Hora de início",
                errors = errors,
                dateField = TaskDraftField.StartDate,
                timeField = TaskDraftField.StartTime,
                onDate = { value -> actions.update { it.copy(startDate = value) } },
                onTime = { value -> actions.update { it.copy(startTime = value) } },
            )
            DateRow(
                label = if (draft.longRunning) "Previsão de entrega" else "Término",
                date = draft.endDate,
                time = draft.endTime,
                dateLabel = if (draft.longRunning) "Data da previsão de entrega" else "Data de término",
                timeLabel = if (draft.longRunning) "Hora da previsão de entrega" else "Hora de término",
                errors = errors,
                dateField = TaskDraftField.EndDate,
                timeField = TaskDraftField.EndTime,
                onDate = { value -> actions.update { it.copy(endDate = value) } },
                onTime = { value -> actions.update { it.copy(endTime = value) } },
            )
            // A tarefa persistente só existe na edição: a criação não a envia.
            if (!creating) PersistentRow(draft.longRunning) { value -> actions.update { it.copy(longRunning = value) } }
            // Recorrência (ticket 14): a linha "Recorrência" entra aqui.
            ReminderRow(
                reminders = draft.reminders,
                noDeadline = draft.longRunning && draft.endDate.isEmpty(),
                error = errors[TaskDraftField.Reminders],
                onAdd = actions.addReminder,
                onRemove = actions.removeReminder,
            )
        }
    }
}

/** Uma linha do formulário: o rótulo e, ao lado, o controle com a dica e o erro embaixo. */
@Composable
internal fun EditRow(
    label: String,
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit,
) {
    Column(modifier.fillMaxWidth().padding(vertical = 8.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(label, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 13.sp, lineHeight = 18.sp)
        content()
        HorizontalDivider(Modifier.padding(top = 6.dp), color = MaterialTheme.colorScheme.outline.copy(alpha = HAIRLINE_ALPHA))
    }
}

private const val HAIRLINE_ALPHA = 0.6f

@Composable
private fun DateRow(
    label: String,
    date: String,
    time: String,
    dateLabel: String,
    timeLabel: String,
    errors: TaskDraftErrors,
    dateField: TaskDraftField,
    timeField: TaskDraftField,
    onDate: (String) -> Unit,
    onTime: (String) -> Unit,
) {
    var dateOpen by rememberSaveable(label) { mutableStateOf(false) }
    var timeOpen by rememberSaveable(label) { mutableStateOf(false) }
    EditRow(label) {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
            PickerButton(
                text = if (date.isEmpty()) "Data" else dateText(date),
                empty = date.isEmpty(),
                description = "$dateLabel: ${if (date.isEmpty()) "sem data" else dateText(date)}",
                invalid = errors.containsKey(dateField),
                onClick = { dateOpen = true },
            )
            PickerButton(
                text = time.ifEmpty { "Hora" },
                empty = time.isEmpty(),
                description = "$timeLabel: ${time.ifEmpty { "sem hora" }}",
                invalid = errors.containsKey(timeField),
                onClick = { timeOpen = true },
            )
        }
        FieldError(errors, dateField)
        FieldError(errors, timeField)
    }
    if (dateOpen) {
        DatePickerSheet(
            value = date,
            onPick = {
                dateOpen = false
                onDate(it)
            },
            onDismiss = { dateOpen = false },
        )
    }
    if (timeOpen) {
        TimePickerSheet(
            value = time,
            onPick = {
                timeOpen = false
                onTime(it)
            },
            onDismiss = { timeOpen = false },
        )
    }
}

/** "14 set 2026": o dia como o seletor do web o escreve. */
private fun dateText(dayKey: String): String = "${shortDate(dayKey).lowercase()} ${dayKey.substringBefore('-')}"

@Composable
private fun PickerButton(
    text: String,
    empty: Boolean,
    description: String,
    invalid: Boolean,
    onClick: () -> Unit,
) {
    Box(
        Modifier
            .defaultMinSize(minHeight = 48.dp)
            .border(
                BorderStroke(1.dp, if (invalid) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.outline),
                CircleShape,
            ).clip(CircleShape)
            .clickable(role = Role.Button, onClick = onClick)
            .padding(horizontal = 16.dp)
            .semantics { contentDescription = description },
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = text,
            color = if (empty) MaterialTheme.colorScheme.onSurfaceVariant else MaterialTheme.colorScheme.onBackground,
            fontSize = 14.sp,
            lineHeight = 20.sp,
        )
    }
}

/** "Tarefa persistente": Não e Sim num controle só. Sim faz da tarefa uma tarefa longa; as recusas vêm da validação ao salvar. */
@Composable
private fun PersistentRow(
    longRunning: Boolean,
    onChange: (Boolean) -> Unit,
) {
    EditRow("Tarefa persistente") {
        Row(
            Modifier.border(1.dp, MaterialTheme.colorScheme.outline, CircleShape).padding(3.dp).semantics {
                contentDescription =
                    "Tarefa persistente"
            },
        ) {
            listOf(false to "Não", true to "Sim").forEach { (value, text) ->
                val selected = longRunning == value
                Box(
                    Modifier
                        .defaultMinSize(minWidth = 64.dp, minHeight = 42.dp)
                        .clip(CircleShape)
                        .background(
                            if (selected) MaterialTheme.colorScheme.surfaceVariant else androidx.compose.ui.graphics.Color.Transparent,
                        ).semantics { this.selected = selected }
                        .clickable(role = Role.Button) { onChange(value) },
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        text,
                        color = MaterialTheme.colorScheme.onBackground,
                        fontSize = 14.sp,
                        fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Normal,
                    )
                }
            }
        }
    }
}

private const val NO_DEADLINE_HINT = "Sem previsão de entrega não há lembrete."

/** "Lembrar antes de": um chip por lembrete, com remover, e o "+" que abre a quantidade e a unidade (minutos ou dias). */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ReminderRow(
    reminders: List<Int>,
    noDeadline: Boolean,
    error: String?,
    onAdd: (Int) -> Unit,
    onRemove: (Int) -> Unit,
) {
    var adding by rememberSaveable { mutableStateOf(false) }
    EditRow("Lembrar antes de") {
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            reminders.forEach { minutes ->
                val label = reminderLabel(minutes)
                RemovableChip(text = label, description = "Remover lembrete de $label antes", onClick = { onRemove(minutes) })
            }
            if (!noDeadline && !adding) AddButton("Adicionar lembrete") { adding = true }
        }
        if (noDeadline) Text(NO_DEADLINE_HINT, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 13.sp, lineHeight = 18.sp)
        if (!noDeadline && adding) {
            NewReminder(
                onAdd = {
                    onAdd(it)
                    adding = false
                },
                onCancel = { adding = false },
            )
        }
        error?.let { Text(it, color = MaterialTheme.colorScheme.error, fontSize = 13.sp, lineHeight = 18.sp) }
    }
}

@Composable
private fun NewReminder(
    onAdd: (Int) -> Unit,
    onCancel: () -> Unit,
) {
    var amount by rememberSaveable { mutableStateOf("") }
    var unit by rememberSaveable { mutableStateOf(ReminderUnit.Minutes) }
    var error by rememberSaveable { mutableStateOf(false) }

    fun add() {
        val minutes = amount.toDoubleOrNull()?.let { reminderMinutes(it, unit) }
        if (minutes == null) error = true else onAdd(minutes)
    }
    Column(Modifier.semantics { contentDescription = "Novo lembrete" }, verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
            FormField(
                value = amount,
                onChange = {
                    amount = it
                    error = false
                },
                label = "Quantidade do lembrete",
                modifier = Modifier.weight(1f),
                invalid = error,
                singleLine = true,
                keyboardOptions =
                    KeyboardOptions(
                        keyboardType = androidx.compose.ui.text.input.KeyboardType.Number,
                        imeAction = ImeAction.Done,
                    ),
                keyboardActions = KeyboardActions(onDone = { add() }),
            )
            listOf(ReminderUnit.Minutes to "minutos", ReminderUnit.Days to "dias").forEach { (value, text) ->
                val selected = unit == value
                Box(
                    Modifier
                        .defaultMinSize(minHeight = 48.dp)
                        .clip(CircleShape)
                        .background(
                            if (selected) MaterialTheme.colorScheme.surfaceVariant else androidx.compose.ui.graphics.Color.Transparent,
                        ).semantics { this.selected = selected }
                        .clickable(role = Role.Button) { unit = value }
                        .padding(horizontal = 12.dp),
                    contentAlignment = Alignment.Center,
                ) { Text(text, color = MaterialTheme.colorScheme.onBackground, fontSize = 14.sp) }
            }
        }
        Row {
            TextButton(onClick = ::add) { Text("Adicionar", fontWeight = FontWeight.SemiBold) }
            TextButton(onClick = onCancel) { Text("Cancelar") }
        }
        if (error) Text(REMINDER_RANGE_MESSAGE, color = MaterialTheme.colorScheme.error, fontSize = 13.sp, lineHeight = 18.sp)
    }
}

/** O chip de um item da lista (lembrete, tag) com o X de remover. */
@Composable
internal fun RemovableChip(
    text: String,
    description: String,
    onClick: () -> Unit,
    color: androidx.compose.ui.graphics.Color = MaterialTheme.colorScheme.onBackground,
) {
    Row(
        Modifier
            .defaultMinSize(minHeight = 40.dp)
            .border(1.dp, MaterialTheme.colorScheme.outline, CircleShape)
            .clip(CircleShape)
            .clickable(role = Role.Button, onClick = onClick)
            .padding(start = 14.dp, end = 10.dp)
            .semantics { contentDescription = description },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Text(text, color = color, fontSize = 14.sp, lineHeight = 20.sp)
        SvgIcon(
            TaskEditIcons.x,
            size = 14.dp,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.clearAndSetSemantics {},
        )
    }
}

/** O "+" redondo que acrescenta um item a uma lista. */
@Composable
internal fun AddButton(
    description: String,
    onClick: () -> Unit,
) {
    Box(
        Modifier
            .size(40.dp)
            .border(1.dp, MaterialTheme.colorScheme.outline, CircleShape)
            .clip(CircleShape)
            .clickable(role = Role.Button, onClick = onClick)
            .semantics { contentDescription = description },
        contentAlignment = Alignment.Center,
    ) {
        SvgIcon(
            TaskEditIcons.plus,
            size = 16.dp,
            color = MaterialTheme.colorScheme.onBackground,
            modifier = Modifier.clearAndSetSemantics {},
        )
    }
}

/** "Local": um campo de texto com sugestões do serviço de mapas; sem escolher nenhuma, vale o que foi digitado. */
@Composable
internal fun LocationSection(
    location: String,
    form: TaskEditUiState.Form,
    actions: TaskEditActions,
) {
    val context = LocalContext.current
    Section("Local") {
        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
            FormField(
                value = location,
                onChange = actions.typeLocation,
                label = "Local",
                placeholder = "Procure um endereço ou lugar",
                invalid = form.errors.containsKey(TaskDraftField.Location),
                singleLine = true,
                keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences, imeAction = ImeAction.Done),
                keyboardActions = KeyboardActions(onDone = { actions.dismissPlaces() }),
            )
            FieldError(form.errors, TaskDraftField.Location)
            if (form.placeSuggestions.isNotEmpty()) {
                Column(Modifier.semantics { contentDescription = "Sugestões de local" }) {
                    form.placeSuggestions.forEach { label ->
                        Text(
                            text = label,
                            modifier =
                                Modifier
                                    .fillMaxWidth()
                                    .defaultMinSize(minHeight = 48.dp)
                                    .clickable(role = Role.Button) { actions.choosePlace(label) }
                                    .padding(horizontal = 4.dp, vertical = 12.dp),
                            color = MaterialTheme.colorScheme.onBackground,
                            fontSize = 14.sp,
                            lineHeight = 20.sp,
                        )
                    }
                }
            }
            if (location.isNotBlank()) {
                Text(
                    text = "Abrir no Google Maps",
                    modifier =
                        Modifier
                            .defaultMinSize(minHeight = 40.dp)
                            .clickable(role = Role.Button) {
                                openMap(context, location)
                            }.padding(vertical = 10.dp),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    fontSize = 13.sp,
                    lineHeight = 20.sp,
                )
            }
        }
    }
}

/** "Tags": um chip por tag, com remover, e o campo "Nova tag". Ao digitar, a API sugere tags do usuário. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun TagsSection(
    tags: List<String>,
    suggestions: List<String>,
    actions: TaskEditActions,
) {
    var text by rememberSaveable { mutableStateOf("") }

    fun commit(raw: String) {
        text = ""
        actions.commitTag(raw)
    }
    Section("Tags") {
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                tags.forEach { tag ->
                    RemovableChip(
                        text = "#$tag",
                        description = "Remover tag $tag",
                        onClick = { actions.removeTag(tag) },
                        color = tagColors(tag).color,
                    )
                }
            }
            FormField(
                value = text,
                onChange = {
                    // A vírgula termina a tag, como no web.
                    if (it.endsWith(",")) {
                        commit(it.dropLast(1))
                    } else {
                        text = it
                        actions.suggestTags(it)
                    }
                },
                label = "Nova tag",
                placeholder = "Nova tag",
                singleLine = true,
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
                keyboardActions = KeyboardActions(onDone = { commit(text) }),
                onFocusLost = { if (text.isNotBlank()) commit(text) },
            )
            val shown = suggestions.filter { it !in tags }
            if (shown.isNotEmpty()) {
                Column(Modifier.semantics { contentDescription = "Sugestões de tags" }) {
                    shown.forEach { name ->
                        Text(
                            text = "#$name",
                            modifier =
                                Modifier
                                    .fillMaxWidth()
                                    .defaultMinSize(minHeight = 48.dp)
                                    .clickable(role = Role.Button) { commit(name) }
                                    .padding(horizontal = 4.dp, vertical = 12.dp),
                            color = tagColors(name).color,
                            fontSize = 14.sp,
                            lineHeight = 20.sp,
                        )
                    }
                }
            }
        }
    }
}

@Composable
internal fun DescriptionSection(
    value: String,
    onChange: (String) -> Unit,
) {
    Section("Descrição") {
        FormField(
            value = value,
            onChange = onChange,
            label = "Descrição",
            minLines = 4,
            keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences),
        )
    }
}

private class Option<T>(
    val value: T,
    val label: String,
    val selected: Boolean,
)

/** Uma lista de escolha numa folha inferior (tipo e status): o rótulo de cada opção, a atual marcada. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun <T> OptionSheet(
    description: String,
    options: List<Option<T>>,
    onPick: (T) -> Unit,
    onDismiss: () -> Unit,
    leading: @Composable (T) -> Unit,
) {
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        containerColor = MaterialTheme.colorScheme.background,
        modifier = Modifier.semantics { contentDescription = description },
    ) {
        Column(
            Modifier
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .navigationBarsPadding()
                .padding(start = 12.dp, end = 12.dp, bottom = 16.dp),
        ) {
            options.forEach { option ->
                Row(
                    Modifier
                        .fillMaxWidth()
                        .defaultMinSize(minHeight = 48.dp)
                        .semantics(mergeDescendants = true) { selected = option.selected }
                        .clickable(role = Role.Button) { onPick(option.value) }
                        .padding(horizontal = 10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Box(Modifier.size(24.dp), contentAlignment = Alignment.Center) { leading(option.value) }
                    Text(
                        text = option.label,
                        modifier = Modifier.weight(1f).padding(start = 10.dp),
                        color = MaterialTheme.colorScheme.onBackground,
                        fontSize = 14.sp,
                        lineHeight = 20.sp,
                    )
                    if (option.selected) {
                        SvgIcon(
                            BraidIcons.check,
                            size = 16.dp,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            strokeWidth = 1.75f,
                            modifier = Modifier.clearAndSetSemantics {},
                        )
                    }
                }
            }
        }
    }
}
