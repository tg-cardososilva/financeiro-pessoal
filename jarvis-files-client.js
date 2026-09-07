function ensureSupabase(supabase) {
  if (!supabase?.functions?.invoke) throw new Error('jarvis_files_client_unavailable')
}

const WRITE_ACTIONS = new Set(['sync', 'link', 'unlink', 'jarvis_query'])

async function request(supabase, action, payload = {}) {
  ensureSupabase(supabase)
  const body = { action, ...payload, ...(WRITE_ACTIONS.has(action) ? { explicit: true } : {}) }
  const { data, error } = await supabase.functions.invoke('jarvis-drive', { body })
  if (error) throw error
  if (data?.error) throw new Error(data.error)
  return data
}

export async function fileStatus(supabase) {
  return request(supabase, 'status')
}

export async function fileList(supabase, options = {}) {
  const data = await request(supabase, 'list', { limit: 100, offset: 0, ...options })
  return { items: data?.items || [], count: Number(data?.count || 0), limit: Number(data?.limit || 100), offset: Number(data?.offset || 0) }
}

export async function fileGet(supabase, id) {
  const data = await request(supabase, 'get', { id })
  return data?.item || null
}

export async function fileSync(supabase) {
  return request(supabase, 'sync')
}

export async function fileLinkProject(supabase, id, projectId) {
  const data = await request(supabase, 'link', { id, project_id: projectId })
  return data?.item || null
}

export async function fileUnlinkProject(supabase, id) {
  const data = await request(supabase, 'unlink', { id })
  return data?.item || null
}

export async function fileRemoteList(supabase, options = {}) {
  const data = await request(supabase, 'remote_list', options)
  return { items: data?.items || [], nextPageToken: data?.next_page_token || null }
}

export async function fileRemoteGet(supabase, providerFileId) {
  const data = await request(supabase, 'remote_get', { provider_file_id: providerFileId })
  return data?.item || null
}

export async function fileJarvisQuery(supabase, message) {
  return request(supabase, 'jarvis_query', { message })
}
