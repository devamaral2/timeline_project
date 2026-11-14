# 49: Menu de modos na aba selecionada

**What to build:** Tocar na aba que já está selecionada abre o menu de modos, que sobe da barra inferior até o meio da tela. Tocar num modo o escolhe; tocar fora fecha.

**Blocked by:** 48 (Modo de visualização filtra as duas listas)

**Status:** ready-for-agent

**Leia antes:** o [README](README.md) desta pasta. Spec: histórias 83, 84 e 87, “Modos de visualização”. Canvas: quadro Menu de modos.

- [ ] Com a aba Agenda ou Tarefas já selecionada, tocar nela abre o menu; tocar numa aba não selecionada só navega.
- [ ] O menu cresce a partir da barra inferior, com animação, até o meio da tela; com movimento reduzido, aparece sem animação.
- [ ] Cada linha mostra os símbolos de quem está no modo (pessoa, robô ou os dois) e o nome; o modo em uso está marcado.
- [ ] Tocar num modo o aplica e fecha o menu; tocar fora ou apertar Esc fecha sem mudar.
- [ ] O menu é alcançável por teclado e anuncia o modo em uso.
- [ ] O teste de tela cobre abrir, escolher e fechar.
- [ ] A linha desta tela em `docs/mobile-parity.md` foi atualizada, com o Android marcado como em progresso.
- [ ] Os testes novos passam, e `pnpm run test:unit` e `pnpm run typecheck` continuam verdes.
