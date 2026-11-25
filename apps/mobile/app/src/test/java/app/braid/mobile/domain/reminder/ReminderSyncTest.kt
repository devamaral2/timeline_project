package app.braid.mobile.domain.reminder

import app.braid.mobile.data.session.StoredSession
import app.braid.mobile.data.tasks.DefaultTaskRepository
import app.braid.mobile.data.tasks.TasksApi
import app.braid.mobile.domain.session.SessionState
import app.braid.mobile.domain.session.SessionUser
import app.braid.mobile.domain.task.TaskChanges
import app.braid.mobile.support.FakeBackgroundRefresh
import app.braid.mobile.support.FakeReminderAlarms
import app.braid.mobile.support.FakeReminderNotifier
import app.braid.mobile.support.InMemorySessionStorage
import app.braid.mobile.support.MutableClock
import app.braid.mobile.support.TestBackend
import app.braid.mobile.support.TestBackend.Companion.fixture
import app.braid.mobile.support.TestBackend.Companion.status
import app.braid.mobile.support.TestGraph
import app.braid.mobile.support.TestReminderStores
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import okhttp3.mockwebserver.MockResponse
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.time.Instant

/**
 * Os lembretes pela rede: a fonte (agenda e acompanhadas) vem do `MockWebServer` com fixtures geradas dos contratos; só
 * o relógio, o AlarmManager, a notificação e o armazenamento das chaves são trocados.
 *
 * As tarefas da fixture, às 12:00 em São Paulo (15:00Z) de 14/09/2026: a reunião às 18:00Z (avisos de 1440, 60, 30 e 5
 * min), a entrega longa com prazo em 16/09 12:00Z (2880 e 60), e o condomínio, tarefa de referência, em 15/09 13:00Z
 * (15 min).
 */
class ReminderSyncTest {
    private val start = Instant.parse("2026-09-14T15:00:00.000Z")
    private val clock = MutableClock(start)
    private val alarms = FakeReminderAlarms()
    private val notifier = FakeReminderNotifier()

    @get:Rule
    val folder = TemporaryFolder()

    private lateinit var stores: TestReminderStores
    private val fired get() = stores.fired
    private val signedIn = StoredSession("access", "refresh", "user-1", "r@example.com", "Rafael")
    private lateinit var backend: TestBackend
    private lateinit var sync: ReminderSync

    @Before
    fun setUp() {
        stores = TestReminderStores(folder.root.resolve("reminders.preferences_pb"))
        backend = TestBackend()
        backend.route("GET", "/api/tasks", fixture("notifications-agenda-page"))
        backend.route("GET", "/api/tasks/tracked", fixture("notifications-tracked"))
        sync = newSync()
    }

    @After
    fun tearDown() {
        backend.close()
        runBlocking { stores.close() }
    }

    /** Um [ReminderSync] sobre a mesma rede e os mesmos armazenamentos; [session] é o que o armazenamento cifrado guardou. */
    private fun newSync(
        changes: TaskChanges = TaskChanges(),
        session: StoredSession? = signedIn,
        maxScheduled: Int = MAX_SCHEDULED_ALARMS,
    ): ReminderSync {
        val graph = TestGraph(backend, InMemorySessionStorage(session))
        val api = graph.apis.create(TasksApi::class.java)
        return ReminderSync(
            DefaultTaskRepository(api, changes),
            alarms,
            notifier,
            fired,
            stores.readKeys,
            stores.schedule,
            graph.sessionRepository,
            clock,
            maxScheduled,
        )
    }

    private fun keyOf(
        id: String,
        anchor: String,
        offset: Int,
    ) = "$id:$anchor:$offset"

    private val meeting = "2026-09-14T18:00:00.000Z"

    @Test
    fun `it reads the agenda from 24 hours ago to 31 days ahead and the tracked list`() =
        runBlocking {
            sync.refresh()

            val agenda = backend.requestsTo("GET", "/api/tasks").single().requestUrl!!
            assertEquals("2026-09-13T15:00:00.000Z", agenda.queryParameter("from"))
            assertEquals("2026-10-15T15:00:00.000Z", agenda.queryParameter("to"))
            assertEquals(null, agenda.queryParameter("actor"))
            assertEquals(1, backend.requestsTo("GET", "/api/tasks/tracked").size)
        }

