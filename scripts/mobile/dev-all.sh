#!/usr/bin/env bash
# Sobe tudo o que o app Android precisa contra o backend local, sem o web:
#   1. API e Auth (só os que ainda não estão no ar), com os segredos do 1Password;
#   2. o emulador, se nenhum aparelho estiver conectado no adb;
#   3. o `pnpm dev:mobile` (adb reverse das portas, instala e abre o app).
# Ctrl+C encerra o que este script subiu; o que já estava no ar continua.
#
# Uso: pnpm dev:mobile:all   (BRAID_AVD=<nome> escolhe o emulador)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$ROOT_DIR"

env_file="${BRAID_ENV_FILE:-.env.local}"
if [ ! -f "$env_file" ] && [ -f .env ]; then
  env_file=.env
fi

read_env() {
  local key="$1" fallback="$2" value=""
  if [ -f "$env_file" ]; then
    value="$(grep -m1 -E "^${key}=" "$env_file" | sed -E "s/^${key}=//" || true)"
  fi
  printf '%s\n' "${value:-$fallback}"
}

API_PORT="$(read_env API_PORT 3001)"
AUTH_PORT="$(read_env AUTH_PORT 3002)"
RUNTIME_DIR=".agents/runtime"
mkdir -p "$RUNTIME_DIR"

for tool in adb emulator curl; do
  command -v "$tool" >/dev/null 2>&1 || {
    echo "$tool não foi encontrado no PATH; instale o Android SDK (platform-tools e emulator)." >&2
    exit 1
  }
done

listening() { (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null; }
http_code() { curl -s -o /dev/null -w '%{http_code}' --max-time 3 "$1" || true; }

backend_pid=""
emulator_pid=""
emulator_serial=""

cleanup() {
  trap - EXIT INT TERM
  if [ -n "$backend_pid" ] && kill -0 "$backend_pid" 2>/dev/null; then
    echo "Encerrando API e Auth..."
    kill -TERM -- "-$backend_pid" 2>/dev/null || true
  fi
  if [ -n "$emulator_pid" ] && kill -0 "$emulator_pid" 2>/dev/null; then
    echo "Encerrando o emulador..."
    adb -s "$emulator_serial" emu kill >/dev/null 2>&1 || kill "$emulator_pid" 2>/dev/null || true
  fi
}
trap cleanup EXIT
trap 'exit 130' INT TERM

# 1. API e Auth -------------------------------------------------------------
filters=()
listening "$API_PORT" || filters+=("--filter=@repo/api")
listening "$AUTH_PORT" || filters+=("--filter=@repo/auth")

if [ "${#filters[@]}" -eq 0 ]; then
  echo "API (${API_PORT}) e Auth (${AUTH_PORT}) já estão no ar; reaproveitando."
else
  echo "Subindo ${filters[*]#--filter=}..."
  # setsid dá ao backend um grupo de processos próprio: o Ctrl+C do terminal
  # passa pelo trap acima, que encerra o grupo inteiro (1Password, turbo, tsx).
  setsid node scripts/onepassword/exec.mjs turbo run dev "${filters[@]}" < /dev/null &
  backend_pid=$!
fi

# 2. Emulador (em paralelo com o backend) ------------------------------------
connected_device() { adb devices | awk 'NR > 1 && $2 == "device" { print $1; exit }'; }

if [ -n "$(connected_device)" ]; then
  echo "Aparelho conectado: $(connected_device)."
else
  avd="${BRAID_AVD:-$(emulator -list-avds 2>/dev/null | head -n1)}"
  [ -n "$avd" ] || {
    echo "Nenhum aparelho conectado e nenhum emulador criado (crie um AVD no Android Studio)." >&2
    exit 1
  }
  echo "Abrindo o emulador $avd (log: $RUNTIME_DIR/emulator.log)..."
  emulator -avd "$avd" > "$RUNTIME_DIR/emulator.log" 2>&1 < /dev/null &
  emulator_pid=$!
fi

# 3. Espera os dois ----------------------------------------------------------
if [ -n "$backend_pid" ]; then
  for _ in $(seq 1 90); do
    kill -0 "$backend_pid" 2>/dev/null || { echo "API/Auth pararam ao subir; veja o log acima." >&2; exit 1; }
    if [ "$(http_code "http://127.0.0.1:${AUTH_PORT}/health/ready")" = "200" ] \
       && [ "$(http_code "http://127.0.0.1:${API_PORT}/")" != "000" ]; then
      break
    fi
    sleep 2
  done
  [ "$(http_code "http://127.0.0.1:${AUTH_PORT}/health/ready")" = "200" ] || {
    echo "API/Auth não ficaram prontos a tempo." >&2
    exit 1
  }
  echo "API (${API_PORT}) e Auth (${AUTH_PORT}) no ar."
fi

if [ -n "$emulator_pid" ]; then
  for _ in $(seq 1 90); do
    kill -0 "$emulator_pid" 2>/dev/null || {
      echo "O emulador fechou ao abrir; veja $RUNTIME_DIR/emulator.log." >&2
      exit 1
    }
    emulator_serial="$(adb devices | awk 'NR > 1 && $1 ~ /^emulator-/ { print $1; exit }')"
    if [ -n "$emulator_serial" ] \
       && [ "$(adb -s "$emulator_serial" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = "1" ]; then
      break
    fi
    sleep 2
  done
  [ -n "$emulator_serial" ] || { echo "O emulador não terminou o boot a tempo." >&2; exit 1; }
  echo "Emulador $emulator_serial pronto."
fi

# 4. Aparelho desbloqueado --------------------------------------------------
# Com PIN ou padrão, o Android só libera os apps depois do primeiro desbloqueio
# (usuário RUNNING_LOCKED); antes disso o `am start` diz que a activity não existe.
target="${emulator_serial:-$(connected_device)}"
user_unlocked() {
  adb -s "$target" shell dumpsys user 2>/dev/null | grep -q "RUNNING_UNLOCKED"
}
if ! user_unlocked; then
  adb -s "$target" shell input keyevent KEYCODE_WAKEUP >/dev/null 2>&1 || true
  echo "Desbloqueie a tela de $target para o app abrir..."
  until user_unlocked; do
    sleep 2
  done
fi

# 5. adb reverse + instala e abre o app ------------------------------------
ANDROID_SERIAL="$target" bash "$SCRIPT_DIR/dev.sh"

if [ -z "$backend_pid" ] && [ -z "$emulator_pid" ]; then
  exit 0
fi
echo
echo "App aberto em $target. Ctrl+C encerra o que este comando subiu."
if [ -n "$backend_pid" ]; then
  wait "$backend_pid"
else
  wait "$emulator_pid"
fi
