package app.braid.mobile.data.session

import app.braid.mobile.core.network.TokenProvider
import app.braid.mobile.domain.session.SessionRepository
import dagger.Binds
import dagger.Module
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
