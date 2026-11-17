# 14: Recorrência na edição

**What to build:** Na criação e na edição, o usuário escolhe os dias da semana em que a tarefa se repete. Criar com recorrência cria uma série; uma tarefa avulsa que passa a se repetir vira série a partir do dia seguinte; numa ocorrência, o usuário muda a regra ou exclui a série inteira.

**Blocked by:** 13

**Status:** ready-for-agent

**Leia antes:** o [README](README.md). No web: o editor de recorrência e os três caminhos de gravação.

- [ ] O editor de dias da semana grava a máscara como o web.
- [ ] Criação com recorrência manda `POST /api/recurrences`.
- [ ] Tarefa avulsa que ganha recorrência cria a série a partir do dia seguinte, como no web.
- [ ] Numa ocorrência, mudar a regra manda `PATCH /api/recurrences/{id}` e excluir a série manda `DELETE /api/recurrences/{id}`, com confirmação.
- [ ] Tarefa longa não oferece recorrência.
- [ ] O detalhe mostra a regra e se a ocorrência segue a série.
