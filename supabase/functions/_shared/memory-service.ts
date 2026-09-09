const TYPES = new Set(['preference','fact','context','decision','rule','routine','project_context']);

function normalize(value: unknown) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 100);
}

export async function rememberForUser(client: any, userId: string, input: any) {
  const type = String(input?.memory_type || '');
  if (!TYPES.has(type)) throw new Error('memory_not_allowed');
  const title = String(input?.title || '').replace(/\s+/g, ' ').trim().slice(0, 200);
  const content = String(input?.content || '').trim().slice(0, 12000);
  const importance = Math.min(5, Math.max(1, Math.floor(Number(input?.importance) || 3)));
  if (!title || !content) throw new Error('invalid_payload');
  const key = [type, normalize(input?.scope || 'personal'), normalize(title)].filter(Boolean).join(':');
  if (key.length < 8) throw new Error('memory_key_invalid');
  const existingResult = await client.from('jarvis_memories').select('*')
    .eq('user_id', userId).eq('memory_key', key).eq('active', true).maybeSingle();
  if (existingResult.error) throw existingResult.error;
  const existing = existingResult.data;
  if (existing && existing.content === content && existing.memory_type === type) {
    return { ok: true, item: existing, unchanged: true };
  }
  if (existing) {
    const revision = await client.from('jarvis_memory_revisions').insert({
      user_id: userId, memory_id: existing.id, previous_memory_type: existing.memory_type,
      previous_title: existing.title, previous_content: existing.content,
      previous_importance: existing.importance, reason: 'newer_explicit_information',
    });
    if (revision.error) throw revision.error;
    const updated = await client.from('jarvis_memories').update({
      memory_type: type, title, content, importance, expires_at: input.expires_at || null,
      metadata: { ...(existing.metadata || {}), scope: input.scope || 'personal', conflict_policy: 'newest_explicit_wins' },
    }).eq('user_id', userId).eq('id', existing.id).select('*').single();
    if (updated.error) throw updated.error;
    return { ok: true, item: updated.data, updated: true };
  }
  const created = await client.from('jarvis_memories').insert({
    user_id: userId, memory_type: type, title, content, importance, active: true,
    expires_at: input.expires_at || null, memory_key: key,
    metadata: { scope: input.scope || 'personal', capture: 'explicit_only' },
  }).select('*').single();
  if (created.error) throw created.error;
  return { ok: true, item: created.data, created: true };
}
