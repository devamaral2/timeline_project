# 25: Edição: lembretes e tags

**What to build:** No modo de edição, o usuário adiciona e remove lembretes e tags.

**Blocked by:** 24 (Edição: campos básicos, Descartar e Salvar)

**Status:** done

**Leia antes:** o [README](README.md) desta pasta. Spec: história 45. Canvas: quadro Detalhe · edição (“Lembrar antes de” e Tags).

- [x] “Lembrar antes de” mostra um cartão pequeno por lembrete (“30 min”, “1 dia”), com remover, e um botão de adicionar.
- [x] O lembrete aceita minutos ou dias, de 1 minuto a 30 dias.
- [x] Tags são adicionadas e removidas; ao digitar, a tela sugere tags pelo começo do nome.
- [x] A tag é gravada em minúsculas e sem espaços nas pontas.
- [x] As mudanças vão no mesmo Salvar do formulário.
- [x] O teste de tela confere a sugestão e o corpo enviado.
- [x] A linha desta tela em `docs/mobile-parity.md` foi atualizada, com o Android marcado como em progresso.
- [x] Os testes novos passam, e `pnpm run test:unit` e `pnpm run typecheck` continuam verdes.
