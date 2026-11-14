# 35: Nota de texto: criar, editar e apagar

**What to build:** O usuário cria uma nota de texto, edita o nome, o conteúdo e as tags, e a apaga.

**Blocked by:** 34 (Detalhe do artefato)

**Status:** ready-for-agent

**Leia antes:** o [README](README.md) desta pasta. Spec: histórias 65, 68 e 70. Glossário: Artefato (a nota é o artefato de texto).

- [ ] Criar uma nota cria um artefato de texto; tocar em salvar duas vezes cria um só.
- [ ] Editar envia a revisão lida e o conteúdo novo inteiro.
- [ ] Diante de revisão desatualizada, a tela avisa, recarrega e mantém o que o usuário digitou.
- [ ] Apagar tem confirmação e volta para a lista.
- [ ] O teste de tela confere os corpos enviados e o caso de revisão desatualizada.
- [ ] A linha desta tela em `docs/mobile-parity.md` foi atualizada, com o Android marcado como em progresso.
- [ ] Os testes novos passam, e `pnpm run test:unit` e `pnpm run typecheck` continuam verdes.
