# Braid Mobile — assinatura do release

O APK de release é assinado fora do repositório. O arquivo do keystore e suas
senhas devem ficar no 1Password; o GitHub Actions recebe somente os valores
necessários através de Secrets.

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
