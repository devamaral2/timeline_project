package app.braid.mobile.domain.timeline

import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.ZoneId
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.time.temporal.ChronoUnit

/*
 * Port de `packages/timeline` (format-date, week, month, task-days). O fuso é o
 * da agenda, America/Sao_Paulo, e nunca o do aparelho. Uma chave de dia é a data
 * civil "YYYY-MM-DD" nesse fuso. Cada função aqui tem a saída conferida contra
 * as fixtures geradas pela função TS de mesmo nome (`TimelineFixturesTest`).
 */

const val TIMELINE_TIME_ZONE = "America/Sao_Paulo"

private val timelineZone: ZoneId = ZoneId.of(TIMELINE_TIME_ZONE)

private val MONTHS_SHORT = listOf("jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez")

private val MONTHS_LONG =
    listOf(
        "janeiro",
        "fevereiro",
        "março",
        "abril",
        "maio",
        "junho",
        "julho",
        "agosto",
        "setembro",
        "outubro",
        "novembro",
        "dezembro",
    )

private val MONTHS_TITLE = MONTHS_LONG.map { it.replaceFirstChar(Char::uppercaseChar) }

private val WEEKDAYS =
    listOf(
        "Domingo",
        "Segunda-feira",
        "Terça-feira",
        "Quarta-feira",
        "Quinta-feira",
        "Sexta-feira",
        "Sábado",
    )

/** Dias de uma semana, de domingo a sábado. */
const val DAYS_IN_WEEK = 7

/** Seis semanas cobrem qualquer mês, inclusive fevereiro começando no sábado. */
const val WEEKS_IN_MONTH_GRID = 6

private val isoMillis: DateTimeFormatter =
    DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'").withZone(ZoneOffset.UTC)

private val clockFormat: DateTimeFormatter = DateTimeFormatter.ofPattern("HH:mm").withZone(timelineZone)

private fun offsetMillisAt(epochMillis: Long): Long = timelineZone.rules.getOffset(Instant.ofEpochMilli(epochMillis)).totalSeconds * 1000L

private fun partsOf(dayKey: String): Triple<Int, Int, Int> {
    val (year, month, day) = dayKey.split("-").map(String::toInt)
    return Triple(year, month, day)
}

/** Data civil (YYYY-MM-DD) do instante no fuso da timeline. */
fun dayKeyOf(instant: Instant): String = instant.atZone(timelineZone).toLocalDate().toString()

/**
 * Meia-noite local de [dayKey] com duas passadas, como o TS: assim um dia cujo
 * offset muda na própria fronteira dá o mesmo instante nos dois lados.
 */
private fun zonedWallClock(
    dayKey: String,
    hour: Int,
    minute: Int,
): Instant {
    val (year, month, day) = partsOf(dayKey)
    val naiveUtc = LocalDateTime.of(year, month, day, hour, minute).toInstant(ZoneOffset.UTC).toEpochMilli()
    val firstGuess = naiveUtc - offsetMillisAt(naiveUtc)
    return Instant.ofEpochMilli(naiveUtc - offsetMillisAt(firstGuess))
}

/** Instante da meia-noite daquele dia civil no fuso da timeline. */
fun zonedDayStart(dayKey: String): Instant = zonedWallClock(dayKey, 0, 0)

/** Instante de uma hora de parede ("HH:MM") naquele dia civil. */
fun zonedTimeAt(
    dayKey: String,
    timeOfDay: String,
): Instant {
    val (hour, minute) = timeOfDay.split(":").map(String::toInt)
    return zonedWallClock(dayKey, hour, minute)
}

/** Último instante representável daquele dia civil. */
fun zonedDayEnd(dayKey: String): Instant = Instant.ofEpochMilli(zonedDayStart(shiftDayKey(dayKey, 1)).toEpochMilli() - 1)

/** Soma (ou subtrai) dias civis a uma chave YYYY-MM-DD. */
fun shiftDayKey(
    dayKey: String,
    days: Int,
): String = LocalDate.parse(dayKey).plusDays(days.toLong()).toString()

/** Hora no formato HH:MM no fuso da timeline. */
fun formatTime(instant: Instant): String = clockFormat.format(instant)

/** O instante como `Date.toISOString()` o escreve, com os milissegundos: é o formato de `from` e `to` da API. */
fun toIsoMillis(instant: Instant): String = isoMillis.format(instant)

/** "19 AGO" */
fun shortDate(dayKey: String): String {
    val (_, month, day) = partsOf(dayKey)
    return "$day ${MONTHS_SHORT[month - 1].uppercase()}"
}

/** "19 de agosto de 2026" */
fun longDate(dayKey: String): String {
    val (year, month, day) = partsOf(dayKey)
    return "$day de ${MONTHS_LONG[month - 1]} de $year"
}

