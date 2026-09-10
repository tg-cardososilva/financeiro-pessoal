import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')
const workflow = read('../.github/workflows/jarvis-backup-restore.yml')
const backup = read('../scripts/backup-logical.sh')
const restore = read('../scripts/restore-test.sh')

test('backup gate is manual, least-privilege and publishes encrypted artifacts only', () => {
  assert.match(workflow, /workflow_dispatch:/)
  assert.doesNotMatch(workflow, /\bschedule:/)
  assert.match(workflow, /permissions:\s*\n\s*contents: read/)
  assert.match(workflow, /environment: jarvis-production-backup/)
  assert.match(workflow, /secrets\.SUPABASE_DB_URL/)
  assert.match(workflow, /secrets\.BACKUP_AGE_IDENTITY/)
  assert.match(workflow, /postgres:17-bookworm/g)
  assert.match(workflow, /retention-days: 7/)
  assert.doesNotMatch(workflow, /\.dump(?:\s|$)/)
  assert.doesNotMatch(workflow, /BACKUP_AGE_RECIPIENT/)
})

test('production dump is PostgreSQL 17, scoped, read-only and encrypted', () => {
  assert.match(backup, /pg_major.*17/s)
  assert.match(backup, /default_transaction_read_only=on/)
  assert.match(backup, /--schema=public --schema=auth --schema=storage --schema=supabase_migrations/)
  assert.match(backup, /age --recipient/)
  assert.match(backup, /source-counts\.tsv/)
  assert.match(backup, /\.tar\.age/)
})

test('restore refuses production and validates structure plus exact critical counts', () => {
  assert.match(restore, /qhpkraqrcvhhtbqjhkmm/)
  assert.match(restore, /supabase\.co/)
  assert.match(restore, /banco temporario de restore nao esta vazio/)
  assert.match(restore, /RESTORE_STRUCTURE_OK/)
  assert.match(restore, /cmp -s .*source-counts\.tsv.*restored-counts\.tsv/)
  assert.match(restore, /RESTORE_OK/)
  assert.doesNotMatch(restore, /docker/)
})
