package app.braid.mobile.data.agentfiles

import app.braid.mobile.core.network.ApiClientFactory
import app.braid.mobile.domain.agentfile.AgentFileRepository
import dagger.Binds
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
abstract class AgentFilesBindings {
    @Binds
    @Singleton
    abstract fun bindAgentFileRepository(repository: DefaultAgentFileRepository): AgentFileRepository
}

@Module
@InstallIn(SingletonComponent::class)
object AgentFilesProvider {
    @Provides
    @Singleton
    fun provideAgentFilesApi(clients: ApiClientFactory): AgentFilesApi = clients.create(AgentFilesApi::class.java)
}
