#!/usr/bin/env bash
# Gera um APK de release assinado, com versão nova a cada execução, em dist/mobile/.
#
#   pnpm release:mobile                  # testes do mobile + build + conferência
#   pnpm release:mobile --skip-tests     # só build + conferência
#   pnpm release:mobile --install        # e instala no aparelho visível no `adb devices`
#   pnpm release:mobile --bump patch     # sobe a versão de apps/mobile/package.json (patch, minor ou major)
#   pnpm release:mobile --drive          # e envia o APK para o Google Drive pelo rclone
#
# O --drive usa o remote BRAID_DRIVE_REMOTE (padrão gdrive) e a pasta BRAID_DRIVE_FOLDER
# (padrão Braid/APKs); a configuração única do rclone está em docs/mobile-release.md.
#
# A assinatura e as URLs de produção vêm do ambiente ou, para o que faltar, de
# apps/mobile/.secrets/release.env (fora do Git; outro arquivo com BRAID_MOBILE_RELEASE_ENV):
#   MOBILE_KEYSTORE_PATH, MOBILE_KEYSTORE_PASSWORD, MOBILE_KEY_ALIAS, MOBILE_KEY_PASSWORD,
#   MOBILE_API_BASE_URL, MOBILE_AUTH_BASE_URL
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$ROOT_DIR"

run_tests=1
install=0
bump=""
drive=0
while [ $# -gt 0 ]; do
  case "$1" in
    --skip-tests) run_tests=0 ;;
    --install) install=1 ;;
    --drive) drive=1 ;;
    --bump)
      [ $# -ge 2 ] || { echo "--bump pede patch, minor ou major." >&2; exit 2; }
      bump="$2"
      shift
      ;;
    --bump=*) bump="${1#--bump=}" ;;
    -h | --help)
      sed -n '2,16p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "Opção desconhecida: $1 (use --skip-tests, --install, --bump, --drive ou --help)" >&2
      exit 2
      ;;
  esac
  shift
done

fail() {
  echo "✗ $*" >&2
  exit 1
}

case "$bump" in
  "" | patch | minor | major) ;;
  *) fail "--bump aceita patch, minor ou major (recebeu '$bump')." ;;
esac

# --- Google Drive: conferido antes do build, para não gastar um build que não vai subir. --------
drive_remote="${BRAID_DRIVE_REMOTE:-gdrive}"
drive_folder="${BRAID_DRIVE_FOLDER:-Braid/APKs}"
if [ "$drive" -eq 1 ]; then
  command -v rclone >/dev/null || fail "O --drive precisa do rclone (sudo pacman -S rclone). Veja docs/mobile-release.md."
  remotes="$(rclone listremotes)"
  grep -qx "${drive_remote}:" <<<"$remotes" ||
    fail "O rclone não tem o remote '${drive_remote}'. Crie com: rclone config create ${drive_remote} drive scope=drive.file"
fi

# --- Configuração: o ambiente vence; o arquivo completa o que faltar. -------------------------
env_file="${BRAID_MOBILE_RELEASE_ENV:-apps/mobile/.secrets/release.env}"
required=(MOBILE_KEYSTORE_PATH MOBILE_KEYSTORE_PASSWORD MOBILE_KEY_ALIAS MOBILE_KEY_PASSWORD MOBILE_API_BASE_URL MOBILE_AUTH_BASE_URL)
if [ -f "$env_file" ]; then
  for key in "${required[@]}"; do
    if [ -z "${!key:-}" ]; then
      value="$(grep -m1 -E "^${key}=" "$env_file" | cut -d= -f2- || true)"
      [ -n "$value" ] && export "$key=$value"
    fi
  done
fi
missing=()
for key in "${required[@]}"; do
  [ -n "${!key:-}" ] || missing+=("$key")