    @Test
    fun `every future reminder gets an exact alarm at its time, nearest first, and a task on both lists counts once`() =
        runBlocking {
            sync.refresh()

            assertEquals(
                listOf(
                    keyOf("meeting", meeting, 60) to Instant.parse("2026-09-14T17:00:00Z"),
                    keyOf("meeting", meeting, 30) to Instant.parse("2026-09-14T17:30:00Z"),
                    keyOf("meeting", meeting, 5) to Instant.parse("2026-09-14T17:55:00Z"),
                    keyOf("bill", "2026-09-15T13:00:00.000Z", 15) to Instant.parse("2026-09-15T12:45:00Z"),
                    keyOf("project", "2026-09-16T12:00:00.000Z", 60) to Instant.parse("2026-09-16T11:00:00Z"),
                ),
                alarms.scheduled.values
                    .map { it.reminder.key to it.reminder.triggerAt }
                    .sortedBy { it.second },
            )
            assertTrue(alarms.scheduled.values.all { it.exact })
            assertEquals(emptyList<Reminder>(), notifier.shown)
        }

    @Test
    fun `without the exact alarm permission the alarms fall back to inexact ones`() =
        runBlocking {
            alarms.exactAllowed = false

            sync.refresh()

            assertEquals(5, alarms.scheduled.size)
            assertTrue(alarms.scheduled.values.none { it.exact })
        }

    @Test
    fun `only the nearest alarms are scheduled when there are too many`() =
        runBlocking {
            val capped = newSync(maxScheduled = 2)

            capped.refresh()

            assertEquals(
                setOf(keyOf("meeting", meeting, 60), keyOf("meeting", meeting, 30)),
                alarms.scheduled.keys,
            )
        }

    @Test
    fun `a reminder past its time but inside the hour shows once, and the older ones are settled without showing`() =
        runBlocking {
            // 17:20Z: o aviso de 60 min (17:00Z) tem 20 min, o de 1440 min (13/09) e o de 2880 min (14/09 12:00Z) são antigos.
            clock.current = Instant.parse("2026-09-14T17:20:00.000Z")

            sync.refresh()

            assertEquals(listOf(keyOf("meeting", meeting, 60)), notifier.shown.map { it.key })
            assertEquals(
                setOf(
                    keyOf("meeting", meeting, 1440),
                    keyOf("meeting", meeting, 60),
                    keyOf("project", "2026-09-16T12:00:00.000Z", 2880),
                ),
                fired.read().keys,
            )

            // Ler de novo, ou reabrir o app, não mostra nada outra vez.
            sync.refresh()
            newSync().refresh()
            assertEquals(1, notifier.shown.size)
        }

    @Test
    fun `a refresh a second before the task starts shows the reminders that crossed inside the hour`() =
        runBlocking {
            // O de 60 min venceu às 17:00Z (59 min 59 s atrás); a tarefa começa às 18:00Z.
            clock.current = Instant.parse("2026-09-14T17:59:59.000Z")
            sync.refresh()
            assertEquals(
                setOf(keyOf("meeting", meeting, 60), keyOf("meeting", meeting, 30), keyOf("meeting", meeting, 5)),
                notifier.shown.map { it.key }.toSet(),
            )
        }

    @Test
    fun `a task that already started is settled silently even inside the hour`() =
        runBlocking {
            clock.current = Instant.parse("2026-09-14T18:00:00.000Z")

            sync.refresh()

            assertEquals(emptyList<Reminder>(), notifier.shown)
            assertTrue(keyOf("meeting", meeting, 5) in fired.read())
        }

    @Test
    fun `an alarm delivered late still shows while the task has not started, and is dropped otherwise`() =
        runBlocking {
            sync.refresh()
            val byOffset =
                alarms.scheduled.values
                    .map { it.reminder }
                    .associateBy { it.key }

            // O de 60 min (17:00Z) chega 59 min depois: ainda vale. O de 5 min (17:55Z) chega 6 min depois, às 18:01Z: a tarefa já começou.
            clock.current = Instant.parse("2026-09-14T17:59:00.000Z")
            sync.fire(byOffset.getValue(keyOf("meeting", meeting, 60)))
            clock.current = Instant.parse("2026-09-14T18:01:00.000Z")
            sync.fire(byOffset.getValue(keyOf("meeting", meeting, 5)))

            assertEquals(listOf(keyOf("meeting", meeting, 60)), notifier.shown.map { it.key })
            assertTrue(keyOf("meeting", meeting, 5) in fired.read())
        }

