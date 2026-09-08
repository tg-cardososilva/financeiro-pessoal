const encoder = new TextEncoder()

export function bytesToHex(bytes) {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function hexToBytes(hex) {
  const out = new Uint8Array(hex.length / 2)
  for (let i = 0; i < out.length; i += 1) out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  return out
}

export function parseMetaSignature(header) {
  const value = String(header || '').trim()
  const match = /^sha256=([0-9a-f]{64})$/i.exec(value)
  return match ? hexToBytes(match[1]) : null
}

export function constantTimeEqualBytes(left, right) {
  if (!(left instanceof Uint8Array) || !(right instanceof Uint8Array) || left.length !== right.length) return false
  let diff = 0
  for (let i = 0; i < left.length; i += 1) diff |= left[i] ^ right[i]
  return diff === 0
}

export async function hmacSha256(secret, bodyBytes) {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(String(secret)),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, bodyBytes))
}

export async function verifyMetaSignature(secret, bodyBytes, signatureHeader) {
  const received = parseMetaSignature(signatureHeader)
  if (!secret || !received) return false
  const expected = await hmacSha256(secret, bodyBytes)
  return constantTimeEqualBytes(expected, received)
}

export async function sha256Hex(input) {
  const bytes = typeof input === 'string' ? encoder.encode(input) : input
  return bytesToHex(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)))
}

export function collectEventDescriptors(payload, rawBodyHash) {
  const descriptors = []
  const seen = new Set()
  const entries = Array.isArray(payload?.entry) ? payload.entry : []

  const push = (kind, key) => {
    if (!key || seen.has(key)) return
    seen.add(key)
    descriptors.push({ kind, key })
  }

  for (const entry of entries) {
    const changes = Array.isArray(entry?.changes) ? entry.changes : []
    for (const change of changes) {
      const value = change?.value || {}
      for (const message of Array.isArray(value?.messages) ? value.messages : []) {
        const id = String(message?.id || '').trim()
        if (id) push('message', `message:${id}`)
      }
      for (const status of Array.isArray(value?.statuses) ? value.statuses : []) {
        const id = String(status?.id || '').trim()
        const state = String(status?.status || '').trim().toLowerCase()
        if (id) push('status', `status:${id}:${state || 'unknown'}`)
      }
    }
  }

  if (!descriptors.length) push('event', `event:${rawBodyHash}`)
  return descriptors
}

export function summarizePayload(payload) {
  let changes = 0
  let messages = 0
  let statuses = 0
  const fields = new Set()
  for (const entry of Array.isArray(payload?.entry) ? payload.entry : []) {
    for (const change of Array.isArray(entry?.changes) ? entry.changes : []) {
      changes += 1
      if (change?.field) fields.add(String(change.field))
      const value = change?.value || {}
      messages += Array.isArray(value?.messages) ? value.messages.length : 0
      statuses += Array.isArray(value?.statuses) ? value.statuses.length : 0
    }
  }
  return {
    object: typeof payload?.object === 'string' ? payload.object : null,
    entries: Array.isArray(payload?.entry) ? payload.entry.length : 0,
    changes,
    messages,
    statuses,
    fields: [...fields].slice(0, 8),
  }
}
