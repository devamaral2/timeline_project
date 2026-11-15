# 26: Edição: tarefa persistente

**What to build:** No modo de edição, a linha “Tarefa persistente” liga e desliga o evento longo, com as regras que ele tem.

**Blocked by:** 24 (Edição: campos básicos, Descartar e Salvar)

**Status:** done

**Leia antes:** o [README](README.md) desta pasta. Spec: história 43, “Detalhe e formulário do evento”. TDD: checks de `events` sobre o evento longo. Glossário: Evento longo, Fim planejado.

- [x] “Tarefa persistente” tem Sim e Não.
- [x] Com Sim, a linha do fim planejado passa a se chamar “Previsão de entrega” e é o prazo.
- [ ] Com Sim, a recorrência some do formulário, e o evento não pode ficar sem status nem como não realizado.
  Motivo: o status (sem status e “Não realizado” recusados) está feito e testado. A recorrência ainda não existe no formulário (ticket 31); o comentário em `EventEditView.tsx` marca o lugar dela, mas a regra de ocultar falta até o ticket 31.
- [x] Com Sim e sem prazo, não é possível ter lembrete.
- [x] Com Não, um bloco de mais de 31 dias é recusado com uma mensagem que sugere marcar como tarefa persistente.
- [x] O teste de tela cobre ligar, desligar e as recusas.
- [x] A linha desta tela em `docs/mobile-parity.md` foi atualizada, com o Android marcado como em progresso.
- [x] Os testes novos passam, e `pnpm run test:unit` e `pnpm run typecheck` continuam verdes.
