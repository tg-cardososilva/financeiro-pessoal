import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const migration = readFileSync(new URL('../supabase/migrations/20260908112101_v362_optimize_legacy_owner_rls.sql', import.meta.url), 'utf8')
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8')
const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8')
const docIntel = readFileSync(new URL('../document-intelligence.js', import.meta.url), 'utf8')

const policies = [
  'profiles_owner',
  'accounts_owner',
  'categories_owner',
  'import_batches_owner',
  'transactions_owner',
  'import_rows_owner',
  'categorization_rules_owner',
  'budgets_owner',
  'recurring_items_owner',
  'transaction_attachments_owner',
  'purchases_owner',
  'purchase_receipts_owner',
  'purchase_items_owner',
  'purchase_allocations_owner',
  'purchase_match_suggestions_owner',
  'investment_goals_owner',
  'investment_positions_owner',
  'investment_movements_owner',
  'investment_snapshots_owner',
  'financial_documents_owner',
]

assert.equal((migration.match(/alter policy /g) || []).length, policies.length)
for (const policy of policies) assert.match(migration, new RegExp(`alter policy ${policy}\\b`))
assert.equal((migration.match(/\bto authenticated\b/g) || []).length, policies.length)
assert.ok((migration.match(/\(select auth\.uid\(\)\)/g) || []).length >= policies.length * 2)
assert.doesNotMatch(migration, /^\s*(insert|update|delete|truncate|drop)\b/im)
assert.doesNotMatch(migration, /\bto\s+anon\b/i)

assert.match(html, /styles\.css\?v=1\.0\.0-rc\.2/)
assert.match(html, /app\.js\?v=1\.0\.0-rc\.2/)
assert.match(html, /document-intelligence\.js\?v=1\.0\.0-rc\.2/)

const publicFrontend = `${app}\n${docIntel}`
for (const secretName of [
  'SUPABASE_SERVICE_ROLE_KEY',
  'GOOGLE_CLIENT_SECRET',
  'OPENAI_API_KEY',
  'JARVIS_DOCUMENT_WORKER_SECRET',
  'WHATSAPP_ACCESS_TOKEN',
]) {
  assert.equal(publicFrontend.includes(secretName), false, `${secretName} must stay out of frontend`)
}
assert.match(publicFrontend, /sb_publishable_/)

console.log('v3.6.2 security hardening guardrails passed')
