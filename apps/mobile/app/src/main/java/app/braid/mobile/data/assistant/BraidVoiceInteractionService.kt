package app.braid.mobile.data.assistant

import android.service.voice.VoiceInteractionService

/**
 * O que faz o Braid aparecer em "App assistente digital" do Android. O sistema mantém este serviço vivo enquanto o app
 * é o assistente escolhido e abre uma [BraidVoiceInteractionSession] a cada gesto (toque longo na tecla lateral, deslizar
 * do canto). Não há nada a fazer aqui: a conversa acontece na `MainActivity`.
 */
class BraidVoiceInteractionService : VoiceInteractionService()
