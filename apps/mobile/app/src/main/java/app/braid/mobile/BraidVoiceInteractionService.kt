package app.braid.mobile

import android.service.voice.VoiceInteractionService

/**
 * O que faz o Braid aparecer em "App assistente digital" do Android. O sistema mantém este serviço vivo enquanto o app
 * é o assistente escolhido e abre uma [BraidVoiceInteractionSession] a cada gesto (toque longo na tecla lateral, deslizar
 * do canto). Não há nada a fazer aqui: a sessão desenha o painel do assistente na janela dela.
 */
class BraidVoiceInteractionService : VoiceInteractionService()
