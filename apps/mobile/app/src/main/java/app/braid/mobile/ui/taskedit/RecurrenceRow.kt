package app.braid.mobile.ui.taskedit

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.braid.mobile.core.designsystem.SvgIcon
import app.braid.mobile.core.designsystem.SvgPart
import app.braid.mobile.domain.task.RecurrenceDraft
import app.braid.mobile.domain.task.RecurrenceField
import app.braid.mobile.domain.task.RecurrenceFrequency
import app.braid.mobile.domain.task.TaskDraft
import app.braid.mobile.domain.task.newSeriesMeta
import app.braid.mobile.domain.task.newSeriesSummary
import app.braid.mobile.domain.task.recurrenceLines
import app.braid.mobile.domain.task.schedule
import app.braid.mobile.domain.task.scheduleAfterTask
import app.braid.mobile.domain.time.MONTHS_LONG
import app.braid.mobile.domain.time.WEEKDAYS_PLAIN
import app.braid.mobile.domain.timeline.shortDate
import java.util.TimeZone

/** O ícone `Repeat` do lucide, na grade de 24. */
private val repeatIcon =
    listOf(
        SvgPart("m17 2 4 4-4 4"),
        SvgPart("M3 11v-1a4 4 0 0 1 4-4h14"),
        SvgPart("m7 22-4-4 4-4"),
        SvgPart("M21 13v1a4 4 0 0 1-4 4H3"),
    )

private val FREQUENCIES =
    listOf(
        RecurrenceFrequency.Daily to "Todo dia",
        RecurrenceFrequency.Weekly to "Toda semana",
        RecurrenceFrequency.Monthly to "Todo mês",
        RecurrenceFrequency.Yearly to "Todo ano",
    )

/** Bit 0 = domingo, como a máscara da API: a letra do botão e o nome para o leitor de tela. */
private val WEEKDAYS = WEEKDAYS_PLAIN.map { it.take(1) to it }

private val MONTHS = MONTHS_LONG

private const val NEW_SERIES_HINT = "A data de início, a hora e a duração vêm do formulário."
private const val JOINING_HINT = "Esta tarefa fica como está; a série começa no dia seguinte, com a hora e a duração dela."
private const val SERIES_HINT = "A hora, a duração e o início da série ficam como estão."
private const val NO_END_HINT = "Sem data, a série não tem fim."

/**
 * A linha "Recorrência" de Informações. Três casos, como no web: na criação, definir a regra faz Salvar criar a série no
 * lugar da tarefa; numa tarefa avulsa, Salvar grava a tarefa e cria a série, que começa no dia seguinte; numa ocorrência,
 * a linha mostra a regra, desde quando vale, se tem fim e se a ocorrência segue a série, e deixa trocar a regra e apagar a
 * série. A regra não entra no corpo da tarefa: Salvar a manda como chamada própria. A tarefa persistente não se repete,
 * então quem a chama não mostra a linha nela.
 */
