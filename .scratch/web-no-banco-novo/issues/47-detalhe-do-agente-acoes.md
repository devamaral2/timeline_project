# 47: Detalhe do evento de agente: cancelar, falha e continuar

**What to build:** No detalhe de um pedido, o usuário cancela o que está em andamento, vê o motivo de uma falha e continua a conversa pelo campo do rodapé.

**Blocked by:** 45 (Detalhe do evento de agente: Informações, Passos e Registro)

**Status:** ready-for-agent

**Leia antes:** o [README](README.md) desta pasta. Spec: histórias 59 a 61, “Detalhe do evento de agente”. Canvas: quadro Detalhe · agente (rodapé).

- [ ] A linha de status do campo do agente mostra o andamento e “Cancelar pedido”, só com o pedido em aberto.
- [ ] Cancelar chama a API e o detalhe passa a mostrar o pedido cancelado.
- [ ] Se a API responder que o pedido calcula um alimento, a tela diz que é preciso apagar o artefato para interrompê-lo.
- [ ] Um pedido que falhou mostra o motivo conforme o código do erro.
- [ ] Enviar pelo campo do rodapé abre um pedido na mesma sessão, e a linha de status passa a acompanhá-lo.
- [ ] O teste de tela cobre cancelar, a falha e a continuação.
- [ ] A linha desta tela em `docs/mobile-parity.md` foi atualizada, com o Android marcado como em progresso.
- [ ] Os testes novos passam, e `pnpm run test:unit` e `pnpm run typecheck` continuam verdes.
