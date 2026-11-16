# 01: Liberar o nome Task no web

**What to build:** O web deixa de ter tipos próprios com o nome `Task`. Os tipos locais da tela Tarefas e dos controles da agenda (status, prioridade, mapas de rótulo e os exemplos da lista) passam a usar os tipos do pacote de contratos, e o que for só de tela (rótulos, ícones) ganha um nome de visualização que não colide com o `TaskStatus` e o `TaskPriority` que virão do contrato no ticket 06. Nada muda para quem usa.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

**Leia antes:** o [README](README.md). Spec: "Web" (o item sobre os tipos `Task*` locais) e a história 42.

- [ ] Nenhum tipo, interface ou constante do web se chama `Task…`, `task…Statuses` ou `task…Priorities` com sentido de status ou prioridade da entidade; os valores vêm do pacote de contratos.
- [ ] Os rótulos de tela de status e prioridade ficam num mapa de visualização com nome que não começa por `Task` nem por `Event`.
- [ ] Os exemplos da lista e da agenda usam o tipo do cartão do contrato, não um tipo de exemplo próprio.
- [ ] A tela Tarefas e a agenda mostram exatamente o que mostravam: os testes de tela existentes passam sem mudar o que conferem.
- [ ] `pnpm run test:unit` e `pnpm run typecheck` verdes.
