# 12: Agenda: tempo livre só de pessoa

**What to build:** As janelas livres da agenda passam a considerar só os eventos de pessoa: um pedido ou uma execução agendada do agente não ocupa o tempo do usuário.

**Blocked by:** 11 (Agenda lê a API nova)

**Status:** ready-for-agent

**Leia antes:** o [README](README.md) desta pasta. Spec: histórias 23 e 24, “Agenda”. Canvas: quadro Agenda (linha “Livre”).

- [ ] Um evento de agente dentro de uma janela não a divide nem a encurta.
- [ ] O bloco “Livre” mostra o intervalo e a duração, como hoje.
- [ ] O atalho de criar evento a partir da janela livre continua abrindo a criação com o horário preenchido.
- [ ] O teste de tela cobre um dia com eventos de pessoa e de agente intercalados.
- [ ] A linha desta tela em `docs/mobile-parity.md` foi atualizada, com o Android marcado como em progresso.
- [ ] Os testes novos passam, e `pnpm run test:unit` e `pnpm run typecheck` continuam verdes.