    @Test
    fun `an alarm delivered more than an hour after its time is dropped even if the task has not started`() =
        runBlocking {
            // O aviso de 1 dia antes da reunião: horário 13/09 18:00Z, a tarefa só começa no dia seguinte.
            val dayBefore =
                Reminder(
                    key = keyOf("meeting", meeting, 1440),
                    kind = ReminderKind.Tracked,
                    taskId = "meeting",
                    name = "Reunião de planejamento",
                    offsetMinutes = 1440,
                    triggerAt = Instant.parse("2026-09-13T18:00:00.000Z"),
                    anchor = Instant.parse(meeting),
                )

            clock.current = Instant.parse("2026-09-13T19:00:01.000Z")
            sync.fire(dayBefore)
            assertEquals(emptyList<Reminder>(), notifier.shown)
            assertTrue(dayBefore.key in fired.read())

            // Um minuto antes do fim da janela o mesmo aviso ainda aparece (chave nova, para não herdar o "já visto").
            val again = dayBefore.copy(key = "${dayBefore.key}-b")
            clock.current = Instant.parse("2026-09-13T19:00:00.000Z")
            sync.fire(again)
            assertEquals(listOf(again.key), notifier.shown.map { it.key })
        }

    @Test
    fun `an alarm that fires twice shows once`() =
        runBlocking {
            sync.refresh()
            val thirty = alarms.scheduled.getValue(keyOf("meeting", meeting, 30)).reminder
            clock.current = Instant.parse("2026-09-14T17:30:05.000Z")

            sync.fire(thirty)
            sync.fire(thirty)

            assertEquals(1, notifier.shown.size)
        }

    @Test
    fun `a fired alarm is no longer scheduled when the sources are read again`() =
        runBlocking {
            sync.refresh()
            val thirty = alarms.scheduled.getValue(keyOf("meeting", meeting, 30)).reminder
            clock.current = Instant.parse("2026-09-14T17:30:05.000Z")
            sync.fire(thirty)

            sync.refresh()

            assertTrue(keyOf("meeting", meeting, 30) !in alarms.scheduled)
            assertEquals(1, notifier.shown.count { it.key == keyOf("meeting", meeting, 30) })
        }

    @Test
    fun `when the agenda changes the alarms are rescheduled and the moved task fires again`() =
        runBlocking {
            sync.refresh()
            // A reunião foi remarcada para as 19:00Z e a tarefa do condomínio saiu da agenda.
            backend.route("GET", "/api/tasks", fixture("notifications-agenda-rescheduled"))

            sync.refresh()

            assertTrue(keyOf("meeting", meeting, 60) !in alarms.scheduled)
            assertTrue(keyOf("meeting", "2026-09-14T19:00:00.000Z", 60) in alarms.scheduled)
            assertEquals(
                Instant.parse("2026-09-14T18:00:00Z"),
                alarms.scheduled
                    .getValue(keyOf("meeting", "2026-09-14T19:00:00.000Z", 60))
                    .reminder.triggerAt,
            )
            assertTrue(keyOf("bill", "2026-09-15T13:00:00.000Z", 15) !in alarms.scheduled)
            assertTrue(keyOf("meeting", meeting, 60) in alarms.cancelled)
        }

    @Test
    fun `when the sources cannot be read the alarms already scheduled stay`() =
        runBlocking {
            sync.refresh()
            val before = alarms.scheduled.keys.toSet()
            backend.route("GET", "/api/tasks") { status(500) }
            backend.route("GET", "/api/tasks/tracked") { status(500) }

            val outcome = sync.refresh()

            assertEquals(RefreshOutcome.Failed, outcome)
            assertEquals(before, alarms.scheduled.keys)
        }

    @Test
    fun `when only one list fails nothing is cancelled but what was read is scheduled`() =
        runBlocking {
            sync.refresh()
            val before = alarms.scheduled.keys.toSet()
            backend.route("GET", "/api/tasks/tracked") { status(500) }

            sync.refresh()

            assertEquals(before, alarms.scheduled.keys)
        }

    @Test
    fun `recording what settled forgets the keys whose task anchor is more than a day old`() =
        runBlocking {
            fired.write(
                mapOf(
                    "old:2026-09-12T12:00:00.000Z:5" to Instant.parse("2026-09-12T12:00:00.000Z"),
                    "recent:2026-09-14T00:00:00.000Z:5" to Instant.parse("2026-09-14T00:00:00.000Z"),
                ),
            )
            clock.current = Instant.parse("2026-09-14T17:20:00.000Z")

            sync.refresh()

            assertTrue("old:2026-09-12T12:00:00.000Z:5" !in fired.read())
            assertTrue("recent:2026-09-14T00:00:00.000Z:5" in fired.read())
            assertTrue(keyOf("meeting", meeting, 60) in fired.read())
        }

