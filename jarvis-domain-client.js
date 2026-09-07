function ensureSupabase(supabase) {
  if (!supabase?.functions?.invoke) throw new Error('jarvis_domain_client_unavailable')
}

async function request(supabase, entity, action, payload = {}) {
  ensureSupabase(supabase)
  const write = !['list', 'get'].includes(action)
  const body = { entity, action, ...payload, ...(write ? { explicit: true } : {}) }
  const { data, error } = await supabase.functions.invoke('jarvis-domain', { body })
  if (error) throw error
  if (data?.error) throw new Error(data.error)
  return data
}

export async function domainList(supabase, entity, options = {}) {
  const data = await request(supabase, entity, 'list', { limit: 200, ...options })
  return data?.items || []
}
export async function domainGet(supabase, entity, id) {
  const data = await request(supabase, entity, 'get', { id })
  return data?.item || null
}
export async function domainCreate(supabase, entity, values) {
  const data = await request(supabase, entity, 'create', { data: { ...values, source: values?.source || 'manual_web' } })
  return data?.item || null
}
export async function domainUpdate(supabase, entity, id, values) {
  const data = await request(supabase, entity, 'update', { id, data: values })
  return data?.item || null
}
export async function domainDelete(supabase, entity, id) {
  return request(supabase, entity, 'delete', { id })
}
export async function domainTransition(supabase, entity, id, action) {
  const data = await request(supabase, entity, action, { id })
  return data?.item || null
}
