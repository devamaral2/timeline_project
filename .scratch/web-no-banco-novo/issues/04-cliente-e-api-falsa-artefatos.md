# 04: Cliente da API e API falsa: artefatos

**What to build:** O cliente da API ganha as funções de artefatos, e a API falsa passa a responder a elas.

**Blocked by:** 03 (Cliente da API e API falsa: eventos e tags)

**Status:** ready-for-agent

**Leia antes:** o [README](README.md) desta pasta. Spec: “Cliente da API”, “Artefatos”. Glossário: Artefato, Artefato global, Alimento.

- [ ] Há funções para: listar artefatos (filtros `type`, `scope`, `tag`, `q`, `eventId`), ler, criar, editar e apagar.
- [ ] Criar envia `Idempotency-Key`; editar envia `expectedRevision`.
- [ ] Na API falsa, a lista não devolve as cópias derivadas, e `scope=global` com `type` devolve só os artefatos globais daquele tipo.
- [ ] Na API falsa, a leitura de um artefato traz os eventos em que ele aparece.
- [ ] Na API falsa, um artefato global não pode ser editado nem apagado.
- [ ] Corpos e respostas são conferidos contra os esquemas do contrato, e os testes do cliente rodam contra a API falsa.
- [ ] Os testes novos passam, e `pnpm run test:unit` e `pnpm run typecheck` continuam verdes.