    @Test
    fun `signing out cancels every alarm`() =
        runBlocking {
            sync.refresh()

            sync.clear()

            assertTrue(alarms.scheduled.isEmpty())
        }

    @Test
    fun `it reads again every tick, on every task change and on start`() =
        runBlocking {
            val ticks = MutableSharedFlow<Unit>()
            val changes = MutableSharedFlow<Unit>()
            val job = CoroutineScope(Dispatchers.Default).launch { sync.keepFresh(ticks, changes) }

            awaitAgendaReads(1)
            ticks.emitWhenCollected()
            awaitAgendaReads(2)
            changes.emitWhenCollected()
            awaitAgendaReads(3)
            job.cancel()
        }

    @Test
    fun `changing a task status through the repository asks for a new read`() =
        runBlocking {
            val changes = TaskChanges()
            backend.route("PATCH", "/api/tasks/meeting", MockResponse().setResponseCode(204))
            val repository = DefaultTaskRepository(TestGraph(backend).apis.create(TasksApi::class.java), changes)
            val seen = MutableStateFlow(0)
            val collector = CoroutineScope(Dispatchers.Default).launch { changes.signals.collect { seen.value += 1 } }
            delay(50)

            repository.changeStatus(
                "meeting",
                app.braid.mobile.domain.task.StatusPatch(
                    1,
                    app.braid.mobile.domain.task.TaskStatus.Doing,
                    app.braid.mobile.domain.task.FinishedAtChange.Unchanged,
                ),
            )

            withTimeout(5_000) { while (seen.value == 0) delay(10) }
            collector.cancel()
        }

    @Test
    fun `reading runs only while signed in`() =
        runBlocking {
            val session = MutableStateFlow<SessionState>(SessionState.Unknown)
            val job =
                CoroutineScope(Dispatchers.Default).launch {
                    sync.keepFreshWhileSignedIn(session, ticks = MutableSharedFlow(), changes = MutableSharedFlow())
                }
            delay(100)
            assertEquals(0, backend.requestsTo("GET", "/api/tasks").size)

            session.value = SessionState.SignedIn(SessionUser("user-1", "Rafael", "r@example.com"))
            awaitAgendaReads(1)
            withTimeout(5_000) { while (alarms.scheduled.size < 5) delay(10) }

            session.value = SessionState.SignedOut
            delay(200)
            // A leitura parou; quem cancela os alarmes é `clearWhenSignedOut`, que não depende de a tela estar à vista.
            assertEquals(5, alarms.scheduled.size)
            job.cancel()
        }

    @Test
    fun `losing the session cancels the alarms and forgets what the device kept, with no screen running`() =
        runBlocking {
            sync.refresh()
            stores.readKeys.write(mapOf("meeting:2026-09-14T18:00:00.000Z:60" to Instant.parse("2026-09-14T18:00:00Z")))
            val session = MutableStateFlow<SessionState>(SessionState.Unknown)
            val job = CoroutineScope(Dispatchers.Default).launch { sync.clearWhenSignedOut(session) }
            delay(100)
            assertEquals(5, alarms.scheduled.size)

            session.value = SessionState.SignedIn(SessionUser("user-1", "Rafael", "r@example.com"))
            delay(100)
            assertEquals(5, alarms.scheduled.size)
            session.value = SessionState.SignedOut

            // A última coisa que `clear` apaga é o cronograma guardado.
            withTimeout(5_000) { while (stores.schedule.read().isNotEmpty()) delay(10) }
            assertTrue(alarms.scheduled.isEmpty())
            assertTrue(fired.read().isEmpty())
            assertTrue(stores.readKeys.read().isEmpty())
            job.cancel()
        }

    @Test
    fun `the background read runs only with a session, which a process woken by it reads first`() =
        runBlocking {
            assertEquals(null, newSync(session = null).refreshWhenSignedIn())
            assertEquals(0, backend.requestsTo("GET", "/api/tasks").size)

            // Processo novo, acordado só pela releitura de fundo: o estado da sessão ainda é "desconhecido".
            assertEquals(RefreshOutcome.Refreshed, newSync().refreshWhenSignedIn())
            assertEquals(1, backend.requestsTo("GET", "/api/tasks").size)
            assertEquals(5, alarms.scheduled.size)
        }

