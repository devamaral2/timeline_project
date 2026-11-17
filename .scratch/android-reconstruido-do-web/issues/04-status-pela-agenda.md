# 04: Mudar o status pela agenda

**What to build:** Na Agenda, o usuário toca no ponto de status de uma tarefa de pessoa, inclusive de referência, escolhe um dos sete status e vê a mudança gravada. Se outra mudança chegou antes, a agenda relê e avisa. Tarefas de agente abertas se atualizam sozinhas.

**Blocked by:** 03

**Status:** ready-for-agent

**Leia antes:** o [README](README.md). Spec: "Sessão e rede", "Domínio e vocabulário". No web: o seletor de status da agenda e a atualização das tarefas de agente abertas.

- [ ] O seletor de status é uma folha inferior com os sete status de pessoa, nos rótulos e glifos do web, reutilizável pelas outras telas.
- [ ] Escolher manda `PATCH /api/tasks/{id}` com a `revision` lida; `done` envia `finishedAt`, sair de `done` envia `finishedAt` nulo.
- [ ] Conflito de `revision` relê o dia e mostra o aviso do web.
- [ ] Tarefas de agente não abrem o seletor.
- [ ] Com alguma tarefa de agente aberta no dia, a Agenda consulta de novo a cada 3 s, em silêncio, e para quando não há nenhuma ou a tela sai de vista.
