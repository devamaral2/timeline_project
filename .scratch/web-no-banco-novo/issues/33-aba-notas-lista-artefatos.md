# 33: Aba Notas lista artefatos

**What to build:** A aba Notas passa a listar os artefatos do usuário pela rota nova, com filtros por tipo, tag e texto.

**Blocked by:** 04 (Cliente da API e API falsa: artefatos)

**Status:** done

**Leia antes:** o [README](README.md) desta pasta. Spec: histórias 63 e 64, “Artefatos”. Glossário: Artefato.

- [x] A aba continua se chamando Notas e lista os artefatos do usuário, do mais recente para o mais antigo.
- [x] As cópias derivadas não aparecem.
- [x] Cada item mostra o nome, o tipo e as tags.
- [x] Os filtros de tipo, tag e texto vão como parâmetros da consulta à API.
- [x] Os estados de carregando, erro e lista vazia continuam existindo.
- [x] O teste de tela usa a API falsa e confere a lista e os parâmetros enviados.
- [x] A linha desta tela em `docs/mobile-parity.md` foi atualizada, com o Android marcado como em progresso.
- [x] Os testes novos passam, e `pnpm run test:unit` e `pnpm run typecheck` continuam verdes.
