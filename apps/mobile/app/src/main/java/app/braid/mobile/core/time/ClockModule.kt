package app.braid.mobile.core.time

import app.braid.mobile.domain.time.AppClock
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import java.time.Instant
import java.time.ZoneId
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object ClockModule {
    @Provides
    @Singleton
    fun provideAppClock(): AppClock = AppClock { Instant.now() }

    /** O fuso do aparelho: o feed diz "hoje às 14:00" na hora de quem olha, como o `toLocaleTimeString` do web. */
    @Provides
    fun provideZone(): ZoneId = ZoneId.systemDefault()
}
