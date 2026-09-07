import { createClient } from 'npm:@supabase/supabase-js@2.115.0'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const PROVIDER = 'google_drive'
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.metadata.readonly'
const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID') || ''
const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET') || ''

function getSecretKey() {
  const raw = Deno.env.get('SUPABASE_SECRET_KEYS')
  if (raw) {
    const parsed = JSON.parse(raw)
    if (parsed.default) return parsed.default
  }
  const legacy = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (legacy) return legacy
  throw new Error('Supabase secret key unavailable')
}

function getPublishableKey() {
  const raw = Deno.env.get('SUPABASE_PUBLISHABLE_KEYS')
  if (raw) {
    const parsed = JSON.parse(raw)
    if (parsed.default) return parsed.default
  }
  const legacy = Deno.env.get('SUPABASE_ANON_KEY')
  if (legacy) return legacy
  throw new Error('Supabase publishable key unavailable')
}

const admin = createClient(SUPABASE_URL, getSecretKey(), {
  auth: { persistSession: false, autoRefreshToken: false },
})

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

function normalizeText(value = '') {
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
}

function safeLimit(value, fallback = 100, max = 500) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.max(1, Math.min(max, Math.floor(n)))
}

function safeOffset(value) {
  const n = Number(value)
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0
}

function driveQueryEscape(value = '') {
  return String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

function technicalMetadata(file) {
  const metadata = {}
  if (file?.driveId) metadata.drive_id = file.driveId
  if (file?.shortcutDetails?.targetId) metadata.shortcut_target_id = file.shortcutDetails.targetId
  if (file?.shortcutDetails?.targetMimeType) metadata.shortcut_target_mime_type = file.shortcutDetails.targetMimeType
  return metadata
}

function normalizeRemoteFile(file, userId) {
  return {
    user_id: userId,
    provider: PROVIDER,
    provider_file_id: String(file.id),
    name: String(file.name || 'Arquivo sem nome'),
    mime_type: String(file.mimeType || 'application/octet-stream'),
    web_view_link: file.webViewLink || null,
    modified_at_provider: file.modifiedTime || null,
    size_bytes: file.size == null ? null : Number(file.size),
    source: 'imported',
    metadata: technicalMetadata(file),
  }
}

function typeFilter(query, type) {
  if (!type || type === 'all') return query
  if (type === 'pdf') return query.eq('mime_type', 'application/pdf')
  if (type === 'folder') return query.eq('mime_type', 'application/vnd.google-apps.folder')
  if (type === 'image') return query.like('mime_type', 'image/%')
  if (type === 'document') return query.or('mime_type.eq.application/vnd.google-apps.document,mime_type.ilike.%wordprocessingml%,mime_type.like.text/%')
  if (type === 'spreadsheet') return query.or('mime_type.eq.application/vnd.google-apps.spreadsheet,mime_type.ilike.%spreadsheetml%,mime_type.eq.text/csv')
  if (type === 'presentation') return query.or('mime_type.eq.application/vnd.google-apps.presentation,mime_type.ilike.%presentationml%')
  return query
}

async function userContext(req) {
  const auth = req.headers.get('Authorization') || ''
  if (!auth) throw Object.assign(new Error('Nao autenticado'), { status: 401, code: 'not_authenticated' })
  const userClient = createClient(SUPABASE_URL, getPublishableKey(), {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error } = await userClient.auth.getUser()
  if (error || !data.user) throw Object.assign(new Error('Sessao invalida'), { status: 401, code: 'invalid_session' })
  return { userClient, user: data.user }
}

async function driveConnection(userClient, userId) {
  const { data: connection, error } = await userClient.from('jarvis_connections')
    .select('id,provider,status,display_name,scopes,metadata,updated_at')
    .eq('user_id', userId)
    .eq('provider', PROVIDER)
    .eq('status', 'connected')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  if (!connection) throw Object.assign(new Error('Google Drive nao conectado'), { status: 409, code: 'drive_not_connected' })
  if (!Array.isArray(connection.scopes) || !connection.scopes.includes(DRIVE_SCOPE)) {
    throw Object.assign(new Error('Escopo drive.metadata.readonly ausente'), { status: 409, code: 'drive_scope_missing' })
  }
  return connection
}

async function accessTokenFor(userClient, userId) {
  const connection = await driveConnection(userClient, userId)
  const { data: secret, error } = await admin.from('jarvis_connection_secrets')
    .select('access_token,refresh_token,token_type,expires_at,scope')
    .eq('connection_id', connection.id)
    .eq('user_id', userId)
    .maybeSingle()
  if (error || !secret) throw Object.assign(new Error('Credenciais do Google Drive nao encontradas'), { status: 409, code: 'drive_credentials_missing' })

  const expiresAt = secret.expires_at ? new Date(secret.expires_at).getTime() : 0
  if (secret.access_token && expiresAt > Date.now() + 120000) return { accessToken: secret.access_token, connection }
  if (!secret.refresh_token) throw Object.assign(new Error('Refresh token do Google Drive ausente'), { status: 409, code: 'drive_refresh_token_missing' })
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) throw Object.assign(new Error('Google OAuth nao configurado'), { status: 503, code: 'google_oauth_not_configured' })

  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: secret.refresh_token,
      grant_type: 'refresh_token',
    }),
  })
  const payload = await r.json().catch(() => ({}))
  if (!r.ok || !payload.access_token) {
    throw Object.assign(new Error(payload?.error_description || payload?.error || 'Falha ao renovar token do Google Drive'), { status: 502, code: 'drive_refresh_failed' })
  }
  const newExpiry = payload.expires_in ? new Date(Date.now() + Number(payload.expires_in) * 1000).toISOString() : null
  await admin.from('jarvis_connection_secrets').update({
    access_token: payload.access_token,
    token_type: payload.token_type || secret.token_type || 'Bearer',
    expires_at: newExpiry,
    scope: payload.scope || secret.scope || null,
    updated_at: new Date().toISOString(),
  }).eq('connection_id', connection.id).eq('user_id', userId)
  return { accessToken: payload.access_token, connection }
}

