import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')
const core = read('../supabase/functions/jarvis-core/index.ts')
const engine = read('../supabase/functions/_shared/jarvis-engine.ts')
const domain = read('../supabase/functions/jarvis-domain/index.ts')
const domainService = read('../supabase/functions/_shared/domain-service.ts')
const deliverables = read('../supabase/functions/_shared/deliverable-service.ts')
const google = read('../supabase/functions/_shared/google.ts')
const retrieval = read('../supabase/functions/_shared/retrieval.ts')
const health = read('../supabase/functions/jarvis-health/index.ts')

test('web and Jarvis writes share the same canonical domain service', () => {
  assert.match(domain, /executeDomainAction/)
  assert.match(engine, /executeDomainAction/)
  assert.match(domainService, /explicit_confirmation_required/)
  assert.match(domainService, /idempotency_key/)
  assert.match(domainService, /project_not_found/)
})

test('retrieval is deterministic and domain scoped', () => {
  assert.match(engine, /routeJarvisMessage/)
  assert.match(engine, /retrieveJarvisContext/)
  assert.match(retrieval, /domains\.includes\('finance'\)/)
  assert.match(retrieval, /domains\.includes\('agenda'\)/)
  assert.match(retrieval, /domains\.includes\('documents'\)/)
  assert.match(retrieval, /matched_totals/)
  assert.match(retrieval, /expense_change_percent/)
  assert.doesNotMatch(core, /select\('\*'\).*jarvis_memories/)
})

test('Docs and Sheets creation is explicit, idempotent and constrained to JARVIS', () => {
  assert.match(deliverables, /explicit_confirmation_required/)
  assert.match(deliverables, /idempotency_key/)
  assert.match(deliverables, /validateJarvisRoot/)
  assert.match(deliverables, /jarvis_files/)
  assert.match(deliverables, /project_not_found/)
  assert.match(google, /drive\.file/)
  assert.match(google, /docs\.googleapis\.com/)
  assert.match(google, /sheets\.googleapis\.com/)
  assert.doesNotMatch(deliverables, /files\.delete|DELETE/)
})

test('health checks are sanitized and do not expose secret values', () => {
  assert.match(health, /action_required/)
  assert.match(health, /phone_numbers\?fields=/)
  assert.match(health, /messaging_limit_tier/)
  assert.match(health, /code_verification_status/)
  assert.match(health, /phone_status/)
  assert.match(health, /phoneStatus !== 'CONNECTED'/)
  assert.doesNotMatch(health, /access_token:/)
  assert.doesNotMatch(health, /refresh_token:/)
})

test('Calendar executor requires explicit confirmation and claims once', () => {
  const calendar = read('../supabase/functions/jarvis-calendar/index.ts')
  const app = read('../app.js')
  assert.match(calendar, /explicit_confirmation\s*!==\s*true/)
  assert.match(calendar, /\.in\('status', \['proposed', 'confirmed', 'failed'\]\)/)
  assert.match(calendar, /Acao ja esta em processamento/)
  assert.match(app, /explicit_confirmation:\s*true/)
})

test('WhatsApp sender claims a confirmed action before the external call', () => {
  const sender = read('../supabase/functions/jarvis-whatsapp-send/index.ts')
  assert.match(sender, /status:\s*'executing'/)
  assert.match(sender, /\.eq\('status', 'confirmed'\)\.select\('id'\)\.maybeSingle\(\)/)
  assert.match(sender, /action_in_progress/)
  assert.match(sender, /status:\s*'failed'/)
  assert.match(sender, /verified_identity_required/)
})

test('the panel exposes authenticated WhatsApp pairing instead of trusting a phone number', () => {
  const app = read('../app.js')
  assert.match(app, /jarvis-whatsapp-identity/)
  assert.match(app, /explicit:\s*true/)
  assert.match(app, /startWhatsAppPairing/)
})