@Composable
internal fun RecurrenceRow(
    draft: TaskDraft,
    creating: Boolean,
    recurrence: RecurrenceForm,
    actions: TaskEditActions,
) {
    var open by rememberSaveable { mutableStateOf(false) }
    val occurrence = recurrence.occurrence
    val rule = recurrence.draft
    if (creating || occurrence == null) {
        // Sem série, a linha deixa definir a regra. Na tarefa avulsa a série nasce no dia seguinte ao dela.
        val schedule = if (creating) draft.schedule() else scheduleAfterTask(draft.schedule())
        EditRow("Recorrência") {
            if (rule == null) {
                RuleButton("Definir a regra", empty = true, description = "Definir a regra de recorrência", onClick = {
                    actions.defineRecurrence()
                    open = true
                })
                Hint("Não se repete")
            } else {
                RuleBlock(
                    summary = newSeriesSummary(rule, draft, TimeZone.getDefault().id, schedule),
                    meta = newSeriesMeta(rule, schedule),
                    open = open,
                    onToggle = { open = !open },
                )
                if (open) {
                    RuleEditor(rule, recurrence, actions)
                    Hint(if (creating) NEW_SERIES_HINT else JOINING_HINT)
                    TextButton(onClick = {
                        actions.clearRecurrence()
                        open = false
                    }) { Text("Não repetir") }
                }
                RuleError(recurrence, RecurrenceField.StartDate)
                RuleError(recurrence, RecurrenceField.StartTime)
            }
        }
        return
    }
    EditRow("Recorrência") {
        when (val series = recurrence.series) {
            SeriesLoad.None, SeriesLoad.Loading -> Hint("Carregando recorrência…", live = true)
            SeriesLoad.Gone -> Hint(SERIES_GONE_NOTICE)
            SeriesLoad.Failed -> Hint(SERIES_FAILED_NOTICE, live = true, alert = true)
            is SeriesLoad.Ready -> {
                val lines = recurrenceLines(occurrence)
                RuleBlock(summary = lines.rule, meta = lines.detail, open = open, onToggle = { open = !open })
                if (rule != null && open) {
                    RuleEditor(rule, recurrence, actions)
                    Hint(SERIES_HINT)
                    TextButton(onClick = {
                        actions.resetRecurrence()
                        open = false
                    }) { Text("Cancelar troca") }
                }
                DeleteSeries(series.series.id, recurrence, canAsk = !open, onDelete = actions.deleteSeries)
            }
        }
    }
}

@Composable
private fun DeleteSeries(
    seriesId: String,
    recurrence: RecurrenceForm,
    canAsk: Boolean,
    onDelete: () -> Unit,
) {
    var confirming by rememberSaveable(seriesId) { mutableStateOf(false) }
    if (canAsk && !confirming) {
        TextButton(onClick = { confirming = true }) { Text("Apagar a série", color = MaterialTheme.colorScheme.error) }
    }
    if (confirming) {
        Column(
            Modifier.semantics { contentDescription = "Apagar a série" },
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            Text(
                "Apagar a série? Ela deixa de se repetir e não dá para desfazer.",
                color = MaterialTheme.colorScheme.onBackground,
                fontSize = 14.sp,
                lineHeight = 20.sp,
            )
            Row {
                TextButton(onClick = { confirming = false }) { Text("Cancelar") }
                TextButton(
                    enabled = !recurrence.deleting,
                    onClick = {
                        onDelete()
                        confirming = false
                    },
                ) { Text("Sim, apagar a série", color = MaterialTheme.colorScheme.error) }
            }
        }
    }
    if (recurrence.deleteFailed) {
        Text(
            SERIES_DELETE_FAILED_NOTICE,
            modifier = Modifier.semantics { liveRegion = LiveRegionMode.Assertive },
            color = MaterialTheme.colorScheme.error,
            fontSize = 13.sp,
            lineHeight = 18.sp,
        )
    }
}

@Composable
private fun Hint(
    text: String,
    live: Boolean = false,
    alert: Boolean = false,
) {
    Text(
        text,
        modifier = if (live) Modifier.semantics { liveRegion = LiveRegionMode.Polite } else Modifier,
        color = if (alert) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant,
        fontSize = 13.sp,
        lineHeight = 18.sp,
    )
}

@Composable
private fun RuleError(
    recurrence: RecurrenceForm,
    field: RecurrenceField,
) {
    recurrence.errors[field]?.let {
        Text(
            it,
            modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
            color = MaterialTheme.colorScheme.error,
            fontSize = 13.sp,
            lineHeight = 18.sp,
        )
    }
}

/** A pílula da regra, que abre o editor, e embaixo desde quando vale e se tem fim. */
@Composable
private fun RuleBlock(
    summary: String,
    meta: String,
    open: Boolean,
    onToggle: () -> Unit,
) {
    RuleButton(summary, empty = false, description = "Recorrência: $summary. Trocar", expanded = open, onClick = onToggle)
    Hint(meta)
}

