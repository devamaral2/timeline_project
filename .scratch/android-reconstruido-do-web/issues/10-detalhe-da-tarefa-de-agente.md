# 10: Detalhe da tarefa de agente

**What to build:** Tocar numa tarefa de agente ou num pedido abre o detalhe dele: status do agente, Informações, hierarquia, Entradas, Passos (feitos/total), Produziu, Sessão, Registro e Falha. Pelo rodapé, o usuário continua a mesma sessão com um novo pedido ou cancela o pedido. O detalhe se atualiza sozinho enquanto o pedido está aberto.

**Blocked by:** 09

**Status:** done

**Leia antes:** o [README](README.md). No web: a vista da tarefa de agente, a barra de pedido e o modelo do pedido.

- [x] O detalhe lê a tarefa e, quando é pedido, `GET /api/requests/{id}`; o status do agente é só leitura.
- [x] Entradas aparecem em ordem, com tipo, hora e texto; Passos mostra feitos/total; Produziu lista o que foi criado, alterado ou apagado, levando ao detalhe (o apagado é só leitura).
- [x] Sessão mostra o primeiro pedido e leva a ele.
- [x] Continuar manda `POST /api/requests` na mesma sessão e passa a acompanhar o pedido novo.
- [x] Cancelar manda `POST /api/requests/{id}/cancel`; o 409 do pedido de alimento mostra a mensagem do web.
- [x] Com o pedido aberto, o detalhe consulta a cada 3 s e para quando ele termina ou a tela sai de vista.
- [x] O modelo do pedido é portado e conferido contra fixtures do TS.
