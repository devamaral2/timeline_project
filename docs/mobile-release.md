# Braid Mobile — assinatura do release

O APK de release é assinado fora do repositório. O arquivo do keystore e suas
senhas devem ficar no 1Password; o GitHub Actions recebe somente os valores
necessários através de Secrets.

## Gerar uma versão nova

```bash
pnpm release:mobile                # testes do mobile, build assinado e conferência
pnpm release:mobile --skip-tests   # sem os testes
pnpm release:mobile --install      # e instala no aparelho visível no `adb devices`
pnpm release:mobile --bump patch   # sobe a versão base (patch, minor ou major)
pnpm release:mobile --drive        # e envia o APK para o Google Drive
```

A skill `/publicar-mobile` roda `--bump patch --drive` (ou a parte que você passar).

O script (`scripts/mobile/release.sh`) lê as seis variáveis do ambiente e completa
o que faltar com `apps/mobile/.secrets/release.env` (fora do Git, uma linha
`CHAVE=valor` por variável; outro arquivo com `BRAID_MOBILE_RELEASE_ENV`). Cada
execução recebe um `versionCode` maior que o anterior (minutos desde
2024-01-01 UTC), então o APK instala por cima da versão já instalada, e um
`versionName` com a data (`0.1.0-20261117.2338`, a base vem de
`apps/mobile/package.json`). Depois do build ele confere a assinatura contra o
keystore, a versão e as URLs de produção dentro do APK (e que não sobrou
`localhost`), e copia o resultado para `dist/mobile/braid-<versão>.apk` e
`dist/mobile/braid-latest.apk`. Mudanças não commitadas em `apps/mobile` ou
`packages` entram no APK; o script avisa quando há alguma.

## Google Drive

O `--drive` envia `braid-<versão>.apk` e `braid-latest.apk` para a pasta
`Braid/APKs` (`BRAID_DRIVE_FOLDER`) do remote `gdrive` (`BRAID_DRIVE_REMOTE`)
do rclone e mostra o link do arquivo. O remote é conferido antes do build. A
versão nova só é gravada em `apps/mobile/package.json` depois que o APK passa
na conferência, e fica sem commit.

Configuração única por máquina:

```bash
sudo pacman -S rclone
```

```bash
rclone config create gdrive drive scope=drive.file
```

O segundo comando abre o navegador para o login no Google. O escopo
`drive.file` só dá ao rclone acesso aos arquivos que ele mesmo criou.

## Gerar o keystore uma única vez

Defina senhas fortes e mantenha-as no item do 1Password antes de executar:

```bash
export MOBILE_KEYSTORE_PASSWORD='senha-do-keystore'
export MOBILE_KEY_PASSWORD='senha-da-chave'
export MOBILE_KEY_ALIAS='braid-release'
scripts/mobile/generate-release-keystore.sh
```

Guarde `apps/mobile/.secrets/braid-release.jks` no item de assinatura do Braid
Mobile no 1Password. Não faça commit do arquivo nem das senhas.

## Configurar o GitHub Actions

Crie estes Secrets no repositório, usando o mesmo item do 1Password:

- `MOBILE_KEYSTORE_BASE64`: conteúdo base64 do arquivo `.jks` (por exemplo,
  `base64 -w0 apps/mobile/.secrets/braid-release.jks`)
- `MOBILE_KEYSTORE_PASSWORD`
- `MOBILE_KEY_ALIAS`
- `MOBILE_KEY_PASSWORD`
- `MOBILE_API_BASE_URL`: URL HTTPS real da API de produção
- `MOBILE_AUTH_BASE_URL`: URL HTTPS real do auth de produção

Quando uma alteração do mobile chegar à `main`, o job `mobile-release` decodifica
o keystore apenas no diretório temporário do runner, executa `assembleRelease` e
publica o APK assinado como artifact `braid-mobile-release`. Nenhum APK é
publicado automaticamente na Play Store.

## Build local assinado

```bash
export MOBILE_KEYSTORE_PATH="$PWD/apps/mobile/.secrets/braid-release.jks"
export MOBILE_KEYSTORE_PASSWORD='senha-do-keystore'
export MOBILE_KEY_ALIAS='braid-release'
export MOBILE_KEY_PASSWORD='senha-da-chave'
export MOBILE_API_BASE_URL='https://api.seu-dominio.tld'
export MOBILE_AUTH_BASE_URL='https://auth.seu-dominio.tld'
cd apps/mobile
./gradlew assembleRelease
```

Sem as seis variáveis, `assembleRelease` falha intencionalmente para impedir
que um APK sem assinatura ou apontando para um placeholder seja gerado por
engano.

## Validação manual contra produção

Esta etapa exige um domínio de produção real, um dispositivo/emulador Android
conectado e uma conta de teste. O repositório não contém credenciais nem
assume um domínio; `api.SEUDOMINIO` e `auth.SEUDOMINIO` são rejeitados pelo
build de release.

Com o APK assinado gerado e o dispositivo visível em `adb devices`:

```bash
adb install -r apps/mobile/app/build/outputs/apk/release/app-release.apk
adb shell am start -n app.braid.mobile/.MainActivity
```

Faça login com a conta de teste e percorra todos os itens de
[`docs/mobile-parity.md`](mobile-parity.md), registrando no issue RAF-178 cada
divergência encontrada. Inclua pelo menos: agenda, criação/edição/exclusão,
tags, voz, lembretes, chat e histórico.
