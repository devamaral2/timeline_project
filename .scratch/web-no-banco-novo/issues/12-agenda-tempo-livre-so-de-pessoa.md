# 12: Agenda: tempo livre só de pessoa

**What to build:** As janelas livres da agenda passam a considerar só os eventos de pessoa: um pedido ou uma execução agendada do agente não ocupa o tempo do usuário.

**Blocked by:** 11 (Agenda lê a API nova)

**Status:** done

**Leia antes:** o [README](README.md) desta pasta. Spec: histórias 23 e 24, “Agenda”. Canvas: quadro Agenda (linha “Livre”).

- [x] Um evento de agente dentro de uma janela não a divide nem a encurta.
- [x] O bloco “Livre” mostra o intervalo e a duração, como hoje.
- [x] O toque na janela livre continua fazendo o que faz hoje: abre o chat do agente com a janela preenchida.
- [x] O teste de tela cobre um dia com eventos de pessoa e de agente intercalados.
- [x] A linha desta tela em `docs/mobile-parity.md` foi atualizada, com o Android marcado como em progresso.
- [x] Os testes novos passam, e `pnpm run test:unit` e `pnpm run typecheck` continuam verdes.
