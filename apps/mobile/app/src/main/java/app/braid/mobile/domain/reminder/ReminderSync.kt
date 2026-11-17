package app.braid.mobile.domain.reminder

import app.braid.mobile.domain.session.SessionState
import app.braid.mobile.domain.task.TaskRepository
import app.braid.mobile.domain.time.AppClock
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.filter
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.merge
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import java.time.Duration
import java.time.Instant

/** De quanto em quanto tempo a fonte dos lembretes é relida com o app aberto. */
val REFRESH_INTERVAL: Duration = Duration.ofMinutes(5)

/** Quantos alarmes ficam agendados ao mesmo tempo; o Android limita os de um app (500 em muitos aparelhos). */
const val MAX_SCHEDULED_ALARMS = 100

sealed interface RefreshOutcome {
    data object Refreshed : RefreshOutcome

    /** Nenhuma das duas listas respondeu: nada mudou, nem os alarmes já agendados. */
    data object Failed : RefreshOutcome
}

/**
 * Lê a fonte dos lembretes (a agenda das últimas 24 h aos próximos 31 dias e a lista de acompanhadas), mostra o que
 * venceu, agenda o que vem e marca o que já foi tratado, uma vez só. Tudo o que toca o sistema Android passa pelas
 * interfaces de [ReminderPorts.kt]; o cálculo é o de [Reminders.kt].
 */
class ReminderSync(
    private val tasks: TaskRepository,
    private val alarms: ReminderAlarms,
    private val notifier: ReminderNotifier,
    private val fired: FiredKeysStore,
    private val clock: AppClock,
    private val maxScheduled: Int = MAX_SCHEDULED_ALARMS,
) {
    /** Uma operação por vez: o alarme que dispara e a releitura não podem mostrar o mesmo lembrete duas vezes. */
    private val mutex = Mutex()

    suspend fun refresh(): RefreshOutcome =
        mutex.withLock {
            val now = clock.now()
            val sources = loadReminderSources(tasks, now) ?: return@withLock RefreshOutcome.Failed
            val cards = sources.cards

            val record = fired.read()
            val result = dueRemindersOf(cards, now, record.keys)
            val settledRecord = settle(record, result.settled, now)
            if (settledRecord != record) fired.write(settledRecord)
            for (reminder in result.due) attempt { notifier.show(reminder) }

            val upcoming = upcomingRemindersOf(cards, now, settledRecord.keys).take(maxScheduled)
            replaceAlarms(upcoming, cancelMissing = sources.complete)
            RefreshOutcome.Refreshed
        }

    /** O alarme de [reminder] chegou: vale se a tarefa ainda não começou e a hora passou há no máximo 1 h; nunca duas vezes. */
    suspend fun fire(reminder: Reminder) {
        mutex.withLock {
            val now = clock.now()
            val record = fired.read()
            if (reminder.key !in record) {
                fired.write(settle(record, listOf(reminder), now))
                if (isStillRelevant(reminder, now)) attempt { notifier.show(reminder) }
            }
            alarms.cancel(reminder.key)
        }
    }

    /** Sair da conta: nenhum alarme dela deve disparar, e as chaves não valem para a próxima. */
    suspend fun clear() {
        mutex.withLock {
            for (key in alarms.scheduledKeys()) alarms.cancel(key)
            fired.write(emptyMap())
        }
    }

    /** Relê agora, a cada [ticks] e a cada [changes] (uma tarefa mudou). Só termina quando cancelada. */
    suspend fun keepFresh(
        ticks: Flow<Unit> = every(REFRESH_INTERVAL),
        changes: Flow<Unit>,
    ) {
        refresh()
        merge(ticks, changes).collect { refresh() }
    }

    /** Relê enquanto há sessão e cancela os alarmes quando ela acaba; sessão ainda desconhecida não faz nada. */
    suspend fun runWhileSignedIn(
        session: Flow<SessionState>,
        changes: Flow<Unit>,
        ticks: Flow<Unit> = every(REFRESH_INTERVAL),
    ) {
        session
            .filter { it !is SessionState.Unknown }
            .map { it is SessionState.SignedIn }
            .distinctUntilChanged()
            .collectLatest { signedIn -> if (signedIn) keepFresh(ticks, changes) else clear() }
    }

    private suspend fun replaceAlarms(
        upcoming: List<Reminder>,
        cancelMissing: Boolean,
    ) {
        if (cancelMissing) {
            val wanted = upcoming.map { it.key }.toSet()
            for (key in alarms.scheduledKeys() - wanted) alarms.cancel(key)
        }
        val exact = alarms.canScheduleExact()
        for (reminder in upcoming) alarms.schedule(reminder, exact)
    }

    private fun settle(
        record: Map<String, Instant>,
        settled: List<Reminder>,
        now: Instant,
    ): Map<String, Instant> = if (settled.isEmpty()) record else pruneFired(record + settled.associate { it.key to it.anchor }, now)
}

/** Esquece as chaves de tarefas cujo instante de referência passou há mais de um dia. */
fun pruneFired(
    record: Map<String, Instant>,
    now: Instant,
): Map<String, Instant> = record.filterValues { !it.isBefore(now.minus(FIRED_RETENTION)) }

private fun every(interval: Duration): Flow<Unit> =
    flow {
        while (true) {
            delay(interval.toMillis())
            emit(Unit)
        }
    }
