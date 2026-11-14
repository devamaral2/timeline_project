# 17: Lista de tarefas: concluir e reabrir pelo glifo

**What to build:** Na lista de tarefas, tocar no glifo de um evento de pessoa conclui o evento; tocar no glifo de um evento feito ou encerrado o reabre.

**Blocked by:** 15 (Lista de tarefas lê a API nova, em seis grupos)

**Status:** ready-for-agent

**Leia antes:** o [README](README.md) desta pasta. Spec: história 13, “Lista de tarefas”.

- [ ] O toque no glifo de um evento em aberto o leva a `done`; o de um evento `done`, `cancel` ou `missed` o leva a `todo`.
- [ ] A edição envia o status novo e a revisão lida.
- [ ] Depois da edição, a linha muda de grupo.
- [ ] Diante de revisão desatualizada, a tela avisa e recarrega a lista.
- [ ] O glifo de um evento de agente não muda status.
- [ ] O teste de tela confere a edição enviada e o grupo depois dela.
- [ ] A linha desta tela em `docs/mobile-parity.md` foi atualizada, com o Android marcado como em progresso.
- [ ] Os testes novos passam, e `pnpm run test:unit` e `pnpm run typecheck` continuam verdes.
