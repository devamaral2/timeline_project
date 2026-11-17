# 19: Voz no chat

**What to build:** Ao abrir o chat, o app começa a ouvir em português. 1,8 segundo de silêncio envia a mensagem; depois da resposta, ele volta a ouvir até o usuário dizer "para" ou "chega". Na primeira vez, o app pede a permissão de microfone e explica quando ela foi negada.

**Blocked by:** 12

**Status:** done

**Leia antes:** o [README](README.md). No web: o laço de voz do chat e as mensagens de erro de fala.

- [x] O reconhecimento usa o `SpeechRecognizer` do Android em pt-BR, atrás de uma interface que os testes trocam por um falso.
- [x] Abrir o chat foca o campo e começa a ouvir; o botão do agente mostra "ouvindo".
- [x] 1,8 s de silêncio envia; "para" ou "chega" encerra o laço.
- [x] A permissão de microfone é pedida na primeira vez; negada, o chat segue por texto. Pelo web (README, "vale o web"): a explicação só aparece quando a pessoa toca no microfone; com a escuta aberta sozinha, a negação fica quieta.
- [x] As mensagens de erro de fala são as do web.
