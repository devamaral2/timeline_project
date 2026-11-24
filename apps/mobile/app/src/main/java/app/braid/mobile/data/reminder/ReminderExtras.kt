package app.braid.mobile.data.reminder

import android.content.Context
import android.content.Intent
import app.braid.mobile.MainActivity
import app.braid.mobile.domain.reminder.Reminder
import app.braid.mobile.domain.reminder.ReminderKind
import app.braid.mobile.domain.task.TaskKind
import java.time.Instant

/*
 * O lembrete inteiro dentro de um Intent: o alarme dispara com o app fechado e sem rede, então o que a notificação e a
 * tela cheia mostram viaja com ele. O alarme e a tela cheia leem os mesmos extras.
 */

private const val EXTRA_KEY = "key"
private const val EXTRA_KIND = "kind"
private const val EXTRA_TASK_ID = "taskId"
private const val EXTRA_NAME = "name"
private const val EXTRA_OFFSET = "offsetMinutes"
private const val EXTRA_TRIGGER = "triggerAt"
private const val EXTRA_ANCHOR = "anchor"
private const val EXTRA_TASK_KIND = "taskKind"
private const val EXTRA_DEADLINE = "deadline"

internal fun Intent.putReminder(reminder: Reminder): Intent =
    putExtra(EXTRA_KEY, reminder.key)
        .putExtra(EXTRA_KIND, reminder.kind.name)
        .putExtra(EXTRA_TASK_ID, reminder.taskId)
        .putExtra(EXTRA_NAME, reminder.name)
        .putExtra(EXTRA_OFFSET, reminder.offsetMinutes)
        .putExtra(EXTRA_TRIGGER, reminder.triggerAt.toEpochMilli())
        .putExtra(EXTRA_ANCHOR, reminder.anchor.toEpochMilli())
        .putExtra(EXTRA_TASK_KIND, reminder.taskKind.code)
        .putExtra(EXTRA_DEADLINE, reminder.deadline)

/** O lembrete que o Intent leva; `null` se ele não leva um. */
internal fun Intent.reminderOrNull(): Reminder? {
    val key = getStringExtra(EXTRA_KEY) ?: return null
    return Reminder(
        key = key,
        kind = runCatching { ReminderKind.valueOf(getStringExtra(EXTRA_KIND).orEmpty()) }.getOrDefault(ReminderKind.Tracked),
        taskId = getStringExtra(EXTRA_TASK_ID) ?: return null,
        name = getStringExtra(EXTRA_NAME).orEmpty(),
        offsetMinutes = getIntExtra(EXTRA_OFFSET, 0),
        triggerAt = Instant.ofEpochMilli(getLongExtra(EXTRA_TRIGGER, 0)),
        anchor = Instant.ofEpochMilli(getLongExtra(EXTRA_ANCHOR, 0)),
        taskKind = taskKindOf(getStringExtra(EXTRA_TASK_KIND)),
        deadline = getBooleanExtra(EXTRA_DEADLINE, false),
    )
}

/** O tipo pelo código guardado; um código que esta versão não conhece vale tarefa comum, nunca uma falha. */
internal fun taskKindOf(code: String?): TaskKind = TaskKind.entries.firstOrNull { it.code == code } ?: TaskKind.Common

/** Abre o app no detalhe da tarefa do lembrete: o toque na notificação e o "Abrir tarefa" da tela cheia. */
internal fun taskDetailIntent(
    context: Context,
    reminder: Reminder,
): Intent =
    Intent(context, MainActivity::class.java)
        .setData(reminderUri(reminder.key))
        .putExtra(MainActivity.EXTRA_TASK_ID, reminder.taskId)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
