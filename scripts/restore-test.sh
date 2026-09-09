#!/usr/bin/env bash
set -euo pipefail

: "${JARVIS_BACKUP_FILE:?Defina JARVIS_BACKUP_FILE com o arquivo .dump.age.}"
: "${BACKUP_AGE_IDENTITY:?Defina BACKUP_AGE_IDENTITY com a chave privada age.}"

case "$JARVIS_BACKUP_FILE" in *.dump.age) ;; *) echo 'O backup deve terminar em .dump.age.' >&2; exit 2;; esac
test -f "$JARVIS_BACKUP_FILE"
command -v age >/dev/null
command -v docker >/dev/null
command -v pg_restore >/dev/null

temp_dir="$(mktemp -d)"
container="jarvis-restore-$RANDOM-$$"
cleanup() {
  docker rm -f "$container" >/dev/null 2>&1 || true
  rm -rf -- "$temp_dir"
}
trap cleanup EXIT

umask 077
age --decrypt --identity "$BACKUP_AGE_IDENTITY" \
  --output "$temp_dir/jarvis.dump" "$JARVIS_BACKUP_FILE"
pg_restore --list "$temp_dir/jarvis.dump" >/dev/null

docker run --detach --name "$container" \
  -e POSTGRES_PASSWORD=jarvis_restore_only \
  -e POSTGRES_DB=jarvis_restore \
  -p 127.0.0.1::5432 postgres:17-alpine >/dev/null
port="$(docker port "$container" 5432/tcp | sed 's/.*://')"
for _ in $(seq 1 60); do
  docker exec "$container" pg_isready -U postgres -d jarvis_restore >/dev/null 2>&1 && break
  sleep 1
done
docker exec "$container" pg_isready -U postgres -d jarvis_restore >/dev/null

PGPASSWORD=jarvis_restore_only pg_restore \
  --host=127.0.0.1 --port="$port" --username=postgres --dbname=jarvis_restore \
  --no-owner --no-acl --exit-on-error "$temp_dir/jarvis.dump"

docker exec "$container" psql -U postgres -d jarvis_restore -v ON_ERROR_STOP=1 -Atc \
  "select case when to_regclass('public.transactions') is not null
                    and to_regclass('public.jarvis_files') is not null
                    and to_regclass('public.jarvis_memories') is not null
                    and exists (select 1 from pg_class where oid='public.jarvis_files'::regclass and relrowsecurity)
               then 'RESTORE_OK' else (1/0)::text end;"

