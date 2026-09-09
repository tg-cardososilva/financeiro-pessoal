#!/usr/bin/env bash
set -euo pipefail

: "${SUPABASE_DB_URL:?Defina SUPABASE_DB_URL com a connection string do banco.}"
: "${BACKUP_AGE_RECIPIENT:?Defina BACKUP_AGE_RECIPIENT com a chave publica age.}"

command -v pg_dump >/dev/null
command -v age >/dev/null
command -v sha256sum >/dev/null

backup_root="${JARVIS_BACKUP_DIR:-./backups}"
mkdir -p "$backup_root"
chmod 700 "$backup_root"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
final_file="$backup_root/jarvis-$stamp.dump.age"
temp_dir="$(mktemp -d)"
trap 'rm -rf -- "$temp_dir"' EXIT

umask 077
pg_dump "$SUPABASE_DB_URL" \
  --format=custom --compress=9 --no-owner --no-acl \
  --file="$temp_dir/jarvis.dump"
pg_restore --list "$temp_dir/jarvis.dump" > "$temp_dir/contents.txt"
grep -q 'TABLE DATA public' "$temp_dir/contents.txt"
grep -q 'SCHEMA public' "$temp_dir/contents.txt"
age --recipient "$BACKUP_AGE_RECIPIENT" \
  --output "$final_file" "$temp_dir/jarvis.dump"
sha256sum "$final_file" > "$final_file.sha256"
chmod 600 "$final_file" "$final_file.sha256"
printf '%s\n' "$final_file"

