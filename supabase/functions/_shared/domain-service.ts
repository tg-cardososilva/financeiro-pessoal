const SOURCES = new Set(['manual_web','jarvis_web','whatsapp','imported','system']);
const TABLES = { task: 'jarvis_tasks', note: 'jarvis_notes', project: 'jarvis_projects' };
const TASK_STATUS = new Set(['open','completed','cancelled']);
const TASK_PRIORITY = new Set(['low','normal','high','urgent']);
const NOTE_TYPES = new Set(['note','idea','reference']);
const PROJECT_STATUS = new Set(['active','paused','completed','archived']);

function tableFor(entity: string) {
  const table = TABLES[entity as keyof typeof TABLES];
  if (!table) throw new Error('invalid_entity');
  return table;
}

function cleanString(value: unknown, max: number, required = false) {
  const result = String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
  if (required && !result) throw new Error('invalid_payload');
  return result || null;
}

function cleanIdempotencyKey(value: unknown) {
  if (value == null || value === '') return null;
  const key = String(value).trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$/.test(key)) throw new Error('idempotency_key_invalid');
  return key;
}

function cleanSource(value: unknown) {
  const source = String(value || '');
  return SOURCES.has(source) ? source : 'manual_web';
}

async function assertOwnedProject(client: any, userId: string, projectId: unknown) {
  if (!projectId) return null;
  const id = String(projectId);
  const { data, error } = await client.from('jarvis_projects').select('id').eq('user_id', userId).eq('id', id).maybeSingle();
  if (error || !data) throw new Error('project_not_found');
  return id;
}

async function createPayload(client: any, userId: string, entity: string, input: Record<string, unknown>, source: string) {
  if (entity === 'task') {
    const status = String(input.status || 'open');
    const priority = String(input.priority || 'normal');
    if (!TASK_STATUS.has(status) || !TASK_PRIORITY.has(priority)) throw new Error('invalid_payload');
    return {
      user_id: userId,
      project_id: await assertOwnedProject(client, userId, input.project_id),
      title: cleanString(input.title, 240, true),
      description: cleanString(input.description, 4000),
      status,
      priority,
      due_at: input.due_at || null,
      completed_at: status === 'completed' ? (input.completed_at || new Date().toISOString()) : null,
      recurrence_rule: cleanString(input.recurrence_rule, 500),
      source: cleanSource(source),
    };
  }
  if (entity === 'note') {
    const noteType = String(input.note_type || 'note');
    if (!NOTE_TYPES.has(noteType)) throw new Error('invalid_payload');
    const tags = Array.isArray(input.tags)
      ? [...new Set(input.tags.map((tag) => cleanString(tag, 48)).filter(Boolean))].slice(0, 20)
      : [];
    return {
      user_id: userId,
      project_id: await assertOwnedProject(client, userId, input.project_id),
      title: cleanString(input.title, 240, true),
      content: String(input.content ?? '').trim().slice(0, 50000),
      note_type: noteType,
      tags,
      source: cleanSource(source),
    };
  }
  const status = String(input.status || 'active');
  if (!PROJECT_STATUS.has(status)) throw new Error('invalid_payload');
  return {
    user_id: userId,
    name: cleanString(input.name, 240, true),
    description: cleanString(input.description, 8000),
    status,
    due_at: input.due_at || null,
    archived_at: status === 'archived' ? (input.archived_at || new Date().toISOString()) : null,
    source: cleanSource(source),
  };
}

async function updatePayload(client: any, userId: string, entity: string, input: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  if (entity === 'task') {
    if ('project_id' in input) out.project_id = await assertOwnedProject(client, userId, input.project_id);
    if ('title' in input) out.title = cleanString(input.title, 240, true);
    if ('description' in input) out.description = cleanString(input.description, 4000);
    if ('status' in input) {
      const status = String(input.status);
      if (!TASK_STATUS.has(status)) throw new Error('invalid_payload');
      out.status = status;
      out.completed_at = status === 'completed' ? new Date().toISOString() : null;
    }
    if ('priority' in input) {
      const priority = String(input.priority);
      if (!TASK_PRIORITY.has(priority)) throw new Error('invalid_payload');
      out.priority = priority;
    }
    if ('due_at' in input) out.due_at = input.due_at || null;
    if ('recurrence_rule' in input) out.recurrence_rule = cleanString(input.recurrence_rule, 500);
  } else if (entity === 'note') {
    if ('project_id' in input) out.project_id = await assertOwnedProject(client, userId, input.project_id);
    if ('title' in input) out.title = cleanString(input.title, 240, true);
    if ('content' in input) out.content = String(input.content ?? '').trim().slice(0, 50000);
    if ('note_type' in input) {
      const noteType = String(input.note_type);
      if (!NOTE_TYPES.has(noteType)) throw new Error('invalid_payload');
      out.note_type = noteType;
    }
    if ('tags' in input) out.tags = Array.isArray(input.tags)
      ? [...new Set(input.tags.map((tag) => cleanString(tag, 48)).filter(Boolean))].slice(0, 20)
      : [];
  } else {
    if ('name' in input) out.name = cleanString(input.name, 240, true);
    if ('description' in input) out.description = cleanString(input.description, 8000);
    if ('status' in input) {
      const status = String(input.status);
      if (!PROJECT_STATUS.has(status)) throw new Error('invalid_payload');
      out.status = status;
      out.archived_at = status === 'archived' ? new Date().toISOString() : null;
    }
    if ('due_at' in input) out.due_at = input.due_at || null;
  }
  if (!Object.keys(out).length) throw new Error('invalid_payload');
  return out;
}

