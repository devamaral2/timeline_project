package app.braid.mobile.data.network

import app.braid.mobile.BuildConfig
import app.braid.mobile.data.auth.AuthApi
import app.braid.mobile.data.auth.AuthClient
import app.braid.mobile.data.auth.AuthGateway
import app.braid.mobile.data.chat.AgentChatGateway
import app.braid.mobile.data.chat.AgentChatHistoryGateway
import app.braid.mobile.data.chat.AgentChatHistoryRepository
import app.braid.mobile.data.chat.AgentChatRepository
import app.braid.mobile.data.chat.ChatApi
import app.braid.mobile.data.chat.ChatSocketFactory
import app.braid.mobile.data.chat.OkHttpChatSocketFactory
import app.braid.mobile.data.events.EventGateway
import app.braid.mobile.data.events.EventRepository
import app.braid.mobile.data.events.EventsApi
import app.braid.mobile.data.events.VoiceEventGateway
import app.braid.mobile.data.events.VoiceEventRepository
import app.braid.mobile.data.tags.TagGateway
import app.braid.mobile.data.tags.TagRepository
import app.braid.mobile.data.tags.TagsApi
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import retrofit2.Retrofit
import retrofit2.converter.kotlinx.serialization.asConverterFactory
import javax.inject.Named
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object NetworkModule {
    @Provides
    @Singleton
    fun provideEventGateway(repository: EventRepository): EventGateway = repository

    @Provides
    @Singleton
    fun provideTagGateway(repository: TagRepository): TagGateway = repository

    @Provides
    @Singleton
    fun provideVoiceEventGateway(repository: VoiceEventRepository): VoiceEventGateway = repository

    @Provides
    @Singleton
    fun provideAgentChatGateway(repository: AgentChatRepository): AgentChatGateway = repository

    @Provides
    @Singleton
    fun provideAgentChatHistoryGateway(repository: AgentChatHistoryRepository): AgentChatHistoryGateway = repository

    @Provides
    @Singleton
    fun provideAuthGateway(client: AuthClient): AuthGateway = client

    @Provides
    @Singleton
    fun provideJson(): Json =
        Json {
            ignoreUnknownKeys = true
            explicitNulls = false
        }

    @Provides
    @Singleton
    fun provideAuthApi(json: Json): AuthApi =
        Retrofit
            .Builder()
            .baseUrl(BuildConfig.AUTH_BASE_URL.withTrailingSlash())
            .client(OkHttpClient.Builder().build())
            .addConverterFactory(json.asConverterFactory("application/json".toMediaType()))
            .build()
            .create(AuthApi::class.java)

    @Provides
    @Singleton
    fun provideEventsApi(
        json: Json,
        @Named("apiClient") client: OkHttpClient,
    ): EventsApi =
        Retrofit
            .Builder()
            .baseUrl(BuildConfig.API_BASE_URL.withTrailingSlash())
            .client(client)
            .addConverterFactory(json.asConverterFactory("application/json".toMediaType()))
            .build()
            .create(EventsApi::class.java)

    @Provides
    @Singleton
    fun provideTagsApi(
        json: Json,
        @Named("apiClient") client: OkHttpClient,
    ): TagsApi =
        Retrofit
            .Builder()
            .baseUrl(BuildConfig.API_BASE_URL.withTrailingSlash())
            .client(client)
            .addConverterFactory(json.asConverterFactory("application/json".toMediaType()))
            .build()
            .create(TagsApi::class.java)

    @Provides
    @Singleton
    fun provideChatApi(
        json: Json,
        @Named("apiClient") client: OkHttpClient,
    ): ChatApi =
        Retrofit
            .Builder()
            .baseUrl(BuildConfig.API_BASE_URL.withTrailingSlash())
            .client(client)
            .addConverterFactory(json.asConverterFactory("application/json".toMediaType()))
            .build()
            .create(ChatApi::class.java)

    @Provides
    @Singleton
    fun provideChatSocketFactory(factory: OkHttpChatSocketFactory): ChatSocketFactory = factory

    @Provides
    @Singleton
    @Named("apiClient")
    fun provideApiClient(
        interceptor: AuthInterceptor,
        authenticator: TokenAuthenticator,
    ): OkHttpClient =
        OkHttpClient
            .Builder()
            .addInterceptor(interceptor)
            .authenticator(authenticator)
            .build()

    private fun String.withTrailingSlash(): String = if (endsWith('/')) this else "$this/"
}
