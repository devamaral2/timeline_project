package app.braid.mobile.domain.task

import app.braid.mobile.domain.timeline.shiftDayKey
import app.braid.mobile.domain.timeline.shortDate
import java.time.LocalDate
import kotlin.math.roundToInt

/**
 * A regra da série como texto do formulário, o espelho do `RecurrenceDraft` do web (`task-recurrence-draft.ts`). Fica
 * fora do [TaskDraft]: a série é outra chamada, com revisão própria. [weekdays] é a máscara da API (bit 0 = domingo).
 */
data class RecurrenceDraft(
    val frequency: RecurrenceFrequency,
    val interval: Int,
    /** Dias da semana, em máscara. Só vale na frequência semanal. */
    val weekdays: Int,
    /** Dia do mês. Vale na mensal e na anual. */
    val monthDay: Int,
    /** Mês, de 1 a 12. Só vale na anual. */
    val month: Int,
    /** `YYYY-MM-DD`, ou vazio: sem fim. */
    val endsOn: String,
)

/** Os campos da regra que a validação sabe recusar; cada um aparece no controle que o causou. */
enum class RecurrenceField {
    StartDate,
    StartTime,
    Interval,
    Weekdays,
    MonthDay,
    EndsOn,
}

typealias RecurrenceErrors = Map<RecurrenceField, String>

/** Os campos do formulário que a série usa: o início e o fim planejado da tarefa. */
data class RecurrenceSchedule(
    val startDate: String,
    val startTime: String,
    val endDate: String,
    val endTime: String,
)

fun TaskDraft.schedule(): RecurrenceSchedule = RecurrenceSchedule(startDate, startTime, endDate, endTime)

/** A série lida (`GET /api/recurrences/{id}`): a regra e a revisão que o `PATCH` precisa. */
data class RecurrenceSeries(
    val id: String,
    val revision: Int,
    val rule: RecurrenceRule,
)

/** O que cada ocorrência copia (`RecurrenceTemplate`): a tarefa sem as datas, que vêm da regra. */
data class SeriesTemplate(
    val kind: TaskKind,
    val name: String,
    val description: String,
    val priority: TaskPriority,
    val tags: List<String>? = null,
    val notifyOffsetsMinutes: List<Int>? = null,
    /** O projeto da série: cada ocorrência nasce nele. Ausente (ou `personal`), nada vai. */
    val projectId: String? = null,
)

/** O corpo de `POST /api/recurrences`: a regra completa e o modelo. */
data class NewSeries(
    val frequency: RecurrenceFrequency,
    val interval: Int,
    val byWeekday: Int? = null,
    val byMonthDay: Int? = null,
    val byMonth: Int? = null,
    val timeOfDay: String,
    val durationMinutes: Int? = null,
    val timeZone: String,
    val startsOn: String,
    val endsOn: String? = null,
    val template: SeriesTemplate,
) {
    /** A regra que a série terá, para o resumo da tela. */
    val rule: RecurrenceRule
        get() =
            RecurrenceRule(
                frequency = frequency,
                interval = interval,
                byWeekday = byWeekday,
                byMonthDay = byMonthDay,
                byMonth = byMonth,
                timeOfDay = timeOfDay,
                startsOn = startsOn,
                endsOn = endsOn,
            )
}

/** O `PATCH` da série: só a regra que mudou, com a revisão lida. Campo `null` não muda. */
data class SeriesPatch(
    val expectedRevision: Int,
    val frequency: RecurrenceFrequency? = null,
    val interval: Int? = null,
    val byWeekday: Int? = null,
    val byMonthDay: Int? = null,
    val byMonth: Int? = null,
    val endsOn: String? = null,
)

const val START_DATE_MESSAGE = "Informe a data de início: a série começa nela."
const val START_TIME_MESSAGE = "Informe a hora: a série se repete nesse horário."
const val INTERVAL_MESSAGE = "Repita a cada 1 ou mais."
const val WEEKDAY_MESSAGE = "Escolha pelo menos um dia da semana."
const val MONTH_DAY_MESSAGE = "Escolha um dia entre 1 e 31."
const val MONTH_DAY_MISSING_MESSAGE = "Esse dia não existe nesse mês."
const val SERIES_END_BEFORE_START_MESSAGE = "O fim não pode ser antes do início."
const val SERIES_END_CANNOT_CLEAR_MESSAGE = "Uma série não perde o fim depois de criada: a data só muda."

