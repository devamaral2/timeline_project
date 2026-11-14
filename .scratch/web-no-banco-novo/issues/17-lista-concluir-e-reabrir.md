# 17: Lista de tarefas: concluir e reabrir pelo glifo

**What to build:** Na lista de tarefas, tocar no glifo de um evento de pessoa conclui o evento; tocar no glifo de um evento feito ou encerrado o reabre.

**Blocked by:** 15 (Lista de tarefas lê a API nova, em seis grupos)

**Status:** done

**Leia antes:** o [README](README.md) desta pasta. Spec: história 13, “Lista de tarefas”.

- [x] O toque no glifo de um evento em aberto o leva a `done`; o de um evento `done`, `cancel` ou `missed` o leva a `todo`.
- [x] A edição envia o status novo e a revisão lida.
- [x] Depois da edição, a linha muda de grupo.
- [x] Diante de revisão desatualizada, a tela avisa e recarrega a lista.
- [x] O glifo de um evento de agente não muda status.
- [x] O teste de tela confere a edição enviada e o grupo depois dela.
- [x] A linha desta tela em `docs/mobile-parity.md` foi atualizada, com o Android marcado como em progresso.
- [x] Os testes novos passam, e `pnpm run test:unit` e `pnpm run typecheck` continuam verdes.
