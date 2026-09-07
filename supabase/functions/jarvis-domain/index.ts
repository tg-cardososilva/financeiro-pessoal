import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const headers = { ...cors, 'Content-Type': 'application/json' };
const SOURCES = new Set(['manual_web','jarvis_web','whatsapp','imported','system']);
const TABLES = { task: 'jarvis_tasks', note: 'jarvis_notes', project: 'jarvis_projects' };

function cleanSource(value: string) {
  return SOURCES.has(value) ? value : 'manual_web';
}
function requireExplicit(body: any) {
  if (body?.explicit !== true) throw new Error('explicit_confirmation_required');
}
function allowedPayload(entity: string, input: Record<string, any> = {}, creating = false) {
  const out: Record<string, any> = {};
  const copy = (keys: string[]) => keys.forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(input, key)) out[key] = input[key];
  });
  if (entity === 'task') copy(['project_id','title','description','status','priority','due_at','completed_at','recurrence_rule']);
  if (entity === 'note') copy(['project_id','title','content','note_type','tags']);
  if (entity === 'project') copy(['name','description','status','due_at','archived_at']);
  if (creating) out.source = cleanSource(input.source);
  return out;
}
function tableFor(entity: string) {
  const table = TABLES[entity as keyof typeof TABLES];
  if (!table) throw new Error('invalid_entity');
  return table;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'method_not_allowed' }), { status: 405, headers });
  try {
    const auth = req.headers.get('Authorization');
    if (!auth) return new Response(JSON.stringify({ error: 'not_authenticated' }), { status: 401, headers });
    const url = Deno.env.get('SUPABASE_URL');
    const anon = Deno.env.get('SUPABASE_ANON_KEY');
    if (!url || !anon) throw new Error('supabase_configuration_missing');
    const supabase = createClient(url, anon, { global: { headers: { Authorization: auth } } });
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) return new Response(JSON.stringify({ error: 'invalid_session' }), { status: 401, headers });
    const userId = userData.user.id;
    const body = await req.json();
    const entity = String(body?.entity || '');
    const action = String(body?.action || 'list');
    const table = tableFor(entity);

    if (action === 'list') {
      let query = supabase.from(table).select('*').eq('user_id', userId);
      if (body?.project_id) query = query.eq('project_id', body.project_id);
      if (body?.status && entity !== 'note') query = query.eq('status', body.status);
      if (body?.q) {
        const q = String(body.q).replace(/[,%()]/g, ' ').trim();
        if (q) query = entity === 'project' ? query.ilike('name', `%${q}%`) : query.ilike('title', `%${q}%`);
      }
      query = query.order('updated_at', { ascending: false }).limit(Math.min(Math.max(Number(body?.limit) || 100, 1), 200));
      const { data, error } = await query;
      if (error) throw error;
      return new Response(JSON.stringify({ ok: true, items: data || [] }), { headers });
    }

    if (action === 'get') {
      if (!body?.id) throw new Error('id_required');
      const { data, error } = await supabase.from(table).select('*').eq('user_id', userId).eq('id', body.id).single();
      if (error) throw error;
      return new Response(JSON.stringify({ ok: true, item: data }), { headers });
    }

    requireExplicit(body);

    if (action === 'create') {
      const payload = { ...allowedPayload(entity, body?.data || {}, true), user_id: userId };
      const { data, error } = await supabase.from(table).insert(payload).select('*').single();
      if (error) throw error;
      return new Response(JSON.stringify({ ok: true, item: data }), { headers });
    }

    if (action === 'update') {
      if (!body?.id) throw new Error('id_required');
      const payload = allowedPayload(entity, body?.data || {}, false);
      delete payload.source;
      delete payload.user_id;
      const { data, error } = await supabase.from(table).update(payload).eq('user_id', userId).eq('id', body.id).select('*').single();
      if (error) throw error;
      return new Response(JSON.stringify({ ok: true, item: data }), { headers });
    }

    const semantic: Record<string, [string, Record<string, any>]> = {
      task_complete: ['task', { status: 'completed' }],
      task_reopen: ['task', { status: 'open', completed_at: null }],
      task_cancel: ['task', { status: 'cancelled' }],
      project_complete: ['project', { status: 'completed' }],
      project_archive: ['project', { status: 'archived' }],
      project_reopen: ['project', { status: 'active', archived_at: null }],
      project_pause: ['project', { status: 'paused' }],
    };
    if (semantic[action]) {
      const [expected, payload] = semantic[action];
      if (entity !== expected) throw new Error('invalid_semantic_action');
      if (!body?.id) throw new Error('id_required');
      const { data, error } = await supabase.from(table).update(payload).eq('user_id', userId).eq('id', body.id).select('*').single();
      if (error) throw error;
      return new Response(JSON.stringify({ ok: true, item: data }), { headers });
    }

    if (action === 'delete') {
      if (!body?.id) throw new Error('id_required');
      const { data, error } = await supabase.from(table).delete().eq('user_id', userId).eq('id', body.id).select('id').single();
      if (error) throw error;
      return new Response(JSON.stringify({ ok: true, deleted: data?.id }), { headers });
    }

    throw new Error('invalid_action');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = ['explicit_confirmation_required','invalid_entity','invalid_action','invalid_semantic_action','id_required'].includes(message) ? 400 : 409;
    return new Response(JSON.stringify({ error: message }), { status, headers });
  }
});
