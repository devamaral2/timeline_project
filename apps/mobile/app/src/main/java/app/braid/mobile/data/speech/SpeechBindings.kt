package app.braid.mobile.data.speech

import app.braid.mobile.domain.speech.MicrophonePermission
import app.braid.mobile.domain.speech.SpeechRecognizer
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent

/** O reconhecedor não é singleton: guarda uma sessão, e cada consumidor (o chat, as barras de edição por IA) tem a sua. */
@Module
@InstallIn(SingletonComponent::class)
abstract class SpeechBindings {
    @Binds
    abstract fun bindSpeechRecognizer(recognizer: AndroidSpeechRecognizer): SpeechRecognizer

    @Binds
    abstract fun bindMicrophonePermission(permission: AndroidMicrophonePermission): MicrophonePermission
}
