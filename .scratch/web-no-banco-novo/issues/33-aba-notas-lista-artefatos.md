# 33: Aba Notas lista artefatos

**What to build:** A aba Notas passa a listar os artefatos do usuário pela rota nova, com filtros por tipo, tag e texto.

**Blocked by:** 04 (Cliente da API e API falsa: artefatos)

**Status:** ready-for-agent

**Leia antes:** o [README](README.md) desta pasta. Spec: histórias 63 e 64, “Artefatos”. Glossário: Artefato.

- [ ] A aba continua se chamando Notas e lista os artefatos do usuário, do mais recente para o mais antigo.
- [ ] As cópias derivadas não aparecem.
- [ ] Cada item mostra o nome, o tipo e as tags.
- [ ] Os filtros de tipo, tag e texto vão como parâmetros da consulta à API.
- [ ] Os estados de carregando, erro e lista vazia continuam existindo.
- [ ] O teste de tela usa a API falsa e confere a lista e os parâmetros enviados.
- [ ] A linha desta tela em `docs/mobile-parity.md` foi atualizada, com o Android marcado como em progresso.
- [ ] Os testes novos passam, e `pnpm run test:unit` e `pnpm run typecheck` continuam verdes.
