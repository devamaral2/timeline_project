# 10: Linha única das listas

**What to build:** Passa a existir um componente só para a linha de um evento, usado pela agenda e pela lista de tarefas. Evento de pessoa fica solto no fundo da tela; evento de agente fica num cartão verde-água.

**Blocked by:** 08 (Textos calculados da linha); 09 (Glifos de status e ícones de tipo)

**Status:** ready-for-agent

**Leia antes:** o [README](README.md) desta pasta. Spec: “A linha das listas”. Canvas: quadros Tarefas e Agenda.

- [ ] A linha mostra, da esquerda para a direita: glifo de status, título, uma linha com ícone e código do tipo, o “quando” e as tags, e a duração à direita.
- [ ] A linha lê só o cartão de evento do contrato, sem campo extra.
- [ ] Evento de agente fica num cartão verde-água; evento de pessoa não tem cartão.
- [ ] Em evento de pessoa o glifo é um botão com o nome “<status>. Mudar status de “<título>””; em evento de agente o glifo não é botão.
- [ ] A linha aceita mostrar a fração de subtarefas (“1/3”) quando a tela a informa.
- [ ] Tocar no resto da linha leva ao detalhe do evento.
- [ ] Os testes montam a linha com um evento de pessoa, um de referência e um de agente e conferem o que aparece.
- [ ] Os testes novos passam, e `pnpm run test:unit` e `pnpm run typecheck` continuam verdes.
