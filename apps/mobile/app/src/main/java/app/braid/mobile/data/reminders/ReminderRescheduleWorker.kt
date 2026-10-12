package app.braid.mobile.data.reminders

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import app.braid.mobile.data.session.SessionRepository
import dagger.hilt.EntryPoint
import dagger.hilt.InstallIn
import dagger.hilt.android.EntryPointAccessors
import dagger.hilt.components.SingletonComponent
import java.time.Instant

/** Rehidrata os alarms depois que o Android reinicia o processo/app. */
class ReminderRescheduleWorker
    constructor(
        appContext: Context,
        workerParams: WorkerParameters,
    ) : CoroutineWorker(appContext, workerParams) {
        override suspend fun doWork(): Result {
            val dependencies =
                EntryPointAccessors.fromApplication(
                    applicationContext,
                    ReminderWorkerDependencies::class.java,
                )
            if (dependencies.sessionRepository().snapshot() == null) {
                dependencies.reminderScheduler().cancelAll()
                return Result.success()
            }

            val now = Instant.now()
            val loaded = dependencies.notificationSourceLoader().load(now)
            // Com a lista incompleta, apagar os alarmes atuais perderia avisos válidos.
            if (!loaded.complete) return Result.retry()

            dependencies.reminderScheduler().reschedule(loaded.sources.map(NotificationFeedSource::toReminderSource), now)
            return Result.success()
        }
    }

@EntryPoint
@InstallIn(SingletonComponent::class)
interface ReminderWorkerDependencies {
    fun notificationSourceLoader(): NotificationSourceLoader

    fun reminderScheduler(): ReminderScheduler

    fun sessionRepository(): SessionRepository
}

fun rescheduleRemindersOnBoot(context: Context) = enqueueReminderSync(context)

private val networkConstraints =
    androidx.work.Constraints
        .Builder()
        .setRequiredNetworkType(androidx.work.NetworkType.CONNECTED)
        .build()

/**
 * Relê os próximos 30 dias e recria os alarmes. Sem isto só os dias que a
 * pessoa abriu na agenda teriam aviso agendado.
 */
fun enqueueReminderSync(context: Context) {
    val request =
        androidx.work
            .OneTimeWorkRequestBuilder<ReminderRescheduleWorker>()
            .setConstraints(networkConstraints)
            .setBackoffCriteria(
                androidx.work.BackoffPolicy.EXPONENTIAL,
                java.time.Duration.ofSeconds(10),
            ).build()
    androidx.work.WorkManager
        .getInstance(context)
        .enqueueUniqueWork(
            "reminder-reschedule",
            androidx.work.ExistingWorkPolicy.REPLACE,
            request,
        )
}

/** Mantém os alarmes em dia mesmo que o app fique dias sem ser aberto. */
fun enqueuePeriodicReminderSync(context: Context) {
    val request =
        androidx.work
            .PeriodicWorkRequestBuilder<ReminderRescheduleWorker>(java.time.Duration.ofHours(6))
            .setConstraints(networkConstraints)
            .build()
    androidx.work.WorkManager
        .getInstance(context)
        .enqueueUniquePeriodicWork(
            "reminder-sync",
            androidx.work.ExistingPeriodicWorkPolicy.KEEP,
            request,
        )
}

fun NotificationFeedSource.toReminderSource(): ReminderEventSource =
    ReminderEventSource(
        id = id,
        name = name,
        startedAt = startedAt,
        notifyOffsetsMinutes = notifyOffsetsMinutes,
        kind = kind,
    )
