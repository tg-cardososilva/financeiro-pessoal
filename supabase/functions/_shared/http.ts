export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, idempotency-key',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

export function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export function errorCode(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function safeError(error: unknown) {
  const code = errorCode(error);
  const known = new Set([
    'not_authenticated','invalid_session','method_not_allowed','invalid_payload','invalid_entity',
    'invalid_action','invalid_semantic_action','id_required','explicit_confirmation_required',
    'idempotency_key_invalid','project_not_found','record_not_found','memory_not_allowed',
    'google_drive_not_connected','google_credentials_missing','jarvis_root_missing',
  ]);
  return known.has(code) ? code : 'operation_failed';
}
