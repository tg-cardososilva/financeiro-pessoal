#!/usr/bin/env bash
set -euo pipefail

test -f supabase/config.toml
test -f .env.example
test -f docs/operations-runbook.md
test -f docs/backup-recovery.md
test -f .github/workflows/jarvis-backup-restore.yml
test -f scripts/backup-logical.sh
test -f scripts/restore-test.sh
test -f manifest.webmanifest
test -f sw.js

repo_migrations="$(find supabase/migrations -maxdepth 1 -name '*.sql' | wc -l | tr -d ' ')"
test "$repo_migrations" -ge 27
for function_dir in supabase/functions/*; do
  test "$(basename "$function_dir")" = '_shared' && continue
  test -f "$function_dir/index.ts"
done
! grep -R -E 'sb_secret_[A-Za-z0-9_-]{20,}|EAA[A-Za-z0-9]{40,}|BEGIN (RSA |EC |)PRIVATE KEY' \
  --exclude-dir=.git --exclude='*.png' .
printf 'repository_reconstruction_ok migrations=%s\n' "$repo_migrations"
