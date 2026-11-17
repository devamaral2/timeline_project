package app.braid.mobile.data.reminder

import app.braid.mobile.domain.reminder.FiredKeysStore
import app.braid.mobile.domain.reminder.ReadKeysStore
import app.braid.mobile.domain.reminder.ReminderAlarms
import app.braid.mobile.domain.reminder.ReminderNotifier
import app.braid.mobile.domain.reminder.ReminderSync
import app.braid.mobile.domain.task.TaskRepository
import app.braid.mobile.domain.time.AppClock
import dagger.Binds
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
abstract class ReminderBindings {
    @Binds
    abstract fun bindAlarms(alarms: AndroidReminderAlarms): ReminderAlarms

    @Binds
    abstract fun bindNotifier(notifier: AndroidReminderNotifier): ReminderNotifier

    @Binds
    abstract fun bindFiredKeys(store: DataStoreFiredKeysStore): FiredKeysStore

    @Binds
    abstract fun bindReadKeys(store: DataStoreReadKeysStore): ReadKeysStore
}

@Module
@InstallIn(SingletonComponent::class)
object ReminderProvider {
    /** Um só para o app: o alarme, a releitura e a notificação compartilham o mesmo cadeado. */
    @Provides
    @Singleton
    fun provideReminderSync(
        tasks: TaskRepository,
        alarms: ReminderAlarms,
        notifier: ReminderNotifier,
        fired: FiredKeysStore,
        clock: AppClock,
    ): ReminderSync = ReminderSync(tasks, alarms, notifier, fired, clock)
}
