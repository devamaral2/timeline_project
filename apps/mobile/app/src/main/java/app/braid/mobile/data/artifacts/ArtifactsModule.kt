package app.braid.mobile.data.artifacts

import app.braid.mobile.core.network.ApiClientFactory
import app.braid.mobile.domain.artifact.ArtifactRepository
import dagger.Binds
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
abstract class ArtifactsBindings {
    @Binds
    @Singleton
    abstract fun bindArtifactRepository(repository: DefaultArtifactRepository): ArtifactRepository
}

@Module
@InstallIn(SingletonComponent::class)
object ArtifactsProvider {
    @Provides
    @Singleton
    fun provideArtifactsApi(clients: ApiClientFactory): ArtifactsApi = clients.create(ArtifactsApi::class.java)
}
