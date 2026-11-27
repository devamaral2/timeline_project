package app.braid.mobile.data.transcription

import app.braid.mobile.core.network.ApiClientFactory
import app.braid.mobile.domain.transcription.TranscriptionRepository
import dagger.Binds
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
abstract class TranscriptionBindings {
    @Binds
    @Singleton
    abstract fun bindTranscriptionRepository(repository: DefaultTranscriptionRepository): TranscriptionRepository
}

@Module
@InstallIn(SingletonComponent::class)
object TranscriptionProvider {
    @Provides
    @Singleton
    fun provideTranscriptionApi(clients: ApiClientFactory): TranscriptionApi = clients.create(TranscriptionApi::class.java)
}
