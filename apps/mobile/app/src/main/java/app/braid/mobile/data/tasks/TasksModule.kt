package app.braid.mobile.data.tasks

import app.braid.mobile.core.network.ApiClientFactory
import app.braid.mobile.domain.task.TaskRepository
import dagger.Binds
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
abstract class TasksBindings {
    @Binds
    @Singleton
    abstract fun bindTaskRepository(repository: DefaultTaskRepository): TaskRepository
}

@Module
@InstallIn(SingletonComponent::class)
object TasksProvider {
    @Provides
    @Singleton
    fun provideTasksApi(clients: ApiClientFactory): TasksApi = clients.create(TasksApi::class.java)
}