@Composable
private fun RuleButton(
    text: String,
    empty: Boolean,
    description: String,
    expanded: Boolean? = null,
    onClick: () -> Unit,
) {
    Row(
        Modifier
            .defaultMinSize(minHeight = 48.dp)
            .border(BorderStroke(1.dp, MaterialTheme.colorScheme.outline), CircleShape)
            .clip(CircleShape)
            .clickable(role = Role.Button, onClick = onClick)
            .padding(horizontal = 16.dp)
            .semantics { contentDescription = description + if (expanded == true) ", aberto" else "" },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        SvgIcon(
            repeatIcon,
            size = 16.dp,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.clearAndSetSemantics {},
        )
        Text(
            text,
            color = if (empty) MaterialTheme.colorScheme.onSurfaceVariant else MaterialTheme.colorScheme.onBackground,
            fontSize = 14.sp,
            lineHeight = 20.sp,
        )
    }
}

/** O editor da regra, o mesmo na criação e na troca da série. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun RuleEditor(
    rule: RecurrenceDraft,
    recurrence: RecurrenceForm,
    actions: TaskEditActions,
) {
    var frequencyOpen by rememberSaveable { mutableStateOf(false) }
    var monthOpen by rememberSaveable { mutableStateOf(false) }
    var endOpen by rememberSaveable { mutableStateOf(false) }
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        EditorField("Frequência") {
            RuleButton(
                text = FREQUENCIES.first { it.first == rule.frequency }.second,
                empty = false,
                description = "Frequência: ${FREQUENCIES.first { it.first == rule.frequency }.second}",
                onClick = { frequencyOpen = true },
            )
        }
        EditorField("Repetir a cada", error = recurrence.errors[RecurrenceField.Interval]) {
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
                NumberField(
                    rule.interval,
                    "Repetir a cada",
                    invalid = RecurrenceField.Interval in recurrence.errors,
                    modifier = Modifier.size(width = 96.dp, height = 48.dp),
                ) { value ->
                    actions.changeRecurrence { it.copy(interval = value) }
                }
                Text(recurrenceUnit(rule.frequency, rule.interval), color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 14.sp)
            }
        }
        if (rule.frequency == RecurrenceFrequency.Weekly) {
            EditorField("Dias da semana", error = recurrence.errors[RecurrenceField.Weekdays]) {
                FlowRow(horizontalArrangement = Arrangement.spacedBy(4.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    WEEKDAYS.forEachIndexed { bit, (letter, name) ->
                        val on = rule.weekdays and (1 shl bit) != 0
                        Box(
                            Modifier
                                .size(44.dp)
                                .clip(CircleShape)
                                .background(
                                    if (on) MaterialTheme.colorScheme.surfaceVariant else androidx.compose.ui.graphics.Color.Transparent,
                                ).border(1.dp, MaterialTheme.colorScheme.outline, CircleShape)
                                .toggleable(value = on, role = Role.Checkbox) {
                                    actions.changeRecurrence { it.copy(weekdays = it.weekdays xor (1 shl bit)) }
                                }.semantics { contentDescription = name },
                            contentAlignment = Alignment.Center,
                        ) {
                            Text(
                                letter,
                                color = MaterialTheme.colorScheme.onBackground,
                                fontSize = 14.sp,
                                fontWeight = if (on) FontWeight.SemiBold else FontWeight.Normal,
                                modifier = Modifier.clearAndSetSemantics {},
                            )
                        }
                    }
                }
            }
        }
        if (rule.frequency == RecurrenceFrequency.Monthly || rule.frequency == RecurrenceFrequency.Yearly) {
            EditorField("Dia do mês", error = recurrence.errors[RecurrenceField.MonthDay]) {
                NumberField(
                    rule.monthDay,
                    "Dia do mês",
                    invalid = RecurrenceField.MonthDay in recurrence.errors,
                    modifier = Modifier.size(width = 96.dp, height = 48.dp),
                ) { value ->
                    actions.changeRecurrence { it.copy(monthDay = value) }
                }
            }
        }
        if (rule.frequency == RecurrenceFrequency.Yearly) {
            EditorField("Mês") {
                RuleButton(
                    text = MONTHS.getOrElse(rule.month - 1) { "" },
                    empty = false,
                    description = "Mês: ${MONTHS.getOrElse(rule.month - 1) { "" }}",
                    onClick = { monthOpen = true },
                )
            }
        }
        EditorField("Termina em", error = recurrence.errors[RecurrenceField.EndsOn]) {
            val endText =
                if (rule.endsOn.isEmpty()) {
                    "Sem fim"
                } else {
                    "${shortDate(
                        rule.endsOn,
                    ).lowercase()} ${rule.endsOn.substringBefore('-')}"
                }
            RuleButton(
                text = endText,
                empty = rule.endsOn.isEmpty(),
                description = "Termina em: ${if (rule.endsOn.isEmpty()) "sem fim" else endText}",
                onClick = { endOpen = true },
            )
        }
        Hint(NO_END_HINT)
    }
    if (frequencyOpen) {
        OptionSheet(
            description = "Frequência",
            options = FREQUENCIES.map { (frequency, label) -> Option(frequency, label, frequency == rule.frequency) },
            onPick = { frequency ->
                frequencyOpen = false
                actions.changeRecurrence { it.copy(frequency = frequency) }
            },
            onDismiss = { frequencyOpen = false },
            leading = {},
        )
    }
    if (monthOpen) {
        OptionSheet(
            description = "Mês",
            options = MONTHS.mapIndexed { index, name -> Option(index + 1, name, index + 1 == rule.month) },
            onPick = { month ->
                monthOpen = false
                actions.changeRecurrence { it.copy(month = month) }
            },
            onDismiss = { monthOpen = false },
            leading = {},
        )
    }
    if (endOpen) {
        DatePickerSheet(
            value = rule.endsOn,
            onPick = { value ->
                endOpen = false
                actions.changeRecurrence { it.copy(endsOn = value) }
            },
            onDismiss = { endOpen = false },
        )
    }
}

@Composable
private fun EditorField(
    label: String,
    error: String? = null,
    content: @Composable () -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(label, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 13.sp, lineHeight = 18.sp)
        content()
        error?.let {
            Text(
                it,
                modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
                color = MaterialTheme.colorScheme.error,
                fontSize = 13.sp,
                lineHeight = 18.sp,
            )
        }
    }
}

/** Um número inteiro: só dígitos; vazio vale 0, que a validação recusa ao salvar. */
@Composable
private fun NumberField(
    value: Int,
    label: String,
    invalid: Boolean,
    modifier: Modifier = Modifier,
    onChange: (Int) -> Unit,
) {
    FormField(
        value = if (value > 0) value.toString() else "",
        onChange = { text -> onChange(text.filter(Char::isDigit).take(MAX_DIGITS).toIntOrNull() ?: 0) },
        label = label,
        modifier = modifier,
        invalid = invalid,
        singleLine = true,
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
    )
}

private const val MAX_DIGITS = 4

/** A unidade ao lado do intervalo: "dia", "semanas", "mês"… */
internal fun recurrenceUnit(
    frequency: RecurrenceFrequency,
    interval: Int,
): String {
    val plural = interval != 1
    return when (frequency) {
        RecurrenceFrequency.Daily -> if (plural) "dias" else "dia"
        RecurrenceFrequency.Weekly -> if (plural) "semanas" else "semana"
        RecurrenceFrequency.Monthly -> if (plural) "meses" else "mês"
        RecurrenceFrequency.Yearly -> if (plural) "anos" else "ano"
    }
}
