import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { adminClient, authenticatedContext } from '../_shared/auth.ts';
import { googleAccess, validateJarvisRoot } from '../_shared/google.ts';
import { corsHeaders, json } from '../_shared/http.ts';

const admin = adminClient();
type Check = {
  user_id: string;
  component: string;
  status: 'healthy' | 'degraded' | 'blocked' | 'unknown';
  code: string;
  action_required: boolean;
  message: string;
  details: Record<string, unknown>;
  checked_at: string;
};

function check(userId: string, component: string, status: Check['status'], code: string, message: string, actionRequired = false, details = {}): Check {
  return { user_id: userId, component, status, code, action_required: actionRequired, message, details, checked_at: new Date().toISOString() };
}

async function googleCheck(userId: string, provider: 'google_calendar' | 'google_drive') {
  try {
    const access = await googleAccess(admin, userId, provider);
    if (provider === 'google_drive') await validateJarvisRoot(access.accessToken, access.connection);
    return check(userId, provider, 'healthy', 'connected', provider === 'google_drive' ? 'Google Drive conectado à pasta JARVIS' : 'Google Calendar conectado');
  } catch (error) {
    const code = error instanceof Error ? error.message : 'google_unavailable';
    return check(userId, provider, code.includes('not_connected') ? 'blocked' : 'degraded', code,
      provider === 'google_drive' ? 'Google Drive precisa ser reconectado' : 'Google Calendar precisa ser reconectado', true);
  }
}

async function openAiCheck(userId: string) {
  const key = Deno.env.get('OPENAI_API_KEY') || '';
  const model = Deno.env.get('OPENAI_MODEL') || 'gpt-5.6-luna';
  if (!key) return check(userId, 'openai', 'blocked', 'openai_key_missing', 'OpenAI não configurada', true);
  try {
    const response = await fetch(`https://api.openai.com/v1/models/${encodeURIComponent(model)}`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!response.ok) throw new Error(response.status === 401 ? 'openai_key_invalid' : `openai_http_${response.status}`);
    return check(userId, 'openai', 'healthy', 'reachable', 'OpenAI disponível', false, { model });
  } catch (error) {
    const code = error instanceof Error ? error.message : 'openai_unavailable';
    return check(userId, 'openai', 'degraded', code, 'OpenAI indisponível', true, { model });
  }
}

async function workerChecks(userId: string) {
  const workerUrl = Deno.env.get('DOCUMENT_AI_WORKER_URL') || '';
  const workerSecret = Deno.env.get('JARVIS_DOCUMENT_WORKER_SECRET') || '';
  if (!workerUrl || !workerSecret) {
    const missing = !workerUrl ? 'worker_url_missing' : 'worker_secret_missing';
    return [
      check(userId, 'cloud_run', 'blocked', missing, 'Worker de documentos não configurado', true),
      check(userId, 'document_ai', 'unknown', 'worker_unavailable', 'Document AI não pôde ser verificado', true),
    ];
  }
  try {
    const response = await fetch(workerUrl, { method: 'GET' });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload?.ok !== true) throw new Error(`worker_http_${response.status}`);
    return [
      check(userId, 'cloud_run', 'healthy', 'reachable', 'Cloud Run disponível'),
      check(userId, 'document_ai', 'healthy', 'processor_configured', 'Document AI configurado', false, { live_document_test: false }),
    ];
  } catch (error) {
    const code = error instanceof Error ? error.message : 'worker_unavailable';
    return [
      check(userId, 'cloud_run', 'degraded', code, 'Cloud Run indisponível', true),
      check(userId, 'document_ai', 'unknown', 'worker_unavailable', 'Document AI não pôde ser verificado', true),
    ];
  }
}

async function metaJson(url: string, accessToken: string) {
  const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  const payload = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, payload };
}

