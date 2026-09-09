import {
  collectEventDescriptors,
  parseMetaSignature,
  sha256Hex,
  summarizePayload,
  verifyMetaSignature,
} from './security.mjs'

const MAX_BODY_BYTES = 3 * 1024 * 1024
const decoder = new TextDecoder()

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function emit(log, level, event, fields = {}) {
  try {
    log(level, event, fields)
  } catch (_) {
    // Logging must never affect webhook acknowledgement behavior.
  }
}

export function createWebhookHandler({
  verifyToken,
  appSecret,
  claimEvent,
  cleanupExpired = async () => {},
  processEvent = null,
  defer = (promise) => promise,
  log = (_level, _event, _fields) => {},
}) {
  if (typeof claimEvent !== 'function') throw new Error('claimEvent is required')

  return async function handleWebhook(req) {
    const url = new URL(req.url)

    if (req.method === 'GET') {
      const mode = url.searchParams.get('hub.mode')
      const token = url.searchParams.get('hub.verify_token')
      const challenge = url.searchParams.get('hub.challenge')

      if (!verifyToken) {
        emit(log, 'error', 'WA_VERIFY', { ok: false, code: 'verify_token_missing' })
        return new Response('verify token not configured', { status: 503 })
      }

      const ok = mode === 'subscribe' && token === verifyToken && Boolean(challenge)
      emit(log, ok ? 'info' : 'warn', 'WA_VERIFY', {
        ok,
        mode: mode || null,
        has_challenge: Boolean(challenge),
        code: ok ? 'verified' : 'verification_rejected',
      })

      if (ok) {
        return new Response(challenge, {
          status: 200,
          headers: { 'Content-Type': 'text/plain' },
        })
      }
      return new Response('forbidden', { status: 403 })
    }

    if (req.method !== 'POST') return new Response('method not allowed', { status: 405 })

    const signatureHeader = req.headers.get('x-hub-signature-256') || ''
    if (!signatureHeader) {
      emit(log, 'warn', 'WA_SIGNATURE', { ok: false, code: 'signature_missing' })
      return json({ received: false, code: 'signature_missing' }, 401)
    }
    if (!parseMetaSignature(signatureHeader)) {
      emit(log, 'warn', 'WA_SIGNATURE', { ok: false, code: 'signature_malformed' })
      return json({ received: false, code: 'signature_malformed' }, 401)
    }
    if (!appSecret) {
      emit(log, 'error', 'WA_CONFIG', { ok: false, code: 'app_secret_missing' })
      return json({ received: false, code: 'webhook_not_configured' }, 503)
    }

    let rawBytes
    try {
      rawBytes = new Uint8Array(await req.arrayBuffer())
    } catch (_) {
      emit(log, 'warn', 'WA_PAYLOAD', { ok: false, code: 'body_unreadable' })
      return json({ received: false, code: 'invalid_payload' }, 400)
    }

    if (rawBytes.byteLength > MAX_BODY_BYTES) {
      emit(log, 'warn', 'WA_PAYLOAD', { ok: false, code: 'body_too_large', bytes: rawBytes.byteLength })
      return json({ received: false, code: 'payload_too_large' }, 413)
    }

    let signatureValid = false
    try {
      signatureValid = await verifyMetaSignature(appSecret, rawBytes, signatureHeader)
    } catch (_) {
      emit(log, 'error', 'WA_SIGNATURE', { ok: false, code: 'signature_check_failed' })
      return json({ received: false, code: 'signature_check_failed' }, 500)
    }

    if (!signatureValid) {
      emit(log, 'warn', 'WA_SIGNATURE', { ok: false, code: 'signature_invalid' })
      return json({ received: false, code: 'signature_invalid' }, 401)
    }

    let payload
    try {
      payload = JSON.parse(decoder.decode(rawBytes))
    } catch (_) {
      emit(log, 'warn', 'WA_PAYLOAD', { ok: false, code: 'invalid_json' })
      return json({ received: false, code: 'invalid_payload' }, 400)
    }

    if (!payload || payload.object !== 'whatsapp_business_account' || !Array.isArray(payload.entry)) {
      emit(log, 'warn', 'WA_PAYLOAD', { ok: false, code: 'unexpected_shape' })
      return json({ received: false, code: 'invalid_payload' }, 400)
    }

    try {
      const rawBodyHash = await sha256Hex(rawBytes)
      const descriptors = collectEventDescriptors(payload, rawBodyHash)
      let newEvents = 0
      let duplicateEvents = 0
      const claimed = []

      for (const descriptor of descriptors) {
        const eventKeyHash = await sha256Hex(descriptor.key)
        const result = await claimEvent({ eventKeyHash, eventKind: descriptor.kind })
        if (result === 'duplicate') duplicateEvents += 1
        else {
          newEvents += 1
          claimed.push({ descriptor, eventKeyHash })
        }
      }

      try {
        await cleanupExpired()
      } catch (_) {
        emit(log, 'warn', 'WA_IDEMPOTENCY', { ok: false, code: 'cleanup_failed' })
      }

      const summary = summarizePayload(payload)
      emit(log, 'info', 'WA_WEBHOOK', {
        ok: true,
        ...summary,
        new_events: newEvents,
        duplicate_events: duplicateEvents,
      })

      if (typeof processEvent === 'function') {
        for (const event of claimed) {
          const pending = Promise.resolve(processEvent({ ...event, payload })).catch((error) => {
            emit(log, 'error', 'WA_PROCESSING', {
              ok: false,
              code: typeof error?.message === 'string' ? error.message.slice(0, 80) : 'processing_failed',
              event_kind: event.descriptor.kind,
            })
          })
          defer(pending)
        }
      }

      return json({
        received: true,
        duplicate: newEvents === 0 && duplicateEvents > 0,
      })
    } catch (error) {
      emit(log, 'error', 'WA_WEBHOOK_ERROR', {
        ok: false,
        code: 'internal_error',
        db_code: typeof error?.code === 'string' ? error.code : null,
      })
      return json({ received: false, code: 'internal_error' }, 500)
    }
  }
}
