package app.braid.mobile.core.time

import app.braid.mobile.domain.time.AppClock
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import java.time.Instant
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object ClockModule {
    @Provides
    @Singleton
    fun provideAppClock(): AppClock = AppClock { Instant.now() }
}
