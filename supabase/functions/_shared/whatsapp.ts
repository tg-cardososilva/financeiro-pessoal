export async function sendWhatsAppText(to: string, message: string) {
  const phoneNumberId = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID') || '';
  const accessToken = Deno.env.get('WHATSAPP_ACCESS_TOKEN') || '';
  if (!phoneNumberId || !accessToken) throw new Error('whatsapp_sender_not_configured');
  const recipient = String(to || '').replace(/\D/g, '');
  const text = String(message || '').trim().slice(0, 4096);
  if (!recipient || !text) throw new Error('whatsapp_payload_invalid');
  const response = await fetch(`https://graph.facebook.com/v23.0/${encodeURIComponent(phoneNumberId)}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: recipient,
      type: 'text',
      text: { preview_url: false, body: text },
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error('whatsapp_send_failed') as Error & { status?: number; providerCode?: string };
    error.status = response.status;
    error.providerCode = String(payload?.error?.code || 'unknown').slice(0, 40);
    throw error;
  }
  return { external_message_id: payload?.messages?.[0]?.id || null, status: response.status };
}
