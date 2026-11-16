# 03: Varredura de resíduos com linha de base

**What to build:** Passa a existir um teste no nível do repositório que acha "event" ou "evento" usado como nome da entidade no código, nos textos, nos prompts, no esquema do banco e nas rotas da API, do web, dos contratos, da timeline, do Auth e do MCP. Ele começa com uma linha de base dos resíduos de hoje, agrupada por área, e falha se aparecer resíduo fora dela. Os próximos tickets encolhem a linha de base até zero.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

**Leia antes:** o [README](README.md). Spec: "Decisões de teste", costura 6.

- [ ] O teste cobre identificadores, nomes de arquivo e pasta, textos visíveis, prompts e instruções dos agentes, rotas e nomes no esquema do banco, em todas as áreas citadas.
- [ ] A lista de exceções é explícita e curta, cada uma com motivo: eventos de DOM e de teclado, parâmetros `event` de handlers, `text/event-stream`, migrations já aplicadas e ADRs antigas.
- [ ] A linha de base é um arquivo versionado, agrupado por área, que o teste lê; um resíduo novo fora dela faz o teste falhar com o arquivo e a linha.
- [ ] Um resíduo da linha de base que não existe mais também faz o teste falhar, pedindo para tirá-lo da linha de base (a linha de base só encolhe).
- [ ] O teste roda junto de `pnpm run test:unit` e passa no estado atual.
