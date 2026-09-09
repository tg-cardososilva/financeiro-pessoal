import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { authenticatedContext } from '../_shared/auth.ts';
import { rememberForUser } from '../_shared/memory-service.ts';
import { corsHeaders, json } from '../_shared/http.ts';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  try {
    const { client, userId } = await authenticatedContext(req);
    const body = await req.json().catch(() => null);
    if (!body) return json({ error: 'invalid_payload' }, 400);
    const action = String(body.action || 'list');
    if (action === 'list') {
      let query = client.from('jarvis_memories')
        .select('id,memory_type,title,content,importance,memory_key,metadata,created_at,updated_at,expires_at')
        .eq('user_id', userId).eq('active', true)
        .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
        .order('importance', { ascending: false }).order('updated_at', { ascending: false })
        .limit(Math.min(100, Math.max(1, Number(body.limit) || 30)));
      if (body.q) {
        const q = String(body.q).replace(/[,%()]/g, ' ').trim();
        if (q) query = query.or(`title.ilike.%${q}%,content.ilike.%${q}%`);
      }
      const result = await query;
      if (result.error) throw result.error;
      return json({ ok: true, items: result.data || [] });
    }
    if (body.explicit !== true) return json({ error: 'explicit_confirmation_required' }, 400);
    if (action === 'remember') return json(await rememberForUser(client, userId, body.data));
    if (action === 'forget') {
      const id = String(body.id || '');
      if (!id) return json({ error: 'id_required' }, 400);
      const result = await client.from('jarvis_memories').update({ active: false })
        .eq('user_id', userId).eq('id', id).select('id').maybeSingle();
      if (result.error) throw result.error;
      if (!result.data) return json({ error: 'record_not_found' }, 404);
      return json({ ok: true, forgotten: result.data.id });
    }
    return json({ error: 'invalid_action' }, 400);
  } catch (error) {
    const code = error instanceof Error ? error.message : 'memory_operation_failed';
    const safe = ['not_authenticated','invalid_session','memory_not_allowed','memory_key_invalid','invalid_payload'].includes(code)
      ? code : 'memory_operation_failed';
    return json({ error: safe }, ['not_authenticated','invalid_session'].includes(safe) ? 401 : 400);
  }
});
