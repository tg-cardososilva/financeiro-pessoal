import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { authenticatedContext } from '../_shared/auth.ts';
import { executeDomainAction } from '../_shared/domain-service.ts';
import { corsHeaders, json, safeError } from '../_shared/http.ts';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  try {
    const { client, userId } = await authenticatedContext(req);
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') return json({ error: 'invalid_payload' }, 400);
    return json(await executeDomainAction(client, userId, body));
  } catch (error) {
    const code = safeError(error);
    const status = code === 'not_authenticated' || code === 'invalid_session' ? 401
      : ['record_not_found','project_not_found'].includes(code) ? 404
      : code === 'operation_failed' ? 409 : 400;
    return json({ error: code }, status);
  }
});
