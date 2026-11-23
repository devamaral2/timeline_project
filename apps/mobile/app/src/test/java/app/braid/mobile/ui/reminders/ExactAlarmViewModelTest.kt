package app.braid.mobile.ui.reminders

import app.braid.mobile.domain.reminder.Reminder
import app.braid.mobile.domain.reminder.ReminderKind
import app.braid.mobile.support.FakeReminderAlarms
import app.braid.mobile.support.TestReminderStores
import app.braid.mobile.support.stopAndJoin
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeout
import org.junit.After
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.time.Instant

/**
 * O aviso que explica a permissão de alarme exato (Android 12+): só aparece quando ela falta e há lembretes guardados
 * para tocar, e some quando o usuário a dá ou dispensa o aviso. Só o AlarmManager é trocado.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class ExactAlarmViewModelTest {
    @get:Rule
    val folder = TemporaryFolder()

    private val alarms = FakeReminderAlarms(exactAllowed = false)
    private lateinit var stores: TestReminderStores
    private val created = mutableListOf<ExactAlarmViewModel>()

    private val reminder =
        Reminder(
            key = "meeting:2026-09-14T18:00:00.000Z:60",
            kind = ReminderKind.Tracked,
            taskId = "meeting",
            name = "Reunião",
            offsetMinutes = 60,
            triggerAt = Instant.parse("2026-09-14T17:00:00Z"),
            anchor = Instant.parse("2026-09-14T18:00:00Z"),
        )

    @Before
    fun setUp() {
        Dispatchers.setMain(UnconfinedTestDispatcher())
        stores = TestReminderStores(folder.root.resolve("reminders.preferences_pb"))
    }

    @After
    fun tearDown() {
        created.forEach { it.stopAndJoin() }
        runBlocking { stores.close() }
        Dispatchers.resetMain()
    }

    private suspend fun newViewModel(): ExactAlarmViewModel =
        ExactAlarmViewModel(alarms, stores.schedule, stores.exactAlarmPrompt).also {
            created += it
            it.refresh()
        }

    private suspend fun ExactAlarmViewModel.settled(expected: Boolean) =
        withContext(Dispatchers.Default) {
            withTimeout(5_000) {
                while (explain.value != expected) delay(5)
            }
        }

    @Test
    fun `it explains the permission when it is missing and there are saved reminders`() =
        runBlocking {
            stores.schedule.write(listOf(reminder))

            val viewModel = newViewModel()

            viewModel.settled(true)
        }

    @Test
    fun `it stays quiet when the permission is already granted`() =
        runBlocking {
            alarms.exactAllowed = true
            stores.schedule.write(listOf(reminder))

            val viewModel = newViewModel()

            delay(100)
            assertFalse(viewModel.explain.value)
        }

    @Test
    fun `it stays quiet when there is nothing to remind`() =
        runBlocking {
            val viewModel = newViewModel()

            delay(100)
            assertFalse(viewModel.explain.value)
        }

    @Test
    fun `coming back from the settings with the permission granted hides the notice`() =
        runBlocking {
            stores.schedule.write(listOf(reminder))
            val viewModel = newViewModel()
            viewModel.settled(true)

            alarms.exactAllowed = true
            viewModel.refresh()

            viewModel.settled(false)
        }

    @Test
    fun `dismissing the notice hides it for good, even after the app reopens`() =
        runBlocking {
            stores.schedule.write(listOf(reminder))
            val viewModel = newViewModel()
            viewModel.settled(true)

            viewModel.dismiss()
            viewModel.settled(false)
            // O DataStore é gravado fora da tela: espera a gravação chegar antes de "fechar o app".
            withContext(Dispatchers.Default) { withTimeout(30_000) { stores.exactAlarmPrompt.dismissed.first { it } } }

            val reopened = newViewModel()
            delay(100)
            assertFalse(reopened.explain.value)
            assertTrue(alarms.scheduled.isEmpty())
        }
}
