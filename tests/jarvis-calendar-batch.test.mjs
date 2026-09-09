import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  calendarBatchConfirmationReply,
  executeCalendarBatchItems,
  normalizeCalendarEvents,
  summarizeCalendarBatchResults,
} from '../supabase/functions/_shared/calendar-batch.mjs'

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')
const calendarFunction = read('../supabase/functions/jarvis-calendar/index.ts')
const engine = read('../supabase/functions/_shared/jarvis-engine.ts')
const openai = read('../supabase/functions/_shared/openai.ts')
const migration = read('../supabase/migrations/20260909195751_jarvis_calendar_batch_actions.sql')
const app = read('../app.js')

const event = (title, startsAt, endsAt = null) => ({
  title,
  starts_at: startsAt,
  ends_at: endsAt,
  location: null,
  notes: null,
})

test('normalizes one event and applies the declared one-hour default', () => {
  const [item] = normalizeCalendarEvents({
    calendar_events: [event('[TESTE JARVIS] Único', '2026-09-10T11:00:00-03:00')],
  })
  assert.equal(item.starts_at, '2026-09-10T14:00:00.000Z')
  assert.equal(item.ends_at, '2026-09-10T15:00:00.000Z')
  assert.equal(item.duration_defaulted, true)
  assert.match(calendarBatchConfirmationReply([item]), /duração padrão de 1 hora/)
})

test('keeps two homogeneous Calendar actions independent and ordered', () => {
  const items = normalizeCalendarEvents({ calendar_events: [
    event('[TESTE JARVIS] Dan', '2026-09-10T11:00:00-03:00'),
    event('[TESTE JARVIS] Natália', '2026-09-15T11:00:00-03:00'),
  ] })
  assert.equal(items.length, 2)
  assert.deepEqual(items.map((item) => item.title), ['[TESTE JARVIS] Dan', '[TESTE JARVIS] Natália'])
  assert.match(calendarBatchConfirmationReply(items), /Preparei 2 compromissos/)
})

test('accepts three events with different dates and times', () => {
  const items = normalizeCalendarEvents({ calendar_events: [
    event('A', '2026-09-11T09:00:00-03:00', '2026-09-11T09:30:00-03:00'),
    event('B', '2026-09-12T13:15:00-03:00', '2026-09-12T14:00:00-03:00'),
    event('C', '2026-09-16T18:45:00-03:00', '2026-09-16T19:45:00-03:00'),
  ] })
  assert.equal(items.length, 3)
  assert.equal(items[1].starts_at, '2026-09-12T16:15:00.000Z')
  assert.equal(items[2].ends_at, '2026-09-16T22:45:00.000Z')
})

test('continues after the second event fails and reports partial success', async () => {
  const actions = [1, 2, 3].map((id) => ({ id: String(id), payload: { title: `Evento ${id}` } }))
  const visited = []
  const results = await executeCalendarBatchItems(actions, async (action) => {
    visited.push(action.id)
    if (action.id === '2') throw new Error('falha_controlada')
    return { action_id: action.id, title: action.payload.title, status: 'executed' }
  })
  assert.deepEqual(visited, ['1', '2', '3'])
  assert.deepEqual(results.map((result) => result.status), ['executed', 'failed', 'executed'])
  assert.deepEqual(summarizeCalendarBatchResults(results), {
    executed: 2, failed: 1, cancelled: 0, in_progress: 0,
    total: 3, ok: false, partial_success: true,
  })
})

test('retry contract is deterministic at database and Google provider boundaries', () => {
  assert.match(migration, /unique index if not exists jarvis_actions_user_idempotency_uq/)
  assert.match(migration, /jarvis-core:%s:calendar:%s/)
  assert.match(migration, /on conflict \(user_id, idempotency_key\).*do nothing/s)
  assert.match(calendarFunction, /const googleEventId = `jarvis\$\{String\(action\.id\)/)
  assert.match(calendarFunction, /stale_claim_recovered/)
  assert.match(calendarFunction, /\.eq\('status', 'executing'\)\.eq\('updated_at', action\.updated_at\)/)
  assert.match(calendarFunction, /googleRes\.status === 409/)
  assert.match(calendarFunction, /already_executed: true/)
})

test('parser, reservation, confirmation and cancellation expose the batch contract', () => {
  assert.match(openai, /calendar_events/)
  assert.match(openai, /um item em calendar_events para cada compromisso distinto/)
  assert.match(engine, /reserve_jarvis_calendar_action_batch/)
  assert.match(engine, /created\.calendar_actions/)
  assert.match(calendarFunction, /body\?\.batch_id/)
  assert.match(calendarFunction, /operation === 'cancel'/)
  assert.match(app, /Confirmar \$\{items\.length > 1 \? 'lote'/)
  assert.match(app, /Cancelar lote/)
})

test('rejects incomplete or inverted Calendar events before persistence', () => {
  assert.throws(() => normalizeCalendarEvents({ calendar_events: [] }), /calendar_details_missing/)
  assert.throws(() => normalizeCalendarEvents({ calendar_events: [event('', '2026-09-10T11:00:00-03:00')] }), /calendar_details_missing/)
  assert.throws(() => normalizeCalendarEvents({ calendar_events: [event('Inválido', '2026-09-10T12:00:00-03:00', '2026-09-10T11:00:00-03:00')] }), /calendar_end_before_start/)
})