/** Dias de cada mês; fevereiro com 29, porque a série pode cair num ano bissexto. */
private val MAX_DAY_OF_MONTH = listOf(31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31)
private const val ALL_WEEKDAYS = 127
private const val MAX_MONTH_DAY = 31
private const val MILLIS_PER_MINUTE = 60_000.0

/** Rascunho novo, ao tocar em "Definir a regra": a semana e o dia começam no dia de início do formulário. */
fun emptyRecurrenceDraft(startDate: String): RecurrenceDraft {
    val day = runCatching { LocalDate.parse(startDate) }.getOrNull()
    return RecurrenceDraft(
        frequency = RecurrenceFrequency.Weekly,
        interval = 1,
        // `DayOfWeek.value` vai de 1 (segunda) a 7 (domingo); o bit 0 é o domingo.
        weekdays = if (day == null) 0 else 1 shl (day.dayOfWeek.value % DAYS_IN_WEEK),
        monthDay = day?.dayOfMonth ?: 1,
        month = day?.monthValue ?: 1,
        endsOn = "",
    )
}

private const val DAYS_IN_WEEK = 7

/** O rascunho de uma série lida: o que a seção mostra e o que a comparação do Salvar usa de base. */
fun recurrenceDraftFromRule(rule: RecurrenceRule): RecurrenceDraft =
    RecurrenceDraft(
        frequency = rule.frequency,
        interval = rule.interval,
        weekdays = rule.byWeekday ?: 0,
        monthDay = rule.byMonthDay ?: 1,
        month = rule.byMonth ?: 1,
        endsOn = rule.endsOn.orEmpty(),
    )

/** Recusas da própria tela sobre a regra, que valem na criação e na edição. */
fun validateRecurrenceDraft(
    draft: RecurrenceDraft,
    startsOn: String?,
): RecurrenceErrors {
    val errors = linkedMapOf<RecurrenceField, String>()
    if (draft.interval < 1) errors[RecurrenceField.Interval] = INTERVAL_MESSAGE
    if (draft.frequency == RecurrenceFrequency.Weekly && (draft.weekdays < 1 || draft.weekdays > ALL_WEEKDAYS)) {
        errors[RecurrenceField.Weekdays] = WEEKDAY_MESSAGE
    }
    if (draft.frequency == RecurrenceFrequency.Monthly || draft.frequency == RecurrenceFrequency.Yearly) {
        if (draft.monthDay < 1 || draft.monthDay > MAX_MONTH_DAY) {
            errors[RecurrenceField.MonthDay] = MONTH_DAY_MESSAGE
        } else if (draft.frequency == RecurrenceFrequency.Yearly && draft.monthDay > (MAX_DAY_OF_MONTH.getOrNull(draft.month - 1) ?: 0)) {
            errors[RecurrenceField.MonthDay] = MONTH_DAY_MISSING_MESSAGE
        }
    }
    if (draft.endsOn.isNotEmpty() && !startsOn.isNullOrEmpty() && draft.endsOn < startsOn) {
        errors[RecurrenceField.EndsOn] = SERIES_END_BEFORE_START_MESSAGE
    }
    return errors
}

/** Criação: a regra precisa de início e de hora, que vêm do formulário. */
fun validateNewRecurrence(
    draft: RecurrenceDraft,
    schedule: RecurrenceSchedule,
): RecurrenceErrors {
    val errors = LinkedHashMap(validateRecurrenceDraft(draft, schedule.startDate))
    if (schedule.startDate.isEmpty()) errors[RecurrenceField.StartDate] = START_DATE_MESSAGE
    if (schedule.startTime.isEmpty()) errors[RecurrenceField.StartTime] = START_TIME_MESSAGE
    return errors
}

/** Edição da série: a regra já tem início, e não dá para tirar o fim que ela tem. */
fun validateSeriesEdit(
    series: RecurrenceSeries,
    draft: RecurrenceDraft,
): RecurrenceErrors {
    val errors = LinkedHashMap(validateRecurrenceDraft(draft, series.rule.startsOn))
    if (draft.endsOn.isEmpty() && series.rule.endsOn != null) errors[RecurrenceField.EndsOn] = SERIES_END_CANNOT_CLEAR_MESSAGE
    return errors
}

/**
 * O início da série quando ela nasce de uma tarefa que já existe: a tarefa fica como está e é a primeira data, então a
 * série começa no dia seguinte. O fim anda junto com o início, para a duração da série ser a da tarefa. Sem data, nada
 * muda: a validação pede a data.
 */
fun scheduleAfterTask(schedule: RecurrenceSchedule): RecurrenceSchedule {
    if (schedule.startDate.isEmpty()) return schedule
    return schedule.copy(
        startDate = shiftDayKey(schedule.startDate, 1),
        endDate = if (schedule.endDate.isEmpty()) schedule.endDate else shiftDayKey(schedule.endDate, 1),
    )
}

