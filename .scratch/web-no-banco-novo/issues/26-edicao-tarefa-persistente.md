# 26: Edição: tarefa persistente

**What to build:** No modo de edição, a linha “Tarefa persistente” liga e desliga o evento longo, com as regras que ele tem.

**Blocked by:** 24 (Edição: campos básicos, Descartar e Salvar)

**Status:** ready-for-agent

**Leia antes:** o [README](README.md) desta pasta. Spec: história 43, “Detalhe e formulário do evento”. TDD: checks de `events` sobre o evento longo. Glossário: Evento longo, Fim planejado.

- [ ] “Tarefa persistente” tem Sim e Não.
- [ ] Com Sim, a linha do fim planejado passa a se chamar “Previsão de entrega” e é o prazo.
- [ ] Com Sim, a recorrência some do formulário, e o evento não pode ficar sem status nem como não realizado.
- [ ] Com Sim e sem prazo, não é possível ter lembrete.
- [ ] Com Não, um bloco de mais de 31 dias é recusado com uma mensagem que sugere marcar como tarefa persistente.
- [ ] O teste de tela cobre ligar, desligar e as recusas.
- [ ] A linha desta tela em `docs/mobile-parity.md` foi atualizada, com o Android marcado como em progresso.
- [ ] Os testes novos passam, e `pnpm run test:unit` e `pnpm run typecheck` continuam verdes.
