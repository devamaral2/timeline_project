# 15: Hierarquia na edição

**What to build:** Na edição, o usuário escolhe a tarefa principal (um espaço único com "+" e remover) e as subtarefas (lista com "+" e remover) num seletor que busca tarefas, cria uma tarefa nova pelo nome ou pede ao Hermes que crie. Tudo vai no mesmo Salvar.

**Blocked by:** 13

**Status:** done

**Leia antes:** o [README](README.md). ADR [0016](../../../docs/adr/0016-subtarefa-no-lugar-da-sequencia.md). No web: a seção de hierarquia na edição, o seletor de entidade e as ações de criar tarefa.

- [x] O seletor é uma folha inferior que abre com os primeiros itens, filtra pela busca e deixa de fora a tarefa aberta, a principal escolhida e as subtarefas já na lista.
- [x] "Criar" manda `POST /api/tasks` só com o nome; "Pedir ao Hermes" manda `POST /api/requests` e acompanha até terminar, como no web; a ligação vai para o rascunho.
- [x] Salvar manda só o que mudou: `parentTaskId` (id ou `null`) e a lista completa `subtaskIds`.
- [x] Pôr a tarefa sob outra principal tira a ligação anterior sem erro; ciclo recusado pela API mantém a escolha e mostra a mensagem do web.
