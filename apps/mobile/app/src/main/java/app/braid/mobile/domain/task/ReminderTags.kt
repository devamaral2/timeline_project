package app.braid.mobile.domain.task

import java.util.Locale

/**
 * Lembretes e tags do formulário, como listas puras (`task-reminders-tags.ts` no web). O lembrete é um número de
 * minutos antes da tarefa (a API aceita de 1 a 43 200, que são 30 dias); a tag é o texto como a API a guarda: sem
 * espaços nas pontas e em minúsculas.
 */
private const val MINUTES_IN_A_DAY = 1440
const val REMINDER_MIN_MINUTES = 1
const val REMINDER_MAX_MINUTES = 43_200
const val REMINDER_RANGE_MESSAGE = "Use de 1 minuto a 30 dias."

enum class ReminderUnit { Minutes, Days }

/** Os minutos de um lembrete digitado em minutos ou dias; `null` se não for inteiro ou cair fora de 1 minuto a 30 dias. */
fun reminderMinutes(
    amount: Double,
    unit: ReminderUnit,
): Int? {
    if (amount % 1.0 != 0.0) return null
    val minutes = if (unit == ReminderUnit.Days) amount * MINUTES_IN_A_DAY else amount
    return if (minutes >= REMINDER_MIN_MINUTES && minutes <= REMINDER_MAX_MINUTES) minutes.toInt() else null
}

/** A lista em ordem crescente. */
fun sortReminders(reminders: List<Int>): List<Int> = reminders.sorted()

/** A lista em ordem crescente, sem repetir. */
fun addReminder(
    reminders: List<Int>,
    minutes: Int,
): List<Int> = sortReminders(if (minutes in reminders) reminders else reminders + minutes)

fun removeReminder(
    reminders: List<Int>,
    minutes: Int,
): List<Int> = reminders.filter { it != minutes }

private val TAG_LOCALE = Locale.ROOT

/** A tag como a API a guarda: sem espaços nas pontas e em minúsculas. Vazia quando sobra só espaço. */
fun normalizeTag(raw: String): String = raw.trim().lowercase(TAG_LOCALE)

/** Acrescenta a tag normalizada, se ainda não estiver na lista e não for vazia. */
fun addTag(
    tags: List<String>,
    raw: String,
): List<String> {
    val name = normalizeTag(raw)
    return if (name.isEmpty() || name in tags) tags else tags + name
}

fun removeTag(
    tags: List<String>,
    tag: String,
): List<String> = tags.filter { it != tag }
