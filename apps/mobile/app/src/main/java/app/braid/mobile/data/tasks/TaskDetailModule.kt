package app.braid.mobile.data.tasks

import app.braid.mobile.core.network.ApiClientFactory
import app.braid.mobile.domain.task.TaskDetailRepository
import dagger.Binds
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
abstract class TaskDetailBindings {
    @Binds
    @Singleton
    abstract fun bindTaskDetailRepository(repository: DefaultTaskDetailRepository): TaskDetailRepository
}

@Module
@InstallIn(SingletonComponent::class)
object TaskDetailProvider {
    @Provides
    @Singleton
    fun provideTaskDetailApi(clients: ApiClientFactory): TaskDetailApi = clients.create(TaskDetailApi::class.java)
}