done
[ ${#missing[@]} -eq 0 ] || fail "Faltam ${missing[*]} (no ambiente ou em $env_file). Veja docs/mobile-release.md."
[ -f "$MOBILE_KEYSTORE_PATH" ] || fail "O keystore não está em $MOBILE_KEYSTORE_PATH."
for key in MOBILE_API_BASE_URL MOBILE_AUTH_BASE_URL; do
  [[ "${!key}" == https://* ]] || fail "$key precisa começar com https://."
done

# --- Android SDK ------------------------------------------------------------------------------
sdk="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"
if [ -z "$sdk" ] && [ -f apps/mobile/local.properties ]; then
  sdk="$(grep -m1 '^sdk.dir=' apps/mobile/local.properties | cut -d= -f2- || true)"
fi
sdk="${sdk:-$HOME/Android/Sdk}"
build_tools="$(find "$sdk/build-tools" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | sort -V | tail -1)"
[ -n "$build_tools" ] || fail "Não achei o build-tools do Android SDK em $sdk."

# --- Versão: sempre maior que a anterior, sem editar arquivo nenhum. ---------------------------
# versionCode = minutos desde 2024-01-01 UTC (cresce a cada build e fica abaixo do limite do Android por milênios).
version_code=$(($(date -u +%s) / 60 - 28401120))
current_version="$(grep -m1 '"version"' apps/mobile/package.json | sed -E 's/.*"version": *"([^"]+)".*/\1/')"
version_base="$current_version"
if [ -n "$bump" ]; then
  [[ "$current_version" =~ ^([0-9]+)\.([0-9]+)\.([0-9]+)$ ]] ||
    fail "A versão de apps/mobile/package.json ($current_version) não é X.Y.Z."
  major="${BASH_REMATCH[1]}" minor="${BASH_REMATCH[2]}" patch="${BASH_REMATCH[3]}"
  case "$bump" in
    major) version_base="$((major + 1)).0.0" ;;
    minor) version_base="${major}.$((minor + 1)).0" ;;
    patch) version_base="${major}.${minor}.$((patch + 1))" ;;
  esac
  echo "→ Versão ${current_version} → ${version_base} (gravada em apps/mobile/package.json só se o APK sair)"
fi
version_name="${version_base}-$(date +%Y%m%d.%H%M)"

if [ -n "$(git status --porcelain -- apps/mobile packages 2>/dev/null)" ]; then
  echo "! Há mudanças não commitadas em apps/mobile ou packages: elas entram neste APK."
fi
echo "→ Braid ${version_name} (versionCode ${version_code}) para ${MOBILE_API_BASE_URL}"

# --- Testes e build ---------------------------------------------------------------------------
if [ "$run_tests" -eq 1 ]; then
  echo "→ Testes do mobile"
  pnpm --filter @repo/mobile run test
fi

echo "→ assembleRelease"
(
  cd apps/mobile
  ./gradlew assembleRelease --quiet \
    -Pbraid.versionCode="$version_code" \
    -Pbraid.versionName="$version_name"
)
apk="apps/mobile/app/build/outputs/apk/release/app-release.apk"
[ -f "$apk" ] || fail "O Gradle terminou sem gerar $apk."

# --- Conferência: assinatura, versão e URLs dentro do APK. -------------------------------------
echo "→ Conferindo o APK"
"$build_tools/apksigner" verify "$apk" >/dev/null || fail "A assinatura do APK não confere."
# Cada saída é lida inteira antes da busca: com `pipefail`, um `grep -q` que para cedo derruba o comando da esquerda.
certs="$("$build_tools/apksigner" verify --print-certs "$apk")"
signer="$(awk '/SHA-256/ {print $NF; exit}' <<<"$certs")"
keystore_info="$(keytool -list -keystore "$MOBILE_KEYSTORE_PATH" -storepass "$MOBILE_KEYSTORE_PASSWORD" -alias "$MOBILE_KEY_ALIAS" 2>/dev/null)"
expected="$(awk '/SHA-256/ {print $NF; exit}' <<<"$keystore_info" | tr -d ':' | tr 'A-F' 'a-f')"
[ -n "$signer" ] && [ "$signer" = "$expected" ] || fail "O APK não foi assinado com a chave de $MOBILE_KEYSTORE_PATH."
badging="$("$build_tools/aapt2" dump badging "$apk")"
grep -q "versionCode='${version_code}'" <<<"$badging" || fail "O APK saiu sem a versão ${version_code}."
dex="$(unzip -p "$apk" 'classes*.dex' | strings)"
grep -qF "$MOBILE_API_BASE_URL" <<<"$dex" || fail "O APK não contém $MOBILE_API_BASE_URL."
grep -qF "$MOBILE_AUTH_BASE_URL" <<<"$dex" || fail "O APK não contém $MOBILE_AUTH_BASE_URL."
if grep -qE 'localhost:300[12]' <<<"$dex"; then fail "O APK ainda aponta para localhost."; fi

mkdir -p dist/mobile
out="dist/mobile/braid-${version_name}.apk"
cp "$apk" "$out"
cp "$apk" dist/mobile/braid-latest.apk
echo "✓ $out ($(du -h "$out" | cut -f1)), também em dist/mobile/braid-latest.apk"

if [ "$version_base" != "$current_version" ]; then
  sed -i -E "0,/\"version\": *\"[^\"]+\"/s//\"version\": \"${version_base}\"/" apps/mobile/package.json
  echo "✓ apps/mobile/package.json agora em ${version_base} (não commitado)"
fi

# --- Envio para o Google Drive ----------------------------------------------------------------
if [ "$drive" -eq 1 ]; then
  name="$(basename "$out")"
  echo "→ Enviando para ${drive_remote}:${drive_folder}"
  rclone copyto "$out" "${drive_remote}:${drive_folder}/${name}" ||
    fail "O envio falhou; repita com: rclone copyto $out ${drive_remote}:${drive_folder}/${name}"
  rclone copyto "$out" "${drive_remote}:${drive_folder}/braid-latest.apk" ||
    fail "O envio de braid-latest.apk falhou; ${name} já está no Drive."
  listing="$(rclone lsjson "${drive_remote}:${drive_folder}/${name}")"
  file_id="$(grep -oE '"ID":"[^"]+"' <<<"$listing" | head -1 | cut -d'"' -f4)"
  if [ -n "$file_id" ]; then
    echo "✓ No Drive: ${drive_folder}/${name} — https://drive.google.com/file/d/${file_id}/view"
  else
    echo "✓ No Drive: ${drive_folder}/${name}"
  fi
fi

# --- Instalação opcional ----------------------------------------------------------------------
if [ "$install" -eq 1 ]; then
  if adb get-state >/dev/null 2>&1; then
    echo "→ Instalando no aparelho"
    adb install -r "$out"
  else
    echo "! Nenhum aparelho no adb: instale $out pelo Drive ou pelo Meus Arquivos."
  fi
fi
