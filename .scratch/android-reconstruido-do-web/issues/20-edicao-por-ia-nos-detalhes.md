# 20: Edição por IA nos detalhes

**What to build:** No rodapé do detalhe da tarefa e do documento, o usuário escreve ou dita o que quer mudar e o agente edita aquela entidade. O detalhe acompanha o pedido e mostra a versão nova quando ele termina.

**Blocked by:** 09, 11, 19

**Status:** done

**Leia antes:** o [README](README.md). No web: a barra de edição por IA da entidade.

- [x] A caixa no rodapé manda `POST /api/requests/edit` com a entidade alvo.
- [x] O pedido é acompanhado a cada 3 s; ao terminar, o detalhe relê a entidade.
- [x] Falha e cancelamento aparecem como no web.
- [x] O microfone da caixa usa o reconhecimento do ticket 19 de forma passiva, como no web: só dita, não envia sozinho.
