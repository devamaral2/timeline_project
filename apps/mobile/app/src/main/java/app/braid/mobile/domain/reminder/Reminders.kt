package app.braid.mobile.domain.reminder

import app.braid.mobile.domain.task.TaskCard
import app.braid.mobile.domain.task.TaskStatus
import app.braid.mobile.domain.timeline.toIsoMillis
import java.time.Duration
import java.time.Instant

/*
 * Port de `apps/web/src/lib/notifications/due-notifications.ts`, conferido contra fixtures geradas pelas funções TS
 * (`ReminderFixturesTest`). Só cálculo: não conhece alarme, notificação nem armazenamento, para que o feed do chat
 * (ticket 23) derive dos mesmos [Reminder].
 */

/** Quanto tempo depois do horário do lembrete ele ainda vale a pena; passado isso, só se marca como visto. */
val CATCH_UP_WINDOW: Duration = Duration.ofHours(1)

/** Quanto tempo uma chave disparada fica guardada depois do instante de referência da tarefa. */
val FIRED_RETENTION: Duration = Duration.ofHours(24)

/** Até onde a fonte olha para a frente: o maior lembrete possível é de 30 dias. */
val LOOK_AHEAD: Duration = Duration.ofDays(31)

/** Até onde a fonte olha para trás: o que venceu nas últimas 24 horas aparece no feed. */
val LOOK_BEHIND: Duration = Duration.ofHours(24)

/** Tarefa acompanhada (tem status ou é longa) ou tarefa de referência; só muda o texto do feed. */
enum class ReminderKind { Tracked, Reference }

/** Um lembrete de uma tarefa: o deslocamento [offsetMinutes] antes da [anchor]. */
data class Reminder(
    /** O que impede de disparar duas vezes: `<id>:<âncora>:<deslocamento>`; remarcar a tarefa muda a chave. */
    val key: String,
    val kind: ReminderKind,
    val taskId: String,
    val name: String,
    val offsetMinutes: Int,
    val triggerAt: Instant,
    /** O início da tarefa, ou o prazo na tarefa longa. */
    val anchor: Instant,
)

/** O que já cruzou o horário: [due] se mostra, [settled] nunca mais se reavalia (mostrado ou não). */
data class DueReminders(
    val due: List<Reminder>,
    val settled: List<Reminder>,
)

/** O instante de que o lembrete conta; `null` sem data, sem prazo (tarefa longa) ou com a tarefa concluída ou cancelada. */
fun reminderAnchorOf(card: TaskCard): Instant? {
    if (card.status == TaskStatus.Done || card.status == TaskStatus.Cancel) return null
    return if (card.longRunning) card.estimatedFinishAt else card.startedAt
}

fun reminderKeyOf(
    card: TaskCard,
    offsetMinutes: Int,
): String = "${card.id}:${reminderAnchorOf(card)?.let(::toIsoMillis).orEmpty()}:$offsetMinutes"

fun reminderKindOf(card: TaskCard): ReminderKind =
    if (card.status != null ||
        card.longRunning
    ) {
        ReminderKind.Tracked
    } else {
        ReminderKind.Reference
    }

/** "1 dia antes", "3 dias antes", "1 minuto antes", "90 minutos antes". */
fun offsetLabel(minutes: Int): String {
    if (minutes % MINUTES_PER_DAY == 0) {
        val days = minutes / MINUTES_PER_DAY
        return "$days ${if (days == 1) "dia" else "dias"} antes"
    }
    return "$minutes ${if (minutes == 1) "minuto" else "minutos"} antes"
}

/** Todo par (tarefa, deslocamento) das tarefas com âncora, na ordem das tarefas e dos deslocamentos. */
fun remindersOf(cards: Collection<TaskCard>): List<Reminder> =
    cards.flatMap { card ->
        val anchor = reminderAnchorOf(card) ?: return@flatMap emptyList()
        card.notifyOffsetsMinutes.map { offset ->
            Reminder(
                key = reminderKeyOf(card, offset),
                kind = reminderKindOf(card),
                taskId = card.id,
                name = card.name,
                offsetMinutes = offset,
                triggerAt = anchor.minusSeconds(offset * SECONDS_PER_MINUTE),
                anchor = anchor,
            )
        }
    }

/** Se o lembrete, no instante [now], ainda vale ser mostrado: a tarefa não começou e o horário está dentro da janela. */
fun isStillRelevant(
    reminder: Reminder,
    now: Instant,
): Boolean = now.isBefore(reminder.anchor) && Duration.between(reminder.triggerAt, now) <= CATCH_UP_WINDOW

/** Separa o que já cruzou o horário (e não foi disparado) do que ainda vai cruzar. */
fun dueRemindersOf(
    cards: Collection<TaskCard>,
    now: Instant,
    firedKeys: Set<String>,
): DueReminders {
    val crossed = remindersOf(cards).filter { it.key !in firedKeys && !now.isBefore(it.triggerAt) }
    return DueReminders(due = crossed.filter { isStillRelevant(it, now) }, settled = crossed)
}

/** Os lembretes que ainda vão cruzar o horário, do mais próximo ao mais distante. */
fun upcomingRemindersOf(
    cards: Collection<TaskCard>,
    now: Instant,
    firedKeys: Set<String>,
): List<Reminder> =
    remindersOf(cards)
        .filter { it.key !in firedKeys && now.isBefore(it.triggerAt) }
        .sortedBy { it.triggerAt }

private const val MINUTES_PER_DAY = 1440
private const val SECONDS_PER_MINUTE = 60L
