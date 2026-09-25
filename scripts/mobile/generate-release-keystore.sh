#!/usr/bin/env bash
set -euo pipefail

output_path="${1:-apps/mobile/.secrets/braid-release.jks}"
key_alias="${MOBILE_KEY_ALIAS:-braid-release}"

: "${MOBILE_KEYSTORE_PASSWORD:?Set MOBILE_KEYSTORE_PASSWORD before generating the keystore}"
: "${MOBILE_KEY_PASSWORD:?Set MOBILE_KEY_PASSWORD before generating the keystore}"

if [[ -e "$output_path" ]]; then
  echo "Refusing to overwrite existing keystore: $output_path" >&2
  exit 1
fi

mkdir -p "$(dirname "$output_path")"
keytool -genkeypair \
  -v \
  -storetype JKS \
  -keystore "$output_path" \
  -alias "$key_alias" \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000 \
  -storepass "$MOBILE_KEYSTORE_PASSWORD" \
  -keypass "$MOBILE_KEY_PASSWORD" \
  -dname "CN=Braid Mobile, OU=Mobile, O=Braid, L=Sao Paulo, ST=SP, C=BR"

chmod 600 "$output_path"
echo "Generated release keystore at $output_path"
