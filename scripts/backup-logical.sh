#!/usr/bin/env bash
set -euo pipefail

: "${SUPABASE_DB_URL:?Defina SUPABASE_DB_URL com a connection string do banco.}"
: "${BACKUP_AGE_IDENTITY:?Defina BACKUP_AGE_IDENTITY com o caminho da identidade age.}"

command -v pg_dump >/dev/null
command -v psql >/dev/null
command -v age >/dev/null
command -v age-keygen >/dev/null
command -v sha256sum >/dev/null
command -v tar >/dev/null
command -v cmp >/dev/null

pg_major="$(pg_dump --version | sed -E 's/.* ([0-9]+)(\..*)?$/\1/')"
if [[ "$pg_major" != "17" ]]; then
  echo "pg_dump 17 e obrigatorio; encontrado: $(pg_dump --version)" >&2
  exit 2
fi

test -f "$BACKUP_AGE_IDENTITY"
recipient="$(age-keygen -y "$BACKUP_AGE_IDENTITY")"
[[ "$recipient" == age1* ]]

backup_root="${JARVIS_BACKUP_DIR:-./backups}"
mkdir -p "$backup_root"
chmod 700 "$backup_root"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
final_file="$backup_root/jarvis-$stamp.tar.age"
temp_dir="$(mktemp -d)"
trap 'rm -rf -- "$temp_dir"' EXIT

umask 077
export PGDATABASE="$SUPABASE_DB_URL"
export PGOPTIONS="${PGOPTIONS:--c default_transaction_read_only=on}"

server_major="$(psql -Atqc "select current_setting('server_version_num')::int / 10000")"
if [[ "$server_major" != "17" ]]; then
  echo "O banco de origem precisa ser PostgreSQL 17; encontrado major $server_major." >&2
  exit 2
fi

write_counts() {
  local output_file="$1"
  psql -At -F $'\t' > "$output_file" <<'SQL'
select 'auth.users', count(*) from auth.users
union all select 'public.accounts', count(*) from public.accounts
union all select 'public.categories', count(*) from public.categories
union all select 'public.transactions', count(*) from public.transactions
union all select 'public.jarvis_actions', count(*) from public.jarvis_actions
union all select 'public.jarvis_files', count(*) from public.jarvis_files
union all select 'public.jarvis_memories', count(*) from public.jarvis_memories
union all select 'public.jarvis_messages', count(*) from public.jarvis_messages
union all select 'public.jarvis_connection_secrets', count(*) from public.jarvis_connection_secrets
union all select 'storage.buckets', count(*) from storage.buckets
union all select 'storage.objects', count(*) from storage.objects
union all select 'supabase_migrations.schema_migrations', count(*) from supabase_migrations.schema_migrations
order by 1;
SQL
}

write_counts "$temp_dir/source-counts-before.tsv"
pg_dump \
  --format=custom --compress=9 --no-owner --no-acl \
  --schema=public --schema=auth --schema=storage --schema=supabase_migrations \
  --file="$temp_dir/jarvis.dump"
pg_restore --list "$temp_dir/jarvis.dump" > "$temp_dir/contents.txt"
grep -Eq 'SCHEMA +public' "$temp_dir/contents.txt"
grep -Eq 'TABLE DATA +public +transactions' "$temp_dir/contents.txt"
grep -Eq 'TABLE DATA +auth +users' "$temp_dir/contents.txt"
grep -Eq 'TABLE DATA +storage +objects' "$temp_dir/contents.txt"
grep -Eq 'TABLE DATA +supabase_migrations +schema_migrations' "$temp_dir/contents.txt"

write_counts "$temp_dir/source-counts.tsv"
if ! cmp -s "$temp_dir/source-counts-before.tsv" "$temp_dir/source-counts.tsv"; then
  echo 'A origem mudou durante o dump; execute novamente para obter evidencia consistente.' >&2
  exit 1
fi

cat > "$temp_dir/manifest.txt" <<EOF
format=jarvis-logical-backup-v2
created_at_utc=$stamp
postgres_client_major=$pg_major
postgres_source_major=$server_major
schemas=public,auth,storage,supabase_migrations
archive=jarvis.dump
counts=source-counts.tsv
EOF

tar -C "$temp_dir" -cf "$temp_dir/jarvis-backup.tar" \
  jarvis.dump contents.txt source-counts.tsv manifest.txt
age --recipient "$recipient" \
  --output "$final_file" "$temp_dir/jarvis-backup.tar"
(
  cd "$backup_root"
  sha256sum "$(basename "$final_file")" > "$(basename "$final_file").sha256"
)
chmod 600 "$final_file" "$final_file.sha256"
printf '%s\n' "$final_file"
