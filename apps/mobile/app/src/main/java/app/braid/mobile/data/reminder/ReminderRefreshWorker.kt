package app.braid.mobile.data.reminder

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import app.braid.mobile.domain.reminder.ReminderSync
import dagger.hilt.EntryPoint
import dagger.hilt.InstallIn
import dagger.hilt.android.EntryPointAccessors
import dagger.hilt.components.SingletonComponent

/**
 * A releitura de fundo: relê a fonte dos lembretes com o app fechado e agenda o que mudou fora do aparelho. Uma falha de
 * rede não muda nada (os alarmes já agendados ficam) e a próxima rodada tenta de novo, então o resultado é sempre sucesso.
 */
class ReminderRefreshWorker(
    context: Context,
    params: WorkerParameters,
) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        EntryPointAccessors
            .fromApplication(applicationContext, ReminderWorkerEntryPoint::class.java)
            .sync()
            .refreshWhenSignedIn()
        return Result.success()
    }
}

/** O worker é criado pelo WorkManager, não pelo Hilt: o [ReminderSync] único do app vem por aqui. */
@EntryPoint
@InstallIn(SingletonComponent::class)
interface ReminderWorkerEntryPoint {
    fun sync(): ReminderSync
}