async function previousReceipt(client: any, userId: string, key: string | null) {
  if (!key) return null;
  const { data } = await client.from('jarvis_operation_receipts')
    .select('response,status').eq('user_id', userId).eq('idempotency_key', key).maybeSingle();
  return data?.status === 'completed' ? data.response : null;
}

async function storeReceipt(client: any, userId: string, key: string | null, operation: string, entity: string, response: any) {
  if (!key) return;
  const row = {
    user_id: userId, idempotency_key: key, operation, status: 'completed',
    resource_type: entity, resource_id: response?.item?.id || response?.deleted || null, response,
  };
  const { error } = await client.from('jarvis_operation_receipts').upsert(row, { onConflict: 'user_id,idempotency_key', ignoreDuplicates: true });
  if (error && error.code !== '23505') throw error;
}

export async function executeDomainAction(client: any, userId: string, body: Record<string, any>) {
  const entity = String(body?.entity || '');
  const action = String(body?.action || 'list');
  const table = tableFor(entity);

  if (action === 'list') {
    let query = client.from(table).select('*').eq('user_id', userId);
    if (body.project_id && entity !== 'project') query = query.eq('project_id', body.project_id);
    if (body.status && entity !== 'note') query = query.eq('status', body.status);
    if (body.q) {
      const q = String(body.q).replace(/[,%()]/g, ' ').trim();
      if (q) query = entity === 'project'
        ? query.or(`name.ilike.%${q}%,description.ilike.%${q}%`)
        : query.or(`title.ilike.%${q}%,${entity === 'note' ? 'content' : 'description'}.ilike.%${q}%`);
    }
    query = query.order('updated_at', { ascending: false }).limit(Math.min(Math.max(Number(body.limit) || 100, 1), 200));
    const { data, error } = await query;
    if (error) throw error;
    return { ok: true, items: data || [] };
  }

  if (action === 'get') {
    if (!body.id) throw new Error('id_required');
    const { data, error } = await client.from(table).select('*').eq('user_id', userId).eq('id', body.id).maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('record_not_found');
    return { ok: true, item: data };
  }

  if (body.explicit !== true) throw new Error('explicit_confirmation_required');
  const key = cleanIdempotencyKey(body.idempotency_key);
  const receipt = await previousReceipt(client, userId, key);
  if (receipt) return { ...receipt, idempotent_replay: true };

  let response: any;
  if (action === 'create') {
    if (key) {
      const { data: existing } = await client.from(table).select('*').eq('user_id', userId).eq('idempotency_key', key).maybeSingle();
      if (existing) return { ok: true, item: existing, idempotent_replay: true };
    }
    const payload = await createPayload(client, userId, entity, body.data || {}, body.data?.source);
    if (key) (payload as Record<string, unknown>).idempotency_key = key;
    const { data, error } = await client.from(table).insert(payload).select('*').single();
    if (error) {
      if (error.code === '23505' && key) {
        const { data: existing } = await client.from(table).select('*').eq('user_id', userId).eq('idempotency_key', key).single();
        response = { ok: true, item: existing, idempotent_replay: true };
      } else throw error;
    } else response = { ok: true, item: data };
  } else if (action === 'update') {
    if (!body.id) throw new Error('id_required');
    const payload = await updatePayload(client, userId, entity, body.data || {});
    const { data, error } = await client.from(table).update(payload).eq('user_id', userId).eq('id', body.id).select('*').maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('record_not_found');
    response = { ok: true, item: data };
  } else {
    const now = new Date().toISOString();
    const semantic: Record<string, [string, Record<string, unknown>]> = {
      task_complete: ['task', { status: 'completed', completed_at: now }],
      task_reopen: ['task', { status: 'open', completed_at: null }],
      task_cancel: ['task', { status: 'cancelled', completed_at: null }],
      project_complete: ['project', { status: 'completed', archived_at: null }],
      project_archive: ['project', { status: 'archived', archived_at: now }],
      project_reopen: ['project', { status: 'active', archived_at: null }],
      project_pause: ['project', { status: 'paused', archived_at: null }],
    };
    if (semantic[action]) {
      const [expected, payload] = semantic[action];
      if (entity !== expected) throw new Error('invalid_semantic_action');
      if (!body.id) throw new Error('id_required');
      const { data, error } = await client.from(table).update(payload).eq('user_id', userId).eq('id', body.id).select('*').maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('record_not_found');
      response = { ok: true, item: data };
    } else if (action === 'delete') {
      if (!body.id) throw new Error('id_required');
      const { data, error } = await client.from(table).delete().eq('user_id', userId).eq('id', body.id).select('id').maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('record_not_found');
      response = { ok: true, deleted: data.id };
    } else throw new Error('invalid_action');
  }

  await storeReceipt(client, userId, key, `${entity}:${action}`, entity, response);
  return response;
}
