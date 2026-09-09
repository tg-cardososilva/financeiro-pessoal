import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { adminClient, authenticatedContext } from '../_shared/auth.ts';
import { corsHeaders, json } from '../_shared/http.ts';
import { executeJarvis } from '../_shared/jarvis-engine.ts';

const admin = adminClient();
const SAFE_ERRORS = new Set([
  'empty_message','task_target_missing','task_not_found','task_target_ambiguous',
  'calendar_details_missing','calendar_time_invalid','calendar_end_before_start',
  'calendar_batch_size_invalid','calendar_batch_reservation_incomplete',
  'financial_amount_missing','project_not_found',
  'previous_content_not_found','document_content_required','sheet_rows_required',
  'google_drive_not_connected','google_calendar_not_connected','google_credentials_missing',
  'google_token_refresh_failed','jarvis_root_missing','jarvis_root_invalid',
  'research_sources_missing','openai_not_configured',
]);

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  try {
    const { client, userId } = await authenticatedContext(req);
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') return json({ error: 'invalid_payload' }, 400);
    return json(await executeJarvis({ client, admin, userId, body }));
  } catch (error) {
    const code = error instanceof Error ? error.message : 'jarvis_failed';
    const safe = SAFE_ERRORS.has(code) ? code
      : ['not_authenticated','invalid_session'].includes(code) ? code : 'jarvis_failed';
    const status = ['not_authenticated','invalid_session'].includes(safe) ? 401
      : ['google_drive_not_connected','google_calendar_not_connected','project_not_found'].includes(safe) ? 409
      : safe === 'jarvis_failed' ? 500 : 400;
    return json({ error: safe }, status);
  }
});
