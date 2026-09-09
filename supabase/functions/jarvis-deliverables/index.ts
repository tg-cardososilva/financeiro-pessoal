import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { adminClient, authenticatedContext } from '../_shared/auth.ts';
import { createDeliverableForUser } from '../_shared/deliverable-service.ts';
import { corsHeaders, json } from '../_shared/http.ts';

const admin = adminClient();
const PUBLIC_ERRORS = new Set([
  'explicit_confirmation_required','idempotency_key_invalid','title_required',
  'invalid_deliverable_type','project_not_found','idempotency_key_conflict',
  'google_drive_not_connected','google_drive_scope_missing','google_credentials_missing',
  'google_refresh_token_missing','google_token_refresh_failed','jarvis_root_missing',
  'jarvis_root_invalid','deliverable_outside_jarvis_root','document_content_required','sheet_rows_required',
  'deliverable_in_progress',
]);

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  try {
    const { client, userId } = await authenticatedContext(req);
    const body = await req.json().catch(() => null);
    if (!body) return json({ error: 'invalid_payload' }, 400);
    body.idempotency_key ||= req.headers.get('idempotency-key');
    return json(await createDeliverableForUser({ client, admin, userId, body }));
  } catch (error) {
    const code = error instanceof Error ? error.message : 'deliverable_creation_failed';
    const safe = PUBLIC_ERRORS.has(code) ? code
      : ['not_authenticated','invalid_session'].includes(code) ? code : 'deliverable_creation_failed';
    const status = ['not_authenticated','invalid_session'].includes(safe) ? 401
      : ['explicit_confirmation_required','idempotency_key_invalid','title_required','invalid_deliverable_type','document_content_required','sheet_rows_required'].includes(safe) ? 400
      : safe === 'project_not_found' ? 404 : 409;
    return json({ error: safe }, status);
  }
});
