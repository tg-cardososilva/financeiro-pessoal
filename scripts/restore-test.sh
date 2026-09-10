#!/usr/bin/env bash
set -euo pipefail

: "${JARVIS_BACKUP_FILE:?Defina JARVIS_BACKUP_FILE com o arquivo .tar.age.}"
: "${BACKUP_AGE_IDENTITY:?Defina BACKUP_AGE_IDENTITY com a chave privada age.}"
: "${JARVIS_RESTORE_DB_URL:?Defina JARVIS_RESTORE_DB_URL para um PostgreSQL 17 isolado e descartavel.}"

case "$JARVIS_BACKUP_FILE" in *.tar.age) ;; *) echo 'O backup deve terminar em .tar.age.' >&2; exit 2;; esac
test -f "$JARVIS_BACKUP_FILE"
test -f "$BACKUP_AGE_IDENTITY"
command -v age >/dev/null
command -v pg_restore >/dev/null
command -v psql >/dev/null
command -v sha256sum >/dev/null
command -v tar >/dev/null
command -v cmp >/dev/null

case "$JARVIS_RESTORE_DB_URL" in
  *qhpkraqrcvhhtbqjhkmm*|*supabase.co*)
    echo 'Recusado: o destino de restore nao pode ser o Supabase de producao.' >&2
    exit 2
    ;;
esac

pg_major="$(pg_restore --version | sed -E 's/.* ([0-9]+)(\..*)?$/\1/')"
if [[ "$pg_major" != "17" ]]; then
  echo "pg_restore 17 e obrigatorio; encontrado: $(pg_restore --version)" >&2
  exit 2
fi

temp_dir="$(mktemp -d)"
cleanup() {
  rm -rf -- "$temp_dir"
}
trap cleanup EXIT

umask 077
(
  cd "$(dirname "$JARVIS_BACKUP_FILE")"
  sha256sum --check "$(basename "$JARVIS_BACKUP_FILE").sha256" >/dev/null
)
age --decrypt --identity "$BACKUP_AGE_IDENTITY" \
  --output "$temp_dir/jarvis-backup.tar" "$JARVIS_BACKUP_FILE"
tar -C "$temp_dir" -xf "$temp_dir/jarvis-backup.tar"
grep -q '^format=jarvis-logical-backup-v2$' "$temp_dir/manifest.txt"
pg_restore --list "$temp_dir/jarvis.dump" >/dev/null

export PGDATABASE="$JARVIS_RESTORE_DB_URL"
target_major="$(psql -Atqc "select current_setting('server_version_num')::int / 10000")"
if [[ "$target_major" != "17" ]]; then
  echo "O destino precisa ser PostgreSQL 17; encontrado major $target_major." >&2
  exit 2
fi

existing_user_tables="$(psql -Atqc "select count(*) from pg_tables where schemaname not in ('pg_catalog','information_schema')")"
if [[ "$existing_user_tables" != "0" ]]; then
  echo 'Recusado: o banco temporario de restore nao esta vazio.' >&2
  exit 2
fi

psql -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
drop schema public cascade;
do $$
declare role_name text;
begin
  foreach role_name in array array[
    'anon','authenticated','service_role','authenticator',
    'supabase_admin','supabase_auth_admin','supabase_storage_admin','dashboard_user'
  ] loop
    if not exists (select 1 from pg_roles where rolname = role_name) then
      execute format('create role %I nologin', role_name);
    end if;
  end loop;
end $$;
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists "uuid-ossp" with schema extensions;
SQL

pg_restore \
  --no-owner --no-acl --exit-on-error "$temp_dir/jarvis.dump"

psql -v ON_ERROR_STOP=1 -Atqc \
  "select case when to_regclass('public.transactions') is not null
                    and to_regclass('public.jarvis_files') is not null
                    and to_regclass('public.jarvis_memories') is not null
                    and to_regclass('auth.users') is not null
                    and to_regclass('storage.objects') is not null
                    and to_regclass('supabase_migrations.schema_migrations') is not null
                    and exists (select 1 from pg_class where oid='public.jarvis_files'::regclass and relrowsecurity)
                    and exists (select 1 from pg_constraint where contype='f' and connamespace='public'::regnamespace)
               then 'RESTORE_STRUCTURE_OK' else (1/0)::text end;" >/dev/null

psql -At -F $'\t' > "$temp_dir/restored-counts.tsv" <<'SQL'
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

if ! cmp -s "$temp_dir/source-counts.tsv" "$temp_dir/restored-counts.tsv"; then
  echo 'Falha: as contagens restauradas divergem do snapshot criptografado.' >&2
  exit 1
fi

echo 'RESTORE_OK'