/** A duração do bloco do formulário, em minutos; sem fim, ou sem ser depois do início, não há duração. */
private fun durationOf(schedule: RecurrenceSchedule): Int? {
    val start = instantFromDraft(schedule.startDate, schedule.startTime) ?: return null
    val end = instantFromDraft(schedule.endDate, schedule.endTime) ?: return null
    val minutes = ((end.toEpochMilli() - start.toEpochMilli()) / MILLIS_PER_MINUTE).roundToInt()
    return minutes.takeIf { it > 0 }
}

/**
 * O corpo da criação: a regra com hora e início do formulário, a duração do início ao fim planejado e o fuso do
 * aparelho, mais o modelo da tarefa. Só as chaves que a frequência usa.
 */
fun buildNewSeries(
    draft: RecurrenceDraft,
    form: TaskDraft,
    timeZone: String,
    schedule: RecurrenceSchedule = form.schedule(),
): NewSeries {
    val weekly = draft.frequency == RecurrenceFrequency.Weekly
    val monthly = draft.frequency == RecurrenceFrequency.Monthly || draft.frequency == RecurrenceFrequency.Yearly
    return NewSeries(
        frequency = draft.frequency,
        interval = draft.interval,
        byWeekday = draft.weekdays.takeIf { weekly },
        byMonthDay = draft.monthDay.takeIf { monthly },
        byMonth = draft.month.takeIf { draft.frequency == RecurrenceFrequency.Yearly },
        timeOfDay = schedule.startTime,
        durationMinutes = durationOf(schedule),
        timeZone = timeZone,
        startsOn = schedule.startDate,
        endsOn = draft.endsOn.ifEmpty { null },
        template =
            SeriesTemplate(
                kind = form.kind,
                name = form.name.trim(),
                description = form.description,
                priority = form.priority,
                tags = form.tags.ifEmpty { null },
                notifyOffsetsMinutes = form.reminders.ifEmpty { null },
                projectId = form.project?.takeUnless { it.personal }?.id,
            ),
    )
}

/**
 * O `PATCH` da série com só a regra que mudou em relação à série lida, com a revisão dela; `null` quando nada mudou. Uma
 * troca que a API recusa (semanal para mensal, por exemplo) sai assim mesmo: a recusa volta como mensagem.
 */
fun planSeriesEdit(
    series: RecurrenceSeries,
    draft: RecurrenceDraft,
): SeriesPatch? {
    val rule = series.rule
    val weekly = draft.frequency == RecurrenceFrequency.Weekly
    val monthly = draft.frequency == RecurrenceFrequency.Monthly || draft.frequency == RecurrenceFrequency.Yearly
    val patch =
        SeriesPatch(
            expectedRevision = series.revision,
            frequency = draft.frequency.takeIf { it != rule.frequency },
            interval = draft.interval.takeIf { it != rule.interval },
            byWeekday = draft.weekdays.takeIf { weekly && it != rule.byWeekday },
            byMonthDay = draft.monthDay.takeIf { monthly && it != rule.byMonthDay },
            byMonth = draft.month.takeIf { draft.frequency == RecurrenceFrequency.Yearly && it != rule.byMonth },
            endsOn = draft.endsOn.takeIf { it.isNotEmpty() && it != rule.endsOn },
        )
    return patch.takeUnless { it == SeriesPatch(expectedRevision = series.revision) }
}

/** "desde 21 set · até 31 dez" ou "sem fim": a linha embaixo da regra na criação. */
fun newSeriesMeta(
    draft: RecurrenceDraft,
    schedule: RecurrenceSchedule,
): String {
    val since = if (schedule.startDate.isEmpty()) "sem data de início" else "desde ${shortDate(schedule.startDate).lowercase()}"
    val end = if (draft.endsOn.isEmpty()) "sem fim" else "até ${shortDate(draft.endsOn).lowercase()}"
    return "$since · $end"
}

/** O resumo da regra na criação, quando o formulário já tem início e hora; antes disso, pede os dois. */
fun newSeriesSummary(
    draft: RecurrenceDraft,
    form: TaskDraft,
    timeZone: String,
    schedule: RecurrenceSchedule,
): String {
    if (schedule.startDate.isEmpty() || schedule.startTime.isEmpty()) return "Falta a data e a hora de início"
    return recurrenceRuleLabel(buildNewSeries(draft, form, timeZone, schedule).rule)
}
