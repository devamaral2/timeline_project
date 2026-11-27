package app.braid.mobile.support

import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import app.braid.mobile.data.agenda.DataStoreFreeTimeRepository
import app.braid.mobile.data.execution.DataStoreExecutionDrawerModeRepository
import app.braid.mobile.data.executor.DataStoreViewModeRepository
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.runBlocking
import java.io.File

/** O DataStore de verdade, num arquivo temporário: abrir outro no mesmo arquivo é "fechar e reabrir o app". */
class TestViewModes(
    private val file: File,
) : AutoCloseable {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val store = PreferenceDataStoreFactory.create(scope = scope) { file }
    val repository = DataStoreViewModeRepository(store)

    /** A altura da gaveta de execução, no mesmo arquivo das preferências. */
    val executionDrawer = DataStoreExecutionDrawerModeRepository(store)

    /** A escolha "Tempo livre" da Agenda, no mesmo arquivo das preferências. */
    val freeTime = DataStoreFreeTimeRepository(store)

    /** Solta o arquivo e espera o DataStore terminar de verdade, para outro teste (ou este) poder reabri-lo. */
    override fun close() = runBlocking { listOf(scope).closeAndJoin() }
}