async function googleList(accessToken, options = {}) {
  const pageSize = safeLimit(options.page_size, 100, 1000)
  const q = ["trashed = false"]
  if (options.name_query) q.push(`name contains '${driveQueryEscape(options.name_query)}'`)
  if (options.mime_type) q.push(`mimeType = '${driveQueryEscape(options.mime_type)}'`)
  const params = new URLSearchParams({
    pageSize: String(pageSize),
    spaces: 'drive',
    q: q.join(' and '),
    orderBy: 'modifiedTime desc',
    fields: 'nextPageToken,files(id,name,mimeType,webViewLink,modifiedTime,size,driveId,shortcutDetails(targetId,targetMimeType))',
  })
  if (options.page_token) params.set('pageToken', String(options.page_token))
  const r = await fetch(`https://www.googleapis.com/drive/v3/files?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  const payload = await r.json().catch(() => ({}))
  if (!r.ok) {
    const message = payload?.error?.message || `Google Drive ${r.status}`
    throw Object.assign(new Error(message), { status: 502, code: 'drive_read_failed' })
  }
  return { files: Array.isArray(payload.files) ? payload.files : [], next_page_token: payload.nextPageToken || null }
}

async function googleGet(accessToken, fileId) {
  const fields = 'id,name,mimeType,webViewLink,modifiedTime,size,driveId,shortcutDetails(targetId,targetMimeType)'
  const r = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=${encodeURIComponent(fields)}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  const payload = await r.json().catch(() => ({}))
  if (!r.ok) throw Object.assign(new Error(payload?.error?.message || `Google Drive ${r.status}`), { status: 502, code: 'drive_get_failed' })
  return payload
}

async function canonicalList(userClient, userId, body) {
  const limit = safeLimit(body.limit, 100, 200)
  const offset = safeOffset(body.offset)
  let query = userClient.from('jarvis_files').select('*', { count: 'exact' }).eq('user_id', userId).eq('provider', PROVIDER)
  const q = String(body.q || '').trim()
  if (q) query = query.ilike('name', `%${q.replace(/[%_]/g, '\\$&')}%`)
  if (body.project_id === 'none') query = query.is('project_id', null)
  else if (body.project_id) query = query.eq('project_id', body.project_id)
  query = typeFilter(query, String(body.type || 'all'))
  const { data, error, count } = await query.order('modified_at_provider', { ascending: false, nullsFirst: false }).order('name', { ascending: true }).range(offset, offset + limit - 1)
  if (error) throw error
  return { items: data || [], count: count || 0, limit, offset }
}

async function syncFiles(userClient, userId) {
  const { accessToken } = await accessTokenFor(userClient, userId)
  const remote = []
  let pageToken = null
  let pages = 0
  do {
    const page = await googleList(accessToken, { page_size: 1000, page_token: pageToken })
    remote.push(...page.files)
    pageToken = page.next_page_token
    pages += 1
    if (pages >= 50 && pageToken) throw Object.assign(new Error('Drive muito grande para uma sincronizacao unica. Nenhum metadado foi removido.'), { status: 413, code: 'drive_sync_page_limit' })
  } while (pageToken)

  const rows = remote.map((file) => normalizeRemoteFile(file, userId))
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500)
    const { error } = await userClient.from('jarvis_files').upsert(chunk, { onConflict: 'user_id,provider,provider_file_id' })
    if (error) throw error
  }

  const seen = new Set(rows.map((row) => row.provider_file_id))
  const { data: existing, error: existingError } = await userClient.from('jarvis_files').select('id,provider_file_id').eq('user_id', userId).eq('provider', PROVIDER)
  if (existingError) throw existingError
  const staleIds = (existing || []).filter((row) => !seen.has(row.provider_file_id)).map((row) => row.id)
  for (let i = 0; i < staleIds.length; i += 200) {
    const { error } = await userClient.from('jarvis_files').delete().in('id', staleIds.slice(i, i + 200))
    if (error) throw error
  }

  return { synced: rows.length, removed: staleIds.length, pages, synced_at: new Date().toISOString() }
}

function fileTypeLabel(mime = '') {
  if (mime === 'application/pdf') return 'PDF'
  if (mime === 'application/vnd.google-apps.folder') return 'pasta'
  if (mime.startsWith('image/')) return 'imagem'
  if (mime === 'application/vnd.google-apps.spreadsheet' || mime.includes('spreadsheet')) return 'planilha'
  if (mime === 'application/vnd.google-apps.presentation' || mime.includes('presentation')) return 'apresentacao'
  if (mime === 'application/vnd.google-apps.document' || mime.includes('wordprocessing') || mime.startsWith('text/')) return 'documento'
  return 'arquivo'
}

function queryTerms(message) {
  const stop = new Set(['jarvis','arquivo','arquivos','file','files','encontre','encontrar','mostre','mostrar','qual','quais','tenho','sobre','esta','estao','ligado','ligados','ligada','ligadas','projeto','pdf','com','para','uma','um','meu','meus','minha','minhas','do','da','de','dos','das','no','na','nos','nas','ao','aos','e'])
  return normalizeText(message).split(/[^a-z0-9]+/).filter((word) => word.length >= 3 && !stop.has(word))
}

async function jarvisQuery(userClient, userId, message) {
  const normalizedMessage = normalizeText(message)
  const [{ data: projects, error: projectError }, { data: files, error: fileError }] = await Promise.all([
    userClient.from('jarvis_projects').select('id,name').eq('user_id', userId).limit(200),
    userClient.from('jarvis_files').select('id,name,mime_type,web_view_link,modified_at_provider,project_id').eq('user_id', userId).eq('provider', PROVIDER).order('modified_at_provider', { ascending: false, nullsFirst: false }).limit(1000),
  ])
  if (projectError) throw projectError
  if (fileError) throw fileError

  const project = (projects || []).find((p) => normalizedMessage.includes(normalizeText(p.name))) || null
  const terms = queryTerms(message)
  const wantsPdf = /\bpdf\b/i.test(message)
  const scored = (files || []).map((file) => {
    const name = normalizeText(file.name)
    let score = 0
    if (project && file.project_id === project.id) score += 20
    if (project && file.project_id !== project.id) score -= 20
    if (wantsPdf && file.mime_type === 'application/pdf') score += 8
    if (wantsPdf && file.mime_type !== 'application/pdf') score -= 8
    for (const term of terms) if (name.includes(term)) score += 4
    return { ...file, score }
  }).filter((file) => {
    if (project && file.project_id !== project.id) return false
    if (wantsPdf && file.mime_type !== 'application/pdf') return false
    if (terms.length && !terms.some((term) => normalizeText(file.name).includes(term)) && !project) return false
    return true
  }).sort((a, b) => b.score - a.score || new Date(b.modified_at_provider || 0) - new Date(a.modified_at_provider || 0)).slice(0, 8)

  const projectNames = new Map((projects || []).map((p) => [p.id, p.name]))
  let reply
  if (!scored.length) {
    reply = project ? `Nao encontrei arquivos sincronizados ligados ao projeto ${project.name}. Abra Arquivos e use Atualizar arquivos se o Drive mudou recentemente.` : 'Nao encontrei arquivos sincronizados com esses termos. Abra Arquivos e use Atualizar arquivos se o Drive mudou recentemente.'
  } else {
    const intro = project ? `Encontrei ${scored.length} arquivo${scored.length === 1 ? '' : 's'} ligado${scored.length === 1 ? '' : 's'} ao projeto ${project.name}:` : `Encontrei ${scored.length} arquivo${scored.length === 1 ? '' : 's'}:`
    const lines = scored.map((file, index) => {
      const context = file.project_id ? ` · projeto ${projectNames.get(file.project_id) || 'relacionado'}` : ''
      const link = file.web_view_link ? ` · ${file.web_view_link}` : ''
      return `${index + 1}. ${file.name} (${fileTypeLabel(file.mime_type)})${context}${link}`
    })
    reply = `${intro}\n${lines.join('\n')}`
  }

  const now = new Date().toISOString()
  const { data: inbound, error: inboundError } = await userClient.from('jarvis_messages').insert({
    user_id: userId,
    channel: 'web',
    direction: 'inbound',
    message_type: 'text',
    body: message,
    intent: 'query',
    confidence: 1,
    status: 'processed',
    processed_at: now,
    raw_data: { engine: 'jarvis-drive-metadata', metadata_only: true },
  }).select('id').single()
  if (inboundError) throw inboundError
  const { error: outboundError } = await userClient.from('jarvis_messages').insert({
    user_id: userId,
    channel: 'web',
    direction: 'outbound',
    message_type: 'text',
    body: reply,
    intent: 'query',
    confidence: 1,
    status: 'processed',
    processed_at: now,
    reply_to_id: inbound.id,
    raw_data: { engine: 'jarvis-drive-metadata', metadata_only: true, file_ids: scored.map((file) => file.id) },
  })
  if (outboundError) throw outboundError
  return { reply, items: scored, engine: 'jarvis-drive-metadata' }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Metodo nao suportado' }, 405)

  try {
    const { userClient, user } = await userContext(req)
    const body = await req.json().catch(() => ({}))
    const action = String(body?.action || 'list')
    const write = ['sync', 'link', 'unlink', 'jarvis_query'].includes(action)
    if (write && body?.explicit !== true) return json({ error: 'Acao explicita obrigatoria', code: 'explicit_required' }, 400)

    if (action === 'status') {
      const connection = await driveConnection(userClient, user.id)
      return json({ ok: true, connected: true, provider: PROVIDER, display_name: connection.display_name || null, scopes: connection.scopes || [] })
    }
    if (action === 'remote_list') {
      const { accessToken } = await accessTokenFor(userClient, user.id)
      const page = await googleList(accessToken, { page_size: body.page_size, page_token: body.page_token, name_query: body.q, mime_type: body.mime_type })
      return json({ ok: true, items: page.files.map((file) => normalizeRemoteFile(file, user.id)), next_page_token: page.next_page_token })
    }
    if (action === 'remote_get') {
      if (!body.provider_file_id) return json({ error: 'provider_file_id obrigatorio' }, 400)
      const { accessToken } = await accessTokenFor(userClient, user.id)
      const file = await googleGet(accessToken, String(body.provider_file_id))
      return json({ ok: true, item: normalizeRemoteFile(file, user.id) })
    }
    if (action === 'sync') {
      const result = await syncFiles(userClient, user.id)
      return json({ ok: true, ...result })
    }
    if (action === 'list') {
      return json({ ok: true, ...(await canonicalList(userClient, user.id, body)) })
    }
    if (action === 'get') {
      const { data, error } = await userClient.from('jarvis_files').select('*').eq('user_id', user.id).eq('id', body.id).maybeSingle()
      if (error) throw error
      return json({ ok: true, item: data || null })
    }
    if (action === 'link') {
      if (!body.id || !body.project_id) return json({ error: 'id e project_id obrigatorios' }, 400)
      const { data, error } = await userClient.from('jarvis_files').update({ project_id: body.project_id }).eq('user_id', user.id).eq('id', body.id).select('*').single()
      if (error) throw error
      return json({ ok: true, item: data })
    }
    if (action === 'unlink') {
      if (!body.id) return json({ error: 'id obrigatorio' }, 400)
      const { data, error } = await userClient.from('jarvis_files').update({ project_id: null }).eq('user_id', user.id).eq('id', body.id).select('*').single()
      if (error) throw error
      return json({ ok: true, item: data })
    }
    if (action === 'jarvis_query') {
      const message = String(body.message || '').trim()
      if (!message) return json({ error: 'message obrigatoria' }, 400)
      return json({ ok: true, ...(await jarvisQuery(userClient, user.id, message)) })
    }
    return json({ error: 'Acao nao suportada', code: 'unsupported_action' }, 400)
  } catch (e) {
    console.error(e)
    const status = Number(e?.status || 500)
    return json({ error: e instanceof Error ? e.message : String(e), code: e?.code || 'drive_unavailable' }, status)
  }
})
