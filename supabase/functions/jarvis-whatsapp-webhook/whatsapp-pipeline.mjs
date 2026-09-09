function findMessage(payload, externalId) {
  for (const entry of Array.isArray(payload?.entry) ? payload.entry : []) {
    for (const change of Array.isArray(entry?.changes) ? entry.changes : []) {
      for (const message of Array.isArray(change?.value?.messages) ? change.value.messages : []) {
        if (String(message?.id || '') === String(externalId || '')) return message
      }
    }
  }
  return null
}

export function createWhatsAppProcessor({
  lookupBinding,
  consumePairingCode,
  bindIdentity,
  runJarvis,
  sendReply,
  markCompleted,
  markFailed,
}) {
  return async function processWhatsAppEvent({ descriptor, eventKeyHash, payload }) {
    try {
      if (descriptor.kind !== 'message') {
        await markCompleted(eventKeyHash)
        return { completed: true, kind: descriptor.kind }
      }
      const message = findMessage(payload, descriptor.externalId)
      if (!message || message.type !== 'text' || !message.text?.body) {
        await markCompleted(eventKeyHash)
        return { completed: true, ignored: true }
      }
      const channelUserId = String(message.from || '').replace(/\D/g, '')
      const text = String(message.text.body || '').trim()
      if (!channelUserId || !text) throw new Error('invalid_message')

      const pairMatch = /^VINCULAR\s+([A-Z0-9]{8,16})$/i.exec(text)
      if (pairMatch) {
        const pairing = await consumePairingCode(pairMatch[1].toUpperCase())
        if (!pairing) {
          await sendReply(channelUserId, 'Código de vínculo inválido ou expirado. Gere um novo código no painel do Jarvis.')
          await markCompleted(eventKeyHash)
          return { completed: true, paired: false }
        }
        await bindIdentity({ userId: pairing.userId, channelUserId })
        await sendReply(channelUserId, 'WhatsApp vinculado com segurança ao seu Jarvis.')
        await markCompleted(eventKeyHash)
        return { completed: true, paired: true }
      }

      const identity = await lookupBinding(channelUserId)
      if (!identity || !identity.verified || !identity.userId) {
        await sendReply(channelUserId, 'Este número ainda não está vinculado. Inicie o vínculo seguro no painel do Jarvis.')
        await markCompleted(eventKeyHash)
        return { completed: true, authorized: false }
      }
      const result = await runJarvis({
        userId: identity.userId,
        identityId: identity.id,
        message: text,
        externalMessageId: String(message.id),
      })
      const sent = await sendReply(channelUserId, result.reply)
      await markCompleted(eventKeyHash)
      return { completed: true, authorized: true, outboundMessageId: result.outbound_message_id || null, sent }
    } catch (error) {
      const code = error instanceof Error ? error.message : 'processing_failed'
      await markFailed(eventKeyHash, code)
      throw error
    }
  }
}
