# 19: Voz no chat

**What to build:** Ao abrir o chat, o app começa a ouvir em português. 1,8 segundo de silêncio envia a mensagem; depois da resposta, ele volta a ouvir até o usuário dizer "para" ou "chega". Na primeira vez, o app pede a permissão de microfone e explica quando ela foi negada.

**Blocked by:** 12

**Status:** ready-for-agent

**Leia antes:** o [README](README.md). No web: o laço de voz do chat e as mensagens de erro de fala.

- [ ] O reconhecimento usa o `SpeechRecognizer` do Android em pt-BR, atrás de uma interface que os testes trocam por um falso.
- [ ] Abrir o chat foca o campo e começa a ouvir; o botão do agente mostra "ouvindo".
- [ ] 1,8 s de silêncio envia; "para" ou "chega" encerra o laço.
- [ ] A permissão de microfone é pedida na primeira vez; negada, o chat mostra a explicação e segue por texto.
- [ ] As mensagens de erro de fala são as do web.
