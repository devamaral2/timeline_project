package app.braid.mobile.data.assistant

import app.braid.mobile.domain.chat.ChatPolling
import app.braid.mobile.domain.chat.ChatRepository
import app.braid.mobile.domain.chat.ModelSelector
import app.braid.mobile.domain.session.SessionRepository
import app.braid.mobile.domain.settings.ThemeRepository
import app.braid.mobile.domain.speech.MicrophonePermission
import app.braid.mobile.domain.speech.SpeechRecognizer
import app.braid.mobile.domain.task.TaskDetailRepository
import app.braid.mobile.domain.time.AppClock
import dagger.hilt.EntryPoint
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent

/**
 * O que o `ChatViewModel` pede, entregue a quem não é uma tela: a sessão do assistente é um serviço do sistema, fora de
 * qualquer `Activity`, e monta a sua própria conversa com as mesmas peças do app.
 */
@EntryPoint
@InstallIn(SingletonComponent::class)
interface AssistantEntryPoint {
    fun chatRepository(): ChatRepository

    fun session(): SessionRepository

    fun clock(): AppClock

    fun polling(): ChatPolling

    fun models(): ModelSelector

    /** Um reconhecedor só desta conversa: guarda a sessão de escuta, então não é o do app. */
    fun speech(): SpeechRecognizer

    fun microphone(): MicrophonePermission

    fun themes(): ThemeRepository

    /** A tarefa que o pedido criou ou alterou: o cartão da resposta mostra quando ela acontece. */
    fun taskDetails(): TaskDetailRepository
}
