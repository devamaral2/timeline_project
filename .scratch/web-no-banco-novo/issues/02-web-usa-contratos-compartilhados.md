# 02: Web usa os contratos compartilhados

**What to build:** O web passa a enxergar o pacote de contratos compartilhado, com os tipos e os esquemas, no build, no typecheck e nos testes. Nenhuma tela muda ainda: este ticket só abre o caminho para os seguintes.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

**Leia antes:** o [README](README.md) desta pasta. Spec: “Contratos no web”.

- [ ] O web declara a dependência do pacote de contratos e resolve os dois pontos de entrada dele (tipos e esquemas).
- [ ] Um teste do web valida um cartão de evento de exemplo contra o esquema do contrato, provando que os esquemas carregam no ambiente de teste.
- [ ] Os tipos de fio antigos do web continuam onde estão; nada é apagado neste ticket.
- [ ] O build do web continua passando.
- [ ] Os testes novos passam, e `pnpm run test:unit` e `pnpm run typecheck` continuam verdes.
