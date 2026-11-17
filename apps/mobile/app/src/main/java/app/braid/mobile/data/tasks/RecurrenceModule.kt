package app.braid.mobile.data.tasks

import app.braid.mobile.core.network.ApiClientFactory
import app.braid.mobile.domain.task.RecurrenceRepository
import dagger.Binds
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
abstract class RecurrenceBindings {
    @Binds
    @Singleton
    abstract fun bindRecurrenceRepository(repository: DefaultRecurrenceRepository): RecurrenceRepository
}

@Module
@InstallIn(SingletonComponent::class)
object RecurrenceProvider {
    @Provides
    @Singleton
    fun provideRecurrenceApi(clients: ApiClientFactory): RecurrenceApi = clients.create(RecurrenceApi::class.java)
}