/** "Quarta-feira" */
fun weekday(dayKey: String): String = WEEKDAYS[weekdayIndexOf(dayKey)]

/** "seg, 14 de set": a data curta do atalho "Hoje" (`briefDate` do web, sem os pontos do `Intl`). */
fun briefDate(dayKey: String): String {
    val (_, month, day) = partsOf(dayKey)
    return "${weekday(dayKey).take(3).lowercase()}, $day de ${MONTHS_SHORT[month - 1]}"
}

/** Dia do mês, sem zero à esquerda: "22". */
fun dayNumber(dayKey: String): String = partsOf(dayKey).third.toString()

/** "22 de maio, quinta-feira" */
fun mediumDate(dayKey: String): String {
    val (_, month, day) = partsOf(dayKey)
    return "$day de ${MONTHS_LONG[month - 1]}, ${weekday(dayKey).lowercase()}"
}

/** Título do cabeçalho: os três dias em volta de hoje têm nome próprio, os outros o dia da semana. */
fun relativeDayLabel(
    dayKey: String,
    todayKey: String,
): String =
    when (dayKey) {
        todayKey -> "Hoje"
        shiftDayKey(todayKey, -1) -> "Ontem"
        shiftDayKey(todayKey, 1) -> "Amanhã"
        else -> weekday(dayKey)
    }

/** Índice do dia da semana (0 = domingo) de uma chave; lê a chave como data civil, sem fuso. */
fun weekdayIndexOf(dayKey: String): Int = LocalDate.parse(dayKey).dayOfWeek.value % DAYS_IN_WEEK

/** Quantos dias civis separam [from] de [to]; negativo quando [to] vem antes. */
fun daysBetween(
    from: String,
    to: String,
): Int = ChronoUnit.DAYS.between(LocalDate.parse(from), LocalDate.parse(to)).toInt()

/** As sete chaves da semana que contém [dayKey], de domingo a sábado. */
fun weekOf(dayKey: String): List<String> {
    val sunday = shiftDayKey(dayKey, -weekdayIndexOf(dayKey))
    return List(DAYS_IN_WEEK) { shiftDayKey(sunday, it) }
}

/** [count] chaves seguidas a partir de [startKey], inclusive. */
fun dayKeyRange(
    startKey: String,
    count: Int,
): List<String> = List(maxOf(0, count)) { shiftDayKey(startKey, it) }

/** "Maio de 2026", o título do seletor de data. */
fun monthLabel(dayKey: String): String {
    val (year, month, _) = partsOf(dayKey)
    return "${MONTHS_TITLE[month - 1]} de $year"
}

/** Verdadeiro quando as duas chaves caem no mesmo mês do mesmo ano. */
fun isSameMonth(
    dayKey: String,
    other: String,
): Boolean = dayKey.take(7) == other.take(7)

/** O mesmo dia [delta] meses adiante (ou atrás), preso ao último dia quando o mês de destino é mais curto. */
fun shiftMonthKey(
    dayKey: String,
    delta: Int,
): String {
    val (year, month, day) = partsOf(dayKey)
    val target = LocalDate.of(year, month, 1).plusMonths(delta.toLong())
    return target.withDayOfMonth(minOf(day, target.lengthOfMonth())).toString()
}

private fun firstDayOfMonth(dayKey: String): String {
    val (year, month, _) = partsOf(dayKey)
    return LocalDate.of(year, month, 1).toString()
}

/** Seis semanas de domingo a sábado cobrindo o mês de [dayKey], com as bordas nos dias dos meses vizinhos. */
fun monthGridOf(dayKey: String): List<String> {
    val first = firstDayOfMonth(dayKey)
    val start = shiftDayKey(first, -weekdayIndexOf(first))
    return List(WEEKS_IN_MONTH_GRID * DAYS_IN_WEEK) { shiftDayKey(start, it) }
}

/**
 * Os dias civis em que a tarefa aparece, do dia em que começou ao dia em que
 * termina. Sem fim, ou terminando no mesmo dia, só o dia de início; um fim
 * exatamente à meia-noite ainda pertence ao dia anterior.
 */
fun taskDayKeysOf(
    startedAt: Instant,
    estimatedFinishAt: Instant?,
): List<String> {
    val startKey = dayKeyOf(startedAt)
    if (estimatedFinishAt == null || !(estimatedFinishAt.toEpochMilli() > startedAt.toEpochMilli())) return listOf(startKey)

    val endKey = dayKeyOf(Instant.ofEpochMilli(estimatedFinishAt.toEpochMilli() - 1))
    val keys = mutableListOf(startKey)
    var key = startKey
    while (key < endKey) {
        key = shiftDayKey(key, 1)
        keys += key
    }
    return keys
}
