package app.braid.mobile.data.session

import app.braid.mobile.BuildConfig
import app.braid.mobile.core.network.TokenProvider
import app.braid.mobile.core.network.createAuthApi
import app.braid.mobile.domain.session.SessionRepository
import dagger.Binds
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
abstract class SessionModule {
    @Binds
    @Singleton
    abstract fun bindSessionStorage(storage: DataStoreSessionStorage): SessionStorage

    @Binds
    @Singleton
    abstract fun bindSessionRepository(repository: DefaultSessionRepository): SessionRepository

    @Binds
    @Singleton
    abstract fun bindTokenProvider(repository: DefaultSessionRepository): TokenProvider
}

@Module
@InstallIn(SingletonComponent::class)
object AuthApiModule {
    /** O Auth é falado direto, sem bearer: é onde vive a sessão, então o cliente dele é da camada de dados. */
    @Provides
    @Singleton
    fun provideAuthApi(): AuthApi = createAuthApi(BuildConfig.AUTH_BASE_URL)
}
