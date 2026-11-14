# 19: Listas se recarregam com evento de agente em aberto

**What to build:** Enquanto houver na agenda ou na lista de tarefas um evento de agente na fila, executando ou aguardando, a lista se recarrega sozinha, e o usuário vê quando o agente termina.

**Blocked by:** 11 (Agenda lê a API nova); 15 (Lista de tarefas lê a API nova, em seis grupos)

**Status:** ready-for-agent

**Leia antes:** o [README](README.md) desta pasta. Spec: história 16, “Lista de tarefas” (último item).

- [ ] Com um evento de agente em aberto na tela, a lista se recarrega em intervalo.
- [ ] Sem evento de agente em aberto, não há recarga em intervalo.
- [ ] A recarga para quando a tela é desmontada.
- [ ] O teste de tela avança o relógio e confere que a linha muda de “executando” para “feito”.
- [ ] Os testes novos passam, e `pnpm run test:unit` e `pnpm run typecheck` continuam verdes.
