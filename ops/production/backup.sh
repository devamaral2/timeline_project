#!/usr/bin/env bash
set -euo pipefail

source /opt/braid/env.sh
umask 077
PASSPHRASE_FILE=${BACKUP_PASSPHRASE_FILE:-/opt/braid/private/backup-passphrase}
test -r "$PASSPHRASE_FILE" || { echo "Arquivo de passphrase do backup ausente" >&2; exit 1; }
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
DEST="/opt/braid/backups/$STAMP"
mkdir -p "$DEST"

# A API e o auth em SQLite (ADR 0024 e 0025): copia consistente com o banco no ar (`VACUUM INTO`, nunca o arquivo e o
# `-wal` soltos), conferida com `integrity_check` antes de sair do pod. O primeiro deploy do SQLite ainda nao tem o arquivo.
# Uso: backup_sqlite <deployment> <variavel do caminho> <arquivo de saida>; devolve 3 quando o pod ainda nao tem banco.
backup_sqlite() {
  local app=$1 variable=$2 output=$3
  timeout 600 kubectl -n braid exec deploy/"$app" -- env DB_VAR="$variable" node -e '
    const { DatabaseSync } = process.getBuiltinModule("node:sqlite");
    const fs = process.getBuiltinModule("node:fs");
    const source = process.env[process.env.DB_VAR];
    if (!source || !fs.existsSync(source)) { console.error("sem banco SQLite"); process.exit(3); }
    const target = "/data/.backup.sqlite";
    fs.rmSync(target, { force: true });
    const db = new DatabaseSync(source, { readOnly: true });
    db.prepare("VACUUM INTO ?").run(target);
    db.close();
    const copy = new DatabaseSync(target, { readOnly: true });
    const result = copy.prepare("PRAGMA integrity_check").get().integrity_check;
    copy.close();
    if (result !== "ok") { console.error("integrity_check: " + result); process.exit(1); }
  ' || return $?
  timeout 600 kubectl -n braid exec deploy/"$app" -- sh -c 'cat /data/.backup.sqlite && rm -f /data/.backup.sqlite' > "$DEST/$output"
}
SQLITE_ARCHIVE=()
for spec in "api API_DATABASE_PATH api.sqlite" "auth AUTH_DATABASE_PATH auth.sqlite"; do
  read -r app variable output <<<"$spec"
  if backup_sqlite "$app" "$variable" "$output"; then
    SQLITE_ARCHIVE+=("backups/$STAMP/$output")
  else
    rc=$?
    [[ $rc -eq 3 ]] || { echo "Backup do SQLite de $app falhou ($rc)" >&2; exit 1; }
    echo "$app ainda sem banco SQLite; backup dele pulado." >&2
  fi
done
timeout 1800 kubectl -n braid exec postgres-0 -- pg_dump -U postgres -d braid_auth -Fc > "$DEST/braid_auth.dump"
timeout 600 kubectl -n braid exec postgres-0 -- pg_dumpall -U postgres --globals-only > "$DEST/globals.sql"
kubectl -n braid get secrets -o yaml > "$DEST/timeline-secrets.yaml"
kubectl -n observability get secrets grafana-admin -o yaml > "$DEST/grafana-secret.yaml"
kubectl -n edge get secrets cloudflared-token -o yaml > "$DEST/tunnel-secret.yaml"

# `pg_restore --list` le so o cabecalho e o TOC e sai sem consumir o resto do stdin.
# Com um dump maior que o buffer do stream, o `kubectl exec -i` fica esperando para
# sempre (travou o deploy de 2026-11-25). O `cat` le o arquivo inteiro antes da
# listagem, e o `timeout` impede que outro travamento segure o deploy por uma hora.
list_dump() {
  timeout 600 kubectl -n braid exec -i postgres-0 -- sh -c \
    'f=$(mktemp) || exit 1; cat > "$f" && pg_restore --list "$f"; rc=$?; rm -f "$f"; exit $rc' \
    < "$1"
}

list_dump "$DEST/braid_auth.dump" > "$DEST/auth-list.txt"

ARCHIVE_PATHS=(private k8s bin env.sh k3s-version.txt monitoring-version.txt)
if [[ -f /opt/braid/release.env ]]; then
  ARCHIVE_PATHS+=(release.env)
fi

tar -C /opt/braid -czf "$DEST/bundle.tar.gz" \
  "${SQLITE_ARCHIVE[@]}" "backups/$STAMP/braid_auth.dump" \
  "backups/$STAMP/globals.sql" "backups/$STAMP/timeline-secrets.yaml" \
  "backups/$STAMP/grafana-secret.yaml" "backups/$STAMP/tunnel-secret.yaml" \
  "${ARCHIVE_PATHS[@]}"

openssl enc -aes-256-cbc -salt -pbkdf2 -iter 200000 \
  -pass "file:$PASSPHRASE_FILE" \
  -in "$DEST/bundle.tar.gz" -out "$DEST/bundle.tar.gz.enc"
rm -f "$DEST/bundle.tar.gz"
sha256sum "$DEST/bundle.tar.gz.enc" > "$DEST/bundle.tar.gz.enc.sha256"
printf 'Backup para copiar: %s\n' "$DEST"
