# 37: Arquivo do agente: texto atual

**What to build:** O dono abre uma skill ou um agente do Hermes e lê o texto atual do arquivo. Quem não é o dono não vê as ações de arquivo.

**Blocked by:** 34 (Detalhe do artefato); 07 (Cliente da API e API falsa: arquivos do agente)

**Status:** ready-for-agent

**Leia antes:** o [README](README.md) desta pasta. Spec: histórias 78 e 81, “Artefatos” (último item). ADR 0005.

- [ ] No detalhe de um artefato de skill ou de agente, o dono vê o texto atual do arquivo.
- [ ] Se o arquivo sumiu da pasta, o detalhe mostra o último texto conhecido e avisa que o arquivo não está mais lá.
- [ ] Para quem não é o dono, a API responde sem permissão e o detalhe mostra só o que o artefato já traz, sem erro na tela.
- [ ] O teste de tela cobre o dono, o arquivo ausente e quem não é o dono.
- [ ] A linha desta tela em `docs/mobile-parity.md` foi atualizada, com o Android marcado como em progresso.
- [ ] Os testes novos passam, e `pnpm run test:unit` e `pnpm run typecheck` continuam verdes.
