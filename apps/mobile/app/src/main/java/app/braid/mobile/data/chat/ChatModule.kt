package app.braid.mobile.data.chat

import app.braid.mobile.domain.chat.ChatPolling
import app.braid.mobile.domain.chat.ChatRepository
import app.braid.mobile.domain.chat.ModelSelectionStore
import dagger.Binds
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
abstract class ChatBindings {
    @Binds
    @Singleton
    abstract fun bindChatRepository(repository: DefaultChatRepository): ChatRepository

    @Binds
    @Singleton
    abstract fun bindModelSelectionStore(store: DataStoreModelSelectionStore): ModelSelectionStore
}

@Module
@InstallIn(SingletonComponent::class)
object ChatProvider {
    @Provides
    fun provideChatPolling(): ChatPolling = ChatPolling()
}
