package app.braid.mobile.data.tasks

import app.braid.mobile.core.network.ApiClientFactory
import app.braid.mobile.domain.task.TaskEditRepository
import dagger.Binds
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
abstract class TaskEditBindings {
    @Binds
    @Singleton
    abstract fun bindTaskEditRepository(repository: DefaultTaskEditRepository): TaskEditRepository
}

@Module
@InstallIn(SingletonComponent::class)
object TaskEditProvider {
    @Provides
    @Singleton
    fun provideTaskEditApi(clients: ApiClientFactory): TaskEditApi = clients.create(TaskEditApi::class.java)
}
