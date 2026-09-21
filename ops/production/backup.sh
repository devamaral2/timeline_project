#!/usr/bin/env bash
set -euo pipefail

source /opt/braid/env.sh
umask 077
PASSPHRASE_FILE=${BACKUP_PASSPHRASE_FILE:-/opt/braid/private/backup-passphrase}
test -r "$PASSPHRASE_FILE" || { echo "Arquivo de passphrase do backup ausente" >&2; exit 1; }
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
DEST="/opt/braid/backups/$STAMP"
mkdir -p "$DEST"

kubectl -n braid exec postgres-0 -- pg_dump -U postgres -d braid -Fc > "$DEST/braid.dump"
kubectl -n braid exec postgres-0 -- pg_dump -U postgres -d braid_auth -Fc > "$DEST/braid_auth.dump"
kubectl -n braid exec postgres-0 -- pg_dumpall -U postgres --globals-only > "$DEST/globals.sql"
kubectl -n braid get secrets -o yaml > "$DEST/timeline-secrets.yaml"
kubectl -n observability get secrets grafana-admin -o yaml > "$DEST/grafana-secret.yaml"
kubectl -n edge get secrets cloudflared-token -o yaml > "$DEST/tunnel-secret.yaml"

kubectl -n braid exec -i postgres-0 -- pg_restore --list < "$DEST/braid.dump" > "$DEST/braid-list.txt"
kubectl -n braid exec -i postgres-0 -- pg_restore --list < "$DEST/braid_auth.dump" > "$DEST/auth-list.txt"

ARCHIVE_PATHS=(private k8s bin env.sh k3s-version.txt monitoring-version.txt)
if [[ -f /opt/braid/release.env ]]; then
  ARCHIVE_PATHS+=(release.env)
fi

tar -C /opt/braid -czf "$DEST/bundle.tar.gz" \
  "backups/$STAMP/braid.dump" "backups/$STAMP/braid_auth.dump" \
  "backups/$STAMP/globals.sql" "backups/$STAMP/timeline-secrets.yaml" \
  "backups/$STAMP/grafana-secret.yaml" "backups/$STAMP/tunnel-secret.yaml" \
  "${ARCHIVE_PATHS[@]}"

openssl enc -aes-256-cbc -salt -pbkdf2 -iter 200000 \
  -pass "file:$PASSPHRASE_FILE" \
  -in "$DEST/bundle.tar.gz" -out "$DEST/bundle.tar.gz.enc"
rm -f "$DEST/bundle.tar.gz"
sha256sum "$DEST/bundle.tar.gz.enc" > "$DEST/bundle.tar.gz.enc.sha256"
printf 'Backup para copiar: %s\n' "$DEST"
