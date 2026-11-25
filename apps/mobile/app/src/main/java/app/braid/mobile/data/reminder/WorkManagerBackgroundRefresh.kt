package app.braid.mobile.data.reminder

import android.content.Context
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import app.braid.mobile.domain.reminder.BackgroundRefresh
import dagger.hilt.android.qualifiers.ApplicationContext
import java.util.concurrent.TimeUnit
import javax.inject.Inject
import javax.inject.Singleton

/** O intervalo da releitura de fundo: 15 min é o menor que o WorkManager aceita. */
private const val BACKGROUND_REFRESH_MINUTES = 15L

private const val WORK_NAME = "reminders_background_refresh"

/** A [BackgroundRefresh] do WorkManager: um trabalho periódico com rede, que o sistema mantém depois de reiniciar. */
@Singleton
class WorkManagerBackgroundRefresh
    @Inject
    constructor(
        @ApplicationContext private val context: Context,
    ) : BackgroundRefresh {
        private val manager get() = WorkManager.getInstance(context)

        override fun start() {
            val request =
                PeriodicWorkRequestBuilder<ReminderRefreshWorker>(BACKGROUND_REFRESH_MINUTES, TimeUnit.MINUTES)
                    .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                    .build()
            manager.enqueueUniquePeriodicWork(WORK_NAME, ExistingPeriodicWorkPolicy.KEEP, request)
        }

        override fun stop() {
            manager.cancelUniqueWork(WORK_NAME)
        }
    }