async function whatsappChecks(userId: string) {
  const webhookReady = Boolean(Deno.env.get('WHATSAPP_VERIFY_TOKEN') && Deno.env.get('WHATSAPP_APP_SECRET'));
  const phoneNumberId = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID') || '';
  const accessToken = Deno.env.get('WHATSAPP_ACCESS_TOKEN') || '';
  const wabaId = Deno.env.get('WHATSAPP_BUSINESS_ACCOUNT_ID') || '2536408923542027';
  const webhook = webhookReady
    ? check(userId, 'whatsapp_webhook', 'healthy', 'configured', 'Webhook do WhatsApp configurado')
    : check(userId, 'whatsapp_webhook', 'blocked', 'configuration_missing', 'Webhook do WhatsApp não configurado', true);
  if (!phoneNumberId || !accessToken) {
    return [webhook, check(userId, 'whatsapp_sender', 'blocked', 'sender_configuration_missing',
      'Envio WhatsApp não configurado', true, { waba_id: wabaId })];
  }
  const fields = 'id,display_phone_number,verified_name,status,code_verification_status,quality_rating,platform_type,throughput,is_official_business_account';
  const core = await metaJson(
    `https://graph.facebook.com/v23.0/${encodeURIComponent(wabaId)}/phone_numbers?fields=${encodeURIComponent(fields)}`,
    accessToken,
  );
  if (!core.ok) {
    const providerCode = String(core.payload?.error?.code || `http_${core.status}`).slice(0, 40);
    return [webhook, check(userId, 'whatsapp_sender', core.status === 403 ? 'blocked' : 'degraded',
      `meta_graph_${providerCode}`, 'Não foi possível confirmar o número na Meta Graph API', true,
      { waba_id: wabaId, http_status: core.status, provider_code: providerCode })];
  }
  const numbers = Array.isArray(core.payload?.data) ? core.payload.data : [];
  const phone = numbers.find((item: any) => String(item?.id || '') === phoneNumberId);
  if (!phone) {
    return [webhook, check(userId, 'whatsapp_sender', 'blocked', 'phone_not_in_waba',
      'O Phone Number ID configurado não pertence à WABA consultada', true,
      { waba_id: wabaId, phone_number_id: phoneNumberId, phone_count: numbers.length })];
  }
  const [limitResult, nameResult, reviewResult] = await Promise.all([
    metaJson(`https://graph.facebook.com/v23.0/${encodeURIComponent(phoneNumberId)}?fields=messaging_limit_tier`, accessToken),
    metaJson(`https://graph.facebook.com/v23.0/${encodeURIComponent(phoneNumberId)}?fields=name_status`, accessToken),
    metaJson(`https://graph.facebook.com/v23.0/${encodeURIComponent(wabaId)}?fields=account_review_status,business_verification_status`, accessToken),
  ]);
  const verification = String(phone.code_verification_status || 'UNKNOWN').toUpperCase();
  const phoneStatus = String(phone.status || 'UNKNOWN').toUpperCase();
  const quality = String(phone.quality_rating || 'UNKNOWN').toUpperCase();
  const review = reviewResult.ok ? reviewResult.payload : {};
  const accountReview = String(review.account_review_status || 'UNKNOWN').toUpperCase();
  const nameStatus = String(nameResult.ok ? nameResult.payload?.name_status || 'UNKNOWN' : 'UNAVAILABLE').toUpperCase();
  const details = {
    waba_id: wabaId,
    phone_number_id: phoneNumberId,
    display_phone_number: phone.display_phone_number || null,
    verified_name: phone.verified_name || null,
    phone_status: phoneStatus,
    code_verification_status: verification,
    quality_rating: quality,
    platform_type: phone.platform_type || null,
    throughput: phone.throughput || null,
    is_official_business_account: phone.is_official_business_account ?? null,
    messaging_limit_tier: limitResult.ok ? limitResult.payload?.messaging_limit_tier || null : null,
    name_status: nameStatus,
    account_review_status: review.account_review_status || null,
    business_verification_status: review.business_verification_status || null,
    optional_fields_available: {
      messaging_limit_tier: limitResult.ok,
      name_status: nameResult.ok,
      review_status: reviewResult.ok,
    },
  };
  if (phoneStatus !== 'CONNECTED') {
    return [webhook, check(userId, 'whatsapp_sender', 'blocked',
      `meta_phone_status_${phoneStatus.toLowerCase()}`, `Número Meta ainda não está conectado: ${phoneStatus}`,
      true, details)];
  }
  if (!['VERIFIED','APPROVED'].includes(verification)) {
    return [webhook, check(userId, 'whatsapp_sender', 'blocked',
      `meta_code_verification_${verification.toLowerCase()}`, `Verificação do número ainda não foi concluída: ${verification}`,
      true, details)];
  }
  if (['REJECTED','DISAPPROVED'].includes(accountReview)) {
    return [webhook, check(userId, 'whatsapp_sender', 'blocked', 'meta_account_review_rejected',
      `A revisão da conta foi rejeitada: ${accountReview}`, true, details)];
  }
  if (['REJECTED','DECLINED'].includes(nameStatus)) {
    return [webhook, check(userId, 'whatsapp_sender', 'degraded', 'meta_name_rejected',
      `O nome de exibição foi rejeitado: ${nameStatus}`, true, details)];
  }
  if (quality === 'RED') {
    return [webhook, check(userId, 'whatsapp_sender', 'degraded', 'meta_quality_red',
      'Número registrado, mas a qualidade está vermelha', true, details)];
  }
  return [webhook, check(userId, 'whatsapp_sender', 'healthy', 'meta_phone_registered',
    'Número confirmado tecnicamente pela Meta Graph API', false, details)];
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  try {
    const { client, userId } = await authenticatedContext(req);
    const body = await req.json().catch(() => ({}));
    if (body?.action === 'status') {
      const { data, error } = await client.from('jarvis_health_checks').select('*')
        .eq('user_id', userId).order('component');
      if (error) throw error;
      return json({ ok: true, checks: data || [] });
    }
    const [calendar, drive, openai, workers, whatsapp] = await Promise.all([
      googleCheck(userId, 'google_calendar'),
      googleCheck(userId, 'google_drive'),
      openAiCheck(userId),
      workerChecks(userId),
      whatsappChecks(userId),
    ]);
    const checks = [
      check(userId, 'supabase', 'healthy', 'reachable', 'Supabase disponível'),
      calendar, drive, openai, ...workers, ...whatsapp,
    ];
    const { data, error } = await client.from('jarvis_health_checks').upsert(checks, {
      onConflict: 'user_id,component',
    }).select('*');
    if (error) throw error;
    return json({
      ok: true,
      checked_at: new Date().toISOString(),
      checks: data || checks,
      action_required: checks.filter((item) => item.action_required),
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : 'health_check_failed';
    return json({ error: ['not_authenticated','invalid_session'].includes(code) ? code : 'health_check_failed' },
      ['not_authenticated','invalid_session'].includes(code) ? 401 : 500);
  }
});
