package app.braid.mobile.data.reminders

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import app.braid.mobile.data.events.EventQuery
import app.braid.mobile.data.events.EventRepository
import app.braid.mobile.data.events.EventResult
import app.braid.mobile.data.session.SessionRepository
import dagger.hilt.EntryPoint
import dagger.hilt.InstallIn
import dagger.hilt.android.EntryPointAccessors
import dagger.hilt.components.SingletonComponent
import java.time.Duration
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
            return when (
                val page =
                    dependencies.eventRepository().window(
                        from = now,
                        to = now.plus(LOOK_AHEAD),
                        query = EventQuery(limit = 500),
                        forceRefresh = true,
                    )
            ) {
                is EventResult.Success -> {
                    dependencies.reminderScheduler().reschedule(page.value.items.toReminderSources(), now)
                    Result.success()
                }

                is EventResult.Failure -> Result.retry()
            }
        }

        private companion object {
            val LOOK_AHEAD: Duration = Duration.ofDays(30)
        }
    }

@EntryPoint
@InstallIn(SingletonComponent::class)
interface ReminderWorkerDependencies {
    fun eventRepository(): EventRepository

    fun reminderScheduler(): ReminderScheduler

    fun sessionRepository(): SessionRepository
}

fun rescheduleRemindersOnBoot(context: Context) {
    val request =
        androidx.work
            .OneTimeWorkRequestBuilder<ReminderRescheduleWorker>()
            .setConstraints(
                androidx.work.Constraints
                    .Builder()
                    .setRequiredNetworkType(androidx.work.NetworkType.CONNECTED)
                    .build(),
            ).setBackoffCriteria(
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

private fun List<app.braid.mobile.data.dto.TimelineEventCardDto>.toReminderSources(): List<ReminderEventSource> =
    mapNotNull { event ->
        runCatching {
            ReminderEventSource(
                id = event.id,
                name = event.name,
                startedAt = Instant.parse(event.startedAt),
                notifyOffsetsMinutes = event.notifyOffsetsMinutes,
            )
        }.getOrNull()
    }
