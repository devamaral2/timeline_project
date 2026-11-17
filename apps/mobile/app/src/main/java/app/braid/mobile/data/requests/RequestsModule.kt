package app.braid.mobile.data.requests

import app.braid.mobile.core.network.ApiClientFactory
import app.braid.mobile.domain.request.AgentRequestRepository
import dagger.Binds
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
abstract class RequestsBindings {
    @Binds
    @Singleton
    abstract fun bindAgentRequestRepository(repository: DefaultAgentRequestRepository): AgentRequestRepository
}

@Module
@InstallIn(SingletonComponent::class)
object RequestsProvider {
    @Provides
    @Singleton
    fun provideRequestsApi(clients: ApiClientFactory): RequestsApi = clients.create(RequestsApi::class.java)
}
