import test from 'node:test'
import assert from 'node:assert/strict'

import { createWebhookHandler } from '../supabase/functions/jarvis-whatsapp-webhook/webhook-core.mjs'
import { bytesToHex, hmacSha256 } from '../supabase/functions/jarvis-whatsapp-webhook/security.mjs'

const SECRET = 'synthetic-app-secret-v363'
const VERIFY = 'synthetic-verify-token-v363'
const encoder = new TextEncoder()

const messagePayload = {
  object: 'whatsapp_business_account',
  entry: [{
    id: 'synthetic-waba-id',
    changes: [{
      field: 'messages',
      value: {
        messaging_product: 'whatsapp',
        metadata: { phone_number_id: 'synthetic-phone-id', display_phone_number: '+55 11 99999-9999' },
        contacts: [{ wa_id: '5511999999999', profile: { name: 'Fixture Person' } }],
        messages: [{ id: 'wamid.synthetic-message-001', from: '5511999999999', timestamp: '1788867000', type: 'text', text: { body: 'fixture private text' } }],
      },
    }],
  }],
}

const statusPayload = {
  object: 'whatsapp_business_account',
  entry: [{
    id: 'synthetic-waba-id',
    changes: [{
      field: 'messages',
      value: {
        messaging_product: 'whatsapp',
        statuses: [{ id: 'wamid.synthetic-status-001', status: 'delivered', timestamp: '1788867001', recipient_id: '5511888888888' }],
      },
    }],
  }],
}

async function signatureFor(text, secret = SECRET) {
  return `sha256=${bytesToHex(await hmacSha256(secret, encoder.encode(text)))}`
}

function harness({ appSecret = SECRET, verifyToken = VERIFY } = {}) {
  const keys = new Set()
  const logs = []
  let cleanupCalls = 0
  const handler = createWebhookHandler({
    verifyToken,
    appSecret,
    claimEvent: async ({ eventKeyHash }) => {
      if (keys.has(eventKeyHash)) return 'duplicate'
      keys.add(eventKeyHash)
      return 'new'
    },
    cleanupExpired: async () => { cleanupCalls += 1 },
    log: (level, event, fields) => logs.push({ level, event, fields }),
  })
  return { handler, keys, logs, cleanupCalls: () => cleanupCalls }
}

async function post(handler, text, signature) {
  const headers = { 'Content-Type': 'application/json' }
  if (signature !== undefined) headers['X-Hub-Signature-256'] = signature
  return handler(new Request('https://example.test/functions/v1/jarvis-whatsapp-webhook', {
    method: 'POST',
    headers,
    body: text,
  }))
}

test('GET accepts the configured Meta verify token and returns the challenge', async () => {
  const { handler } = harness()
  const res = await handler(new Request(`https://example.test/webhook?hub.mode=subscribe&hub.verify_token=${VERIFY}&hub.challenge=challenge-363`))
  assert.equal(res.status, 200)
  assert.equal(await res.text(), 'challenge-363')
})

test('GET rejects an invalid verify token', async () => {
  const { handler } = harness()
  const res = await handler(new Request('https://example.test/webhook?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=x'))
  assert.equal(res.status, 403)
})

test('POST accepts a valid X-Hub-Signature-256 over the exact raw body', async () => {
  const { handler, keys } = harness()
  const text = `  ${JSON.stringify(messagePayload)}\n`
  const res = await post(handler, text, await signatureFor(text))
  assert.equal(res.status, 200)
  assert.equal((await res.json()).duplicate, false)
  assert.equal(keys.size, 1)
})

test('POST rejects an invalid signature before claiming an event', async () => {
  const { handler, keys } = harness()
  const text = JSON.stringify(messagePayload)
  const res = await post(handler, text, await signatureFor(text, 'wrong-secret'))
  assert.equal(res.status, 401)
  assert.equal(keys.size, 0)
})

test('POST rejects a missing signature', async () => {
  const { handler, keys } = harness()
  const res = await post(handler, JSON.stringify(messagePayload), undefined)
  assert.equal(res.status, 401)
  assert.equal((await res.json()).code, 'signature_missing')
  assert.equal(keys.size, 0)
})

test('POST rejects a body altered after it was signed', async () => {
  const { handler, keys } = harness()
  const original = JSON.stringify(messagePayload)
  const altered = original.replace('fixture private text', 'tampered fixture text')
  const res = await post(handler, altered, await signatureFor(original))
  assert.equal(res.status, 401)
  assert.equal(keys.size, 0)
})

test('POST rejects a malformed signature format', async () => {
  const { handler, keys } = harness()
  const res = await post(handler, JSON.stringify(messagePayload), 'sha256=not-hex')
  assert.equal(res.status, 401)
  assert.equal((await res.json()).code, 'signature_malformed')
  assert.equal(keys.size, 0)
})

test('replay of the same message ID is acknowledged without a second claim', async () => {
  const { handler, keys } = harness()
  const text = JSON.stringify(messagePayload)
  const signature = await signatureFor(text)
  const first = await post(handler, text, signature)
  const second = await post(handler, text, signature)
  assert.equal(first.status, 200)
  assert.equal(second.status, 200)
  assert.equal((await second.json()).duplicate, true)
  assert.equal(keys.size, 1)
})

test('malformed JSON with a valid signature is rejected without persistence', async () => {
  const { handler, keys } = harness()
  const text = '{"object":"whatsapp_business_account","entry":['
  const res = await post(handler, text, await signatureFor(text))
  assert.equal(res.status, 400)
  assert.equal((await res.json()).code, 'invalid_payload')
  assert.equal(keys.size, 0)
})

test('a legitimate non-message status event is accepted and idempotent', async () => {
  const { handler, keys } = harness()
  const text = JSON.stringify(statusPayload)
  const signature = await signatureFor(text)
  const first = await post(handler, text, signature)
  const replay = await post(handler, text, signature)
  assert.equal(first.status, 200)
  assert.equal(replay.status, 200)
  assert.equal((await replay.json()).duplicate, true)
  assert.equal(keys.size, 1)
})

test('logs contain operational metadata only, not message content, phone, secret or signature', async () => {
  const { handler, logs } = harness()
  const text = JSON.stringify(messagePayload)
  const signature = await signatureFor(text)
  const res = await post(handler, text, signature)
  assert.equal(res.status, 200)
  const serialized = JSON.stringify(logs)
  for (const forbidden of [SECRET, VERIFY, signature, 'fixture private text', '5511999999999', '+55 11 99999-9999', 'Fixture Person']) {
    assert.equal(serialized.includes(forbidden), false, `log leaked: ${forbidden}`)
  }
})

test('missing App Secret fails closed without claiming an event', async () => {
  const { handler, keys } = harness({ appSecret: '' })
  const text = JSON.stringify(messagePayload)
  const res = await post(handler, text, await signatureFor(text))
  assert.equal(res.status, 503)
  assert.equal((await res.json()).code, 'webhook_not_configured')
  assert.equal(keys.size, 0)
})
