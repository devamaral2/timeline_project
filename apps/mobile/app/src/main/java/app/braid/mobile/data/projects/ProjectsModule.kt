package app.braid.mobile.data.projects

import app.braid.mobile.core.network.ApiClientFactory
import app.braid.mobile.domain.project.ProjectRepository
import dagger.Binds
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
abstract class ProjectsBindings {
    @Binds
    @Singleton
    abstract fun bindProjectRepository(repository: DefaultProjectRepository): ProjectRepository
}

@Module
@InstallIn(SingletonComponent::class)
object ProjectsProvider {
    @Provides
    @Singleton
    fun provideProjectsApi(clients: ApiClientFactory): ProjectsApi = clients.create(ProjectsApi::class.java)
}
