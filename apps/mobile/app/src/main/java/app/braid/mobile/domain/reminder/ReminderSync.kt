package app.braid.mobile.domain.reminder

import app.braid.mobile.domain.session.SessionRepository
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

/**
 * Quantos alarmes ficam agendados ao mesmo tempo; o Android limita os de um app (500 em muitos aparelhos) e o cálculo
 * já olha só 31 dias adiante, então 100 deixa folga para os outros alarmes do aparelho.
 */
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
    private val readKeys: ReadKeysStore,
    private val schedule: ReminderScheduleStore,
    private val session: SessionRepository,
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
            saveSchedule(upcoming, keepSaved = !sources.complete, now)
            RefreshOutcome.Refreshed
        }

    /**
     * Reagenda o que a última releitura guardou, sem rede: o sistema apaga os alarmes quando o aparelho reinicia, e a
     * rede pode não estar de volta. O que venceu enquanto o aparelho esteve desligado segue a regra do alarme atrasado
     * ([fire]); o que ainda vem volta a ser agendado. Sem sessão, não faz nada.
     */
    suspend fun rescheduleFromSaved() {
        mutex.withLock {
            if (!isSignedIn()) return@withLock
            val now = clock.now()
            val (ahead, past) = schedule.read().partition { it.triggerAt.isAfter(now) }
            for (reminder in past) settleAndShow(reminder, now)
            val exact = alarms.canScheduleExact()
            for (reminder in ahead) alarms.schedule(reminder, exact)
        }
    }

    /** O alarme de [reminder] chegou: vale se a tarefa ainda não começou e a hora passou há no máximo 1 h; nunca duas vezes. */
    suspend fun fire(reminder: Reminder) {
        mutex.withLock {
            // Um alarme que sobrou de uma conta que saiu não mostra nada: a notificação seria de outra pessoa.
            if (isSignedIn()) settleAndShow(reminder, clock.now())
            alarms.cancel(reminder.key)
        }
    }

    /** A releitura de fundo ([BackgroundRefresh]): o processo pode ter acordado só por ela, e sem sessão não lê nada (`null`). */
    suspend fun refreshWhenSignedIn(): RefreshOutcome? = if (isSignedIn()) refresh() else null

    /** Sair da conta: nenhum alarme dela deve disparar, e o que o aparelho guardou (disparados, lidos, cronograma) não vale para a próxima. */
    suspend fun clear() {
        mutex.withLock {
            for (key in alarms.scheduledKeys()) alarms.cancel(key)
            fired.write(emptyMap())
            readKeys.write(emptyMap())
            schedule.write(emptyList())
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

    /** Relê enquanto há sessão; sessão ainda desconhecida ou ausente não lê nada. Para quando a tela sai de vista. */
    suspend fun keepFreshWhileSignedIn(
        session: Flow<SessionState>,
        changes: Flow<Unit>,
        ticks: Flow<Unit> = every(REFRESH_INTERVAL),
    ) {
        session
            .filter { it !is SessionState.Unknown }
            .map { it is SessionState.SignedIn }
            .distinctUntilChanged()
            .collectLatest { signedIn -> if (signedIn) keepFresh(ticks, changes) }
    }

    /**
     * Cancela os alarmes (e apaga o que o aparelho guardou) quando a sessão acaba. Roda enquanto o processo viver, não
     * só com a tela à vista: a sessão pode cair com o app parado, e o alarme de quem saiu não pode tocar.
     */
    suspend fun clearWhenSignedOut(session: Flow<SessionState>) {
        session
            .filter { it !is SessionState.Unknown }
            .map { it is SessionState.SignedIn }
            .distinctUntilChanged()
            .filter { !it }
            .collect { clear() }
    }

    /** Liga a releitura de fundo enquanto há sessão e a desliga quando ela acaba; roda enquanto o processo viver. */
    suspend fun keepBackgroundRefreshWithSession(
        session: Flow<SessionState>,
        background: BackgroundRefresh,
    ) {
        session
            .filter { it !is SessionState.Unknown }
            .map { it is SessionState.SignedIn }
            .distinctUntilChanged()
            .collect { signedIn -> if (signedIn) background.start() else background.stop() }
    }

    /** O processo pode ter acordado só pelo alarme: a sessão guardada é lida antes de decidir. */
    private suspend fun isSignedIn(): Boolean {
        if (session.state.value is SessionState.Unknown) session.restore()
        return session.state.value is SessionState.SignedIn
    }

    /** Marca [reminder] como tratado e, se ainda vale, mostra; nunca duas vezes. */
    private suspend fun settleAndShow(
        reminder: Reminder,
        now: Instant,
    ) {
        val record = fired.read()
        if (reminder.key in record) return
        fired.write(settle(record, listOf(reminder), now))
        if (isStillRelevant(reminder, now)) attempt { notifier.show(reminder) }
    }

    /**
     * Guarda o que foi agendado. Com uma das listas fora do ar ([keepSaved]), o que já estava guardado e ainda vem
     * continua valendo, como os alarmes que `replaceAlarms` não cancela.
     */
    private suspend fun saveSchedule(
        upcoming: List<Reminder>,
        keepSaved: Boolean,
        now: Instant,
    ) {
        val kept =
            if (keepSaved) {
                val current = upcoming.map { it.key }.toSet()
                schedule.read().filter { it.key !in current && it.triggerAt.isAfter(now) }
            } else {
                emptyList()
            }
        schedule.write(upcoming + kept)
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
