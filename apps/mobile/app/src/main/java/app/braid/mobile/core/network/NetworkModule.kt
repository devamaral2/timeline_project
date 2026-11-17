package app.braid.mobile.core.network

import app.braid.mobile.BuildConfig
import app.braid.mobile.data.session.AuthApi
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object NetworkModule {
    @Provides
    @Singleton
    fun provideAuthApi(): AuthApi = createAuthApi(BuildConfig.AUTH_BASE_URL)

    @Provides
    @Singleton
    fun provideApiClientFactory(tokens: TokenProvider): ApiClientFactory = ApiClientFactory(BuildConfig.API_BASE_URL, tokens)
}
