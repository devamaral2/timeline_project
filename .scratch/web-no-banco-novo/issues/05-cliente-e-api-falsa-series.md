# 05: Cliente da API e API falsa: séries

**What to build:** O cliente da API ganha as funções de séries, e a API falsa passa a responder a elas.

**Blocked by:** 03 (Cliente da API e API falsa: eventos e tags)

**Status:** ready-for-agent

**Leia antes:** o [README](README.md) desta pasta. Spec: “Cliente da API”. TDD: “Recorrência”.

- [ ] Há funções para: listar, ler, criar, editar e apagar uma série.
- [ ] Criar envia `Idempotency-Key`; editar envia `expectedRevision` e só os campos da regra que mudam.
- [ ] A API falsa guarda as séries, incrementa a revisão e responde revisão desatualizada e não encontrado.
- [ ] Corpos e respostas são conferidos contra os esquemas do contrato, e os testes do cliente rodam contra a API falsa.
- [ ] Os testes novos passam, e `pnpm run test:unit` e `pnpm run typecheck` continuam verdes.
