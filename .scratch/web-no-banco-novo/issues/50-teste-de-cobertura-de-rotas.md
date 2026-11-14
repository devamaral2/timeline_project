# 50: Teste de cobertura de rotas

**What to build:** Um teste confere que cada rota documentada da API tem uma função no cliente da API do web, para que uma rota nova não fique sem consumidor em silêncio.

**Blocked by:** 03 (Cliente da API e API falsa: eventos e tags); 04 (Cliente da API e API falsa: artefatos); 05 (Cliente da API e API falsa: séries); 06 (Cliente da API e API falsa: pedidos); 07 (Cliente da API e API falsa: arquivos do agente)

**Status:** ready-for-agent

**Leia antes:** o [README](README.md) desta pasta. Spec: “Decisões de teste” (teste de cobertura). Arte anterior: o teste que confere o catálogo do Swagger contra os controllers, na API.

- [ ] O teste lê as rotas documentadas da API e as rotas que o cliente da API do web declara.
- [ ] Uma rota documentada sem função no cliente faz o teste falhar, dizendo qual é.
- [ ] Uma função do cliente para uma rota que não existe mais também faz o teste falhar.
- [ ] As 30 rotas atuais passam.
- [ ] Os testes novos passam, e `pnpm run test:unit` e `pnpm run typecheck` continuam verdes.
