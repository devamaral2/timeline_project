---
name: publicar-mobile
description: Sobe a versão do app Android, gera o APK de release assinado e envia para o Google Drive.
disable-model-invocation: true
---

# Publicar o mobile

O trabalho todo está em `pnpm release:mobile` (`scripts/mobile/release.sh`); esta skill escolhe as
opções, roda e relata. `--help` do script lista as opções.

1. **Parte da versão.** Use o argumento da skill (`patch`, `minor` ou `major`); sem argumento, `patch`.
   Pule os testes (`--skip-tests`) só se o usuário pedir.
2. **Pré-voo.** `command -v rclone` e `rclone listremotes` precisam mostrar o remote `gdrive:`
   (ou o de `BRAID_DRIVE_REMOTE`). Faltando, pare e passe ao usuário os dois passos únicos de
   "Google Drive" em `docs/mobile-release.md`: são dele (sudo e login no navegador). Concluído quando
   o remote aparece na lista.
3. **Rodar** em segundo plano (testes + Gradle passam de 2 minutos):
   `pnpm release:mobile --bump <parte> --drive`. Concluído quando a saída termina em
   `✓ No Drive: …` ou num `✗`.
4. **Relatar**: versão antiga → nova, `versionCode`, caminho em `dist/mobile/`, o link do Drive, e
   se o script avisou de mudanças não commitadas em `apps/mobile`/`packages` (elas entraram no APK).
   O bump de `apps/mobile/package.json` fica sem commit; ofereça o commit
   `chore(mobile): release <versão>`.

Num `✗`: a versão só é gravada depois que o APK é conferido, então falha de teste, build ou
assinatura não deixa bump para trás. Falha no envio deixa o APK e o bump prontos; o próprio `✗`
traz o `rclone copyto` para repetir só o envio.
