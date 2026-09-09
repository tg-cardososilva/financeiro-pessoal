import test from 'node:test'
import assert from 'node:assert/strict'
import { createWhatsAppProcessor } from '../supabase/functions/jarvis-whatsapp-webhook/whatsapp-pipeline.mjs'

const payload = (text, id = 'wamid.1', from = '5511999999999') => ({
  object: 'whatsapp_business_account',
  entry: [{ changes: [{ value: { messages: [{ id, from, type: 'text', text: { body: text } }] } }] }],
})

function harness({ binding = null, pairing = null } = {}) {
  const calls = { run: [], send: [], complete: [], fail: [], bind: [] }
  const processor = createWhatsAppProcessor({
    lookupBinding: async () => binding,
    consumePairingCode: async () => pairing,
    bindIdentity: async (value) => calls.bind.push(value),
    runJarvis: async (value) => {
      calls.run.push(value)
      return { reply: 'Resposta real', outbound_message_id: 'out-1' }
    },
    sendReply: async (to, message) => { calls.send.push({ to, message }); return { external_message_id: 'sent-1' } },
    markCompleted: async (key) => calls.complete.push(key),
    markFailed: async (key, code) => calls.fail.push({ key, code }),
  })
  return { processor, calls }
}

test('phone alone never authorizes Jarvis data access', async () => {
  const { processor, calls } = harness()
  await processor({ descriptor: { kind: 'message', externalId: 'wamid.1' }, eventKeyHash: 'hash', payload: payload('Quanto gastei?') })
  assert.equal(calls.run.length, 0)
  assert.equal(calls.send.length, 1)
  assert.match(calls.send[0].message, /não está vinculado/i)
  assert.deepEqual(calls.complete, ['hash'])
})

test('verified identity maps unequivocally to user_id before Jarvis runs', async () => {
  const binding = { id: 'identity-1', userId: 'user-1', verified: true }
  const { processor, calls } = harness({ binding })
  await processor({ descriptor: { kind: 'message', externalId: 'wamid.1' }, eventKeyHash: 'hash', payload: payload('Quanto gastei?') })
  assert.equal(calls.run[0].userId, 'user-1')
  assert.equal(calls.run[0].identityId, 'identity-1')
  assert.equal(calls.run[0].externalMessageId, 'wamid.1')
  assert.equal(calls.send[0].message, 'Resposta real')
})

test('authenticated pairing code creates the verified binding', async () => {
  const { processor, calls } = harness({ pairing: { userId: 'user-2' } })
  await processor({ descriptor: { kind: 'message', externalId: 'wamid.1' }, eventKeyHash: 'hash', payload: payload('VINCULAR ABCD1234') })
  assert.deepEqual(calls.bind, [{ userId: 'user-2', channelUserId: '5511999999999' }])
  assert.equal(calls.run.length, 0)
  assert.match(calls.send[0].message, /vinculado com segurança/i)
})

test('processing failures are retryable and sanitized to an error code', async () => {
  const calls = { failed: [] }
  const processor = createWhatsAppProcessor({
    lookupBinding: async () => ({ id: 'i', userId: 'u', verified: true }),
    consumePairingCode: async () => null,
    bindIdentity: async () => {},
    runJarvis: async () => { throw new Error('openai_unavailable') },
    sendReply: async () => {},
    markCompleted: async () => {},
    markFailed: async (key, code) => calls.failed.push({ key, code }),
  })
  await assert.rejects(() => processor({ descriptor: { kind: 'message', externalId: 'wamid.1' }, eventKeyHash: 'hash', payload: payload('Oi') }))
  assert.deepEqual(calls.failed, [{ key: 'hash', code: 'openai_unavailable' }])
})
