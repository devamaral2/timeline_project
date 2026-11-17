# 17: Criar, editar e excluir nota; criar alimento

**What to build:** O usuário cria uma nota de texto ou um alimento a partir de texto livre, por "Novo documento" ou pelo `/nota` do chat. Edita a própria nota num editor de markdown com os modos escrever e ler, e a exclui com confirmação.

**Blocked by:** 11, 12

**Status:** ready-for-agent

**Leia antes:** o [README](README.md). No web: a criação de documento, o editor de markdown da nota e as regras de quem edita o quê.

- [ ] "Novo documento" oferece Nota e Alimento; criar manda `POST /api/artifacts` com `Idempotency-Key`.
- [ ] O alimento nasce de texto livre e mostra "calculando" até o agente preencher, como no ticket 11.
- [ ] A nota própria abre no editor com os modos escrever e ler; Salvar manda `PATCH /api/artifacts/{id}`.
- [ ] Excluir pede confirmação, manda `DELETE /api/artifacts/{id}` e volta para a lista.
- [ ] Editar e excluir só aparecem na nota de texto do próprio usuário.
- [ ] O atalho `/nota` do chat abre a criação, com o nome quando digitado.
