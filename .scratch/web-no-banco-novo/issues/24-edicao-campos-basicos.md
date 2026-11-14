# 24: Edição: campos básicos, Descartar e Salvar

**What to build:** O lápis do detalhe abre o modo de edição do evento de pessoa, em que cada campo é uma entrada e o rodapé tem só Descartar e Salvar.

**Blocked by:** 20 (Rota única de detalhe do evento)

**Status:** done

**Leia antes:** o [README](README.md) desta pasta. Spec: histórias 39 a 42 e 52, “Detalhe e formulário do evento”. Canvas: quadro Detalhe · edição.

- [x] O cabeçalho diz “Editar evento” e não tem botões; o rodapé tem só Descartar e Salvar.
- [x] São editáveis: tipo (`routine`, `meal`, `sleep`, `training`), título, status (os sete, ou sem status), prioridade (quatro níveis), início e fim planejado com data e hora, e descrição.
- [x] Um dia sem hora grava o início à meia-noite local; apagar uma data a remove do evento.
- [x] Salvar envia só os campos que mudaram, com a revisão lida, e volta para a leitura.
- [x] Diante de revisão desatualizada, a tela avisa, recarrega o evento e mantém o que o usuário digitou.
- [x] Entrada recusada pela API aparece como mensagem no formulário, sem perder o que foi digitado.
- [x] Descartar volta para a leitura sem enviar nada.
- [x] O teste de tela confere o corpo enviado e o caso de revisão desatualizada.
- [x] A linha desta tela em `docs/mobile-parity.md` foi atualizada, com o Android marcado como em progresso.
- [x] Os testes novos passam, e `pnpm run test:unit` e `pnpm run typecheck` continuam verdes.
