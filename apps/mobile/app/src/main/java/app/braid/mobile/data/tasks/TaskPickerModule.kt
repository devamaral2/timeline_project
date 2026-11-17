package app.braid.mobile.data.tasks

import app.braid.mobile.core.network.ApiClientFactory
import app.braid.mobile.domain.task.TaskPickerRepository
import dagger.Binds
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
abstract class TaskPickerBindings {
    @Binds
    @Singleton
    abstract fun bindTaskPickerRepository(repository: DefaultTaskPickerRepository): TaskPickerRepository
}

@Module
@InstallIn(SingletonComponent::class)
object TaskPickerProvider {
    @Provides
    @Singleton
    fun provideTaskPickerApi(clients: ApiClientFactory): TaskPickerApi = clients.create(TaskPickerApi::class.java)
}