    @Test
    fun `the background read is on while signed in and off once the session ends`() =
        runBlocking {
            val background = FakeBackgroundRefresh()
            val session = MutableStateFlow<SessionState>(SessionState.Unknown)
            val job = CoroutineScope(Dispatchers.Default).launch { sync.keepBackgroundRefreshWithSession(session, background) }
            delay(100)
            assertEquals(emptyList<String>(), background.calls)

            session.value = SessionState.SignedIn(SessionUser("user-1", "Rafael", "r@example.com"))
            withTimeout(5_000) { while (background.calls.isEmpty()) delay(10) }
            session.value = SessionState.SignedOut
            withTimeout(5_000) { while (background.calls.size < 2) delay(10) }

            assertEquals(listOf("start", "stop"), background.calls)
            job.cancel()
        }

    @Test
    fun `signing out also forgets the read keys and the saved schedule`() =
        runBlocking {
            sync.refresh()
            stores.readKeys.write(mapOf("meeting:2026-09-14T18:00:00.000Z:60" to Instant.parse("2026-09-14T18:00:00Z")))

            sync.clear()

            assertTrue(stores.readKeys.read().isEmpty())
            assertTrue(stores.schedule.read().isEmpty())
        }

    @Test
    fun `an alarm that arrives with nobody signed in shows nothing and is dropped`() =
        runBlocking {
            sync.refresh()
            val reminder =
                alarms.scheduled.values
                    .first()
                    .reminder
            val signedOut = newSync(session = null)

            signedOut.fire(reminder)

            assertEquals(emptyList<Reminder>(), notifier.shown)
            assertTrue(reminder.key !in fired.read())
            assertTrue(reminder.key !in alarms.scheduled)
        }

    @Test
    fun `an alarm that wakes the app before the session was read still shows, because the stored session is read first`() =
        runBlocking {
            sync.refresh()
            clock.current = Instant.parse("2026-09-14T17:00:30.000Z")
            val reminder = alarms.scheduled.getValue(keyOf("meeting", meeting, 60)).reminder

            // Processo novo: o estado da sessão ainda é "desconhecido".
            newSync().fire(reminder)

            assertEquals(listOf(reminder.key), notifier.shown.map { it.key })
        }

    @Test
    fun `after a restart the saved schedule is scheduled again without the network`() =
        runBlocking {
            sync.refresh()
            alarms.scheduled.clear() // o sistema apaga os alarmes ao reiniciar
            backend.route("GET", "/api/tasks") { status(503) }
            backend.route("GET", "/api/tasks/tracked") { status(503) }
            val reads = backend.requestsTo("GET", "/api/tasks").size

            newSync().rescheduleFromSaved()

            assertEquals(5, alarms.scheduled.size)
            assertTrue(alarms.scheduled.values.all { it.exact })
            assertEquals(reads, backend.requestsTo("GET", "/api/tasks").size)
        }

    @Test
    fun `a failed read leaves the saved schedule as it was`() =
        runBlocking {
            sync.refresh()
            val saved = stores.schedule.read()
            backend.route("GET", "/api/tasks") { status(503) }
            backend.route("GET", "/api/tasks/tracked") { status(503) }

            sync.refresh()

            assertEquals(saved, stores.schedule.read())
        }

    @Test
    fun `rescheduling after a long power-off shows what came due inside the hour once, and schedules only what is ahead`() =
        runBlocking {
            sync.refresh()
            alarms.scheduled.clear()
            // O aparelho voltou às 17:20Z: o aviso de 60 min (17:00Z) ainda vale; os de 30 e 5 min estão adiante.
            clock.current = Instant.parse("2026-09-14T17:20:00.000Z")

            val restarted = newSync()
            restarted.rescheduleFromSaved()
            restarted.rescheduleFromSaved()

            assertEquals(listOf(keyOf("meeting", meeting, 60)), notifier.shown.map { it.key })
            assertEquals(
                setOf(
                    keyOf("meeting", meeting, 30),
                    keyOf("meeting", meeting, 5),
                    keyOf("bill", "2026-09-15T13:00:00.000Z", 15),
                    keyOf("project", "2026-09-16T12:00:00.000Z", 60),
                ),
                alarms.scheduled.keys,
            )
        }

    @Test
    fun `rescheduling with nobody signed in does nothing`() =
        runBlocking {
            sync.refresh()
            alarms.scheduled.clear()

            newSync(session = null).rescheduleFromSaved()

            assertTrue(alarms.scheduled.isEmpty())
        }

    private suspend fun awaitAgendaReads(count: Int) =
        withTimeout(10_000) {
            while (backend.requestsTo("GET", "/api/tasks").size <
                count
            ) {
                delay(10)
            }
        }

    private suspend fun MutableSharedFlow<Unit>.emitWhenCollected() {
        withTimeout(5_000) { while (subscriptionCount.value == 0) delay(10) }
        emit(Unit)
    }
}
