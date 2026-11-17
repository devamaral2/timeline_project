# 04: Cliente da API e API falsa: artefatos

**What to build:** O cliente da API ganha as funções de artefatos, e a API falsa passa a responder a elas.

**Blocked by:** 03 (Cliente da API e API falsa: eventos e tags)

**Status:** done

**Leia antes:** o [README](README.md) desta pasta. Spec: “Cliente da API”, “Artefatos”. Glossário: Artefato, Artefato global, Alimento.

- [x] Há funções para: listar artefatos (filtros `type`, `scope`, `tag`, `q`, `eventId`), ler, criar, editar e apagar.
- [x] Criar envia `Idempotency-Key`; editar envia `expectedRevision`.
- [x] Na API falsa, a lista não devolve as cópias derivadas, e `scope=global` com `type` devolve só os artefatos globais daquele tipo.
- [x] Na API falsa, a leitura de um artefato traz os eventos em que ele aparece.
- [x] Na API falsa, um artefato global não pode ser editado nem apagado.
- [x] Corpos e respostas são conferidos contra os esquemas do contrato, e os testes do cliente rodam contra a API falsa.
- [x] Os testes novos passam, e `pnpm run test:unit` e `pnpm run typecheck` continuam verdes.
