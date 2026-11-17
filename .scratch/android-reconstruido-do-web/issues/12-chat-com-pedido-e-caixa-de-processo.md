# 12: Chat com pedido e caixa de processo

**What to build:** O botão do agente abre o chat numa folha que expande para tela cheia. Cada mensagem vira um pedido, com a caixa de processo mostrando os passos e permitindo cancelar. As respostas aparecem em markdown, com botões de escolha. O usuário alterna entre Conversa e Processo, tenta de novo, começa uma nova conversa e muda para o Hermes com `/hermes`. Tocar num intervalo livre da Agenda abre o chat com aquela janela.

**Blocked by:** 05, 06

**Status:** ready-for-agent

**Leia antes:** o [README](README.md). No web: o painel do chat do agente, a caixa de processo e as escolhas citadas na resposta.

- [ ] O botão do agente mostra ocioso, pensando, feito e erro, e vira X com o chat aberto.
- [ ] Enviar manda `POST /api/requests` (ou `POST /api/requests/hermes` no modo Hermes, com a mensagem do web no 404) e acompanha o pedido a cada 3 s, com limite de 180 s.
- [ ] A caixa de processo mostra os passos e cancela o pedido.
- [ ] "Conversa" mostra as respostas em markdown; "Processo" mostra a linha do tempo dos traces por pedido.
- [ ] As escolhas citadas na resposta viram botões que enviam o texto como próxima mensagem; a extração é portada e conferida contra fixtures do TS.
- [ ] Mensagem que falhou tem "Tentar de novo" sem perder o texto; "Nova conversa" zera a sessão.
- [ ] Reabrir o chat reencontra os pedidos ainda abertos (`GET /api/requests`).
- [ ] A tela inicial do chat tem os atalhos do web; os de criação ficam para os tickets 13 e 17, o de notificações para o 23 e o de configurações para o 21.
- [ ] Tocar num intervalo livre abre o chat numa conversa nova, com a janela anexada como no web.
