import { createClient } from 'npm:@supabase/supabase-js@2.115.0'
import { DRIVE_FOLDER_MIME, driveRootConfig, isFileInsideRoot } from './scope-core.js'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''
const DRIVE_PROVIDER = 'google_drive'
const DRIVE_METADATA_SCOPE = 'https://www.googleapis.com/auth/drive.metadata.readonly'
const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file'
const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID') || ''
const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET') || ''
const GOOGLE_PICKER_API_KEY = Deno.env.get('GOOGLE_PICKER_API_KEY') || ''
const GOOGLE_PICKER_APP_ID = Deno.env.get('GOOGLE_PICKER_APP_ID') || '693750017199'
const WORKER_URL = Deno.env.get('DOCUMENT_AI_WORKER_URL') || ''
const WORKER_SECRET = Deno.env.get('JARVIS_DOCUMENT_WORKER_SECRET') || ''
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY') || ''
const OPENAI_MODEL = Deno.env.get('OPENAI_DOCUMENT_MODEL') || Deno.env.get('OPENAI_MODEL') || 'gpt-5.6-luna'
const PROCESSOR = 'document_ai_ocr_openai_v1'
const MAX_BYTES = 20 * 1024 * 1024
const MAX_INTERPRET_CHARS = 120000
const DOCAI_LIST_PRICE_PER_PAGE_USD = 0.0015
const SUPPORTED_MIME = new Set(['application/pdf', 'image/jpeg', 'image/png'])
const DOCUMENT_TYPES = new Set([
  'unknown',
  'financial_invoice', 'financial_receipt', 'financial_proof',
  'contract', 'administrative',
  'travel_reservation', 'travel_ticket', 'travel_lodging', 'travel_other',
])

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

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

function appError(message: string, code: string, status = 400) {
  return Object.assign(new Error(message), { code, status })
}

async function userContext(req: Request) {
  const auth = req.headers.get('Authorization') || ''
  if (!auth) throw appError('Nao autenticado', 'not_authenticated', 401)
  const userClient = createClient(SUPABASE_URL, getPublishableKey(), {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error } = await userClient.auth.getUser()
  if (error || !data.user) throw appError('Sessao invalida', 'invalid_session', 401)
  return { userClient, user: data.user }
}

async function driveConnection(userClient: any, userId: string) {
  const { data, error } = await userClient.from('jarvis_connections')
    .select('id,status,display_name,scopes,metadata,updated_at')
    .eq('user_id', userId)
    .eq('provider', DRIVE_PROVIDER)
    .eq('status', 'connected')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  if (!data) throw appError('Google Drive nao conectado', 'drive_not_connected', 409)
  driveRootConfig(data)
  return data
}

function hasScope(connection: any, scope: string) {
  return Array.isArray(connection?.scopes) && connection.scopes.includes(scope)
}

async function driveAccessToken(userClient: any, userId: string, requireFileScope = false) {
  const connection = await driveConnection(userClient, userId)
  if (!hasScope(connection, DRIVE_METADATA_SCOPE)) throw appError('Escopo drive.metadata.readonly ausente', 'drive_metadata_scope_missing', 409)
  if (requireFileScope && !hasScope(connection, DRIVE_FILE_SCOPE)) throw appError('Autorize o acesso drive.file para ler documentos selecionados', 'drive_file_scope_missing', 409)
  const { data: secret, error } = await admin.from('jarvis_connection_secrets')
    .select('access_token,refresh_token,token_type,expires_at,scope')
    .eq('connection_id', connection.id)
    .eq('user_id', userId)
    .maybeSingle()
  if (error || !secret) throw appError('Credenciais do Google Drive nao encontradas', 'drive_credentials_missing', 409)
  const expiresAt = secret.expires_at ? new Date(secret.expires_at).getTime() : 0
  if (secret.access_token && expiresAt > Date.now() + 120000) return { accessToken: secret.access_token, connection }
  if (!secret.refresh_token) throw appError('Refresh token do Google Drive ausente', 'drive_refresh_token_missing', 409)
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) throw appError('Google OAuth nao configurado', 'google_oauth_not_configured', 503)
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
  if (!r.ok || !payload.access_token) throw appError(payload?.error_description || payload?.error || 'Falha ao renovar token do Google Drive', 'drive_refresh_failed', 502)
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

async function driveFileMetadata(accessToken: string, providerFileId: string) {
  const fields = 'id,name,mimeType,webViewLink,modifiedTime,size,parents,trashed,driveId,ownedByMe,capabilities(canDownload)'
  const params = new URLSearchParams({ fields })
  const r = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(providerFileId)}?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  const payload = await r.json().catch(() => ({}))
  if (!r.ok) throw appError(payload?.error?.message || `Google Drive ${r.status}`, r.status === 403 || r.status === 404 ? 'drive_file_access_denied' : 'drive_file_metadata_failed', r.status === 403 || r.status === 404 ? 409 : 502)
  if (payload.trashed) throw appError('O arquivo selecionado esta na lixeira do Drive', 'drive_file_trashed', 409)
  return payload
}

async function validateRootFolder(accessToken: string, connection: any) {
  const root = driveRootConfig(connection)
  let folder
  try {
    folder = await driveFileMetadata(accessToken, root.id)
  } catch (_) {
    throw appError('A pasta raiz JARVIS esta inacessivel. O documento nao sera lido e nenhum fallback sera usado.', 'drive_root_inaccessible', 409)
  }
  if (folder.trashed || String(folder.mimeType || '') !== DRIVE_FOLDER_MIME || folder.driveId || folder.ownedByMe === false) {
    throw appError('A pasta raiz configurada nao e uma pasta valida do Meu Drive.', 'drive_root_invalid', 409)
  }
  return root
}

async function assertFileInsideRoot(accessToken: string, connection: any, remote: any) {
  const root = await validateRootFolder(accessToken, connection)
  const inside = await isFileInsideRoot(remote, root.id, (id: string) => driveFileMetadata(accessToken, id))
  if (!inside || String(remote.id) === root.id) {
    throw appError('Este arquivo esta fora de Meu Drive / JARVIS. Mova-o para a pasta JARVIS ou uma subpasta e tente novamente.', 'drive_file_outside_root', 409)
  }
  return root
}

function canonicalFileRow(file: any, userId: string, rootId: string, projectId: string | null = null) {
  return {
    user_id: userId,
    provider: DRIVE_PROVIDER,
    provider_file_id: String(file.id),
    name: String(file.name || 'Arquivo sem nome'),
    mime_type: String(file.mimeType || 'application/octet-stream'),
    web_view_link: file.webViewLink || null,
    modified_at_provider: file.modifiedTime || null,
    size_bytes: file.size == null ? null : Number(file.size),
    project_id: projectId,
    source: 'imported',
    metadata: {
      drive_scope_mode: 'root_folder_tree',
      drive_root_folder_id: rootId,
      drive_parent_id: Array.isArray(file.parents) && file.parents.length ? String(file.parents[0]) : null,
    },
  }
}

async function prepareSelectedFile(userClient: any, userId: string, providerFileId: string) {
  const { accessToken, connection } = await driveAccessToken(userClient, userId, true)
  const remote = await driveFileMetadata(accessToken, providerFileId)
  const root = await assertFileInsideRoot(accessToken, connection, remote)
  if (!SUPPORTED_MIME.has(String(remote.mimeType || ''))) throw appError('Nesta versao, Ler documento aceita PDF, JPG e PNG', 'unsupported_document_mime', 415)
  if (remote.capabilities?.canDownload === false) throw appError('O Google Drive nao permite baixar este arquivo', 'drive_download_not_allowed', 409)
  const size = remote.size == null ? null : Number(remote.size)
  if (size != null && size > MAX_BYTES) throw appError('Documento maior que 20 MB', 'document_too_large', 413)
  const { data: existing, error: existingError } = await userClient.from('jarvis_files')
    .select('id,project_id')
    .eq('user_id', userId)
    .eq('provider', DRIVE_PROVIDER)
    .eq('provider_file_id', providerFileId)
    .maybeSingle()
  if (existingError) throw existingError
  const row = canonicalFileRow(remote, userId, root.id, existing?.project_id || null)
  const { data, error } = await userClient.from('jarvis_files')
    .upsert(row, { onConflict: 'user_id,provider,provider_file_id' })
    .select('*')
    .single()
  if (error) throw error
  return data
}

async function downloadDriveBytes(accessToken: string, providerFileId: string) {
  const r = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(providerFileId)}?alt=media`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!r.ok) {
    const payload = await r.json().catch(() => ({}))
    throw appError(payload?.error?.message || `Google Drive ${r.status}`, r.status === 403 ? 'drive_download_denied' : 'drive_download_failed', 502)
  }
  const contentLength = Number(r.headers.get('content-length') || 0)
  if (contentLength > MAX_BYTES) throw appError('Documento maior que 20 MB', 'document_too_large', 413)
  const bytes = new Uint8Array(await r.arrayBuffer())
  if (bytes.byteLength > MAX_BYTES) throw appError('Documento maior que 20 MB', 'document_too_large', 413)
  return bytes
}

async function sha256Hex(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function hmacHex(secret: string, value: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value))
  return [...new Uint8Array(signature)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function utf8Base64(value: string) {
  const bytes = new TextEncoder().encode(value)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

async function callDocumentWorker(userId: string, file: any, bytes: Uint8Array, contentSha: string) {
  if (!WORKER_URL || !WORKER_SECRET) throw appError('Worker Document AI ainda nao configurado', 'document_worker_not_configured', 503)
  const timestamp = String(Math.floor(Date.now() / 1000))
  const canonical = `${timestamp}\n${userId}\n${file.id}\n${contentSha}`
  const signature = await hmacHex(WORKER_SECRET, canonical)
  const r = await fetch(WORKER_URL, {
    method: 'POST',
    headers: {
      'Content-Type': file.mime_type,
      'X-Jarvis-Timestamp': timestamp,
      'X-Jarvis-User-Id': userId,
      'X-Jarvis-File-Id': file.id,
      'X-Jarvis-Content-Sha256': contentSha,
      'X-Jarvis-Signature': signature,
      'X-Jarvis-Filename-B64': utf8Base64(file.name),
    },
    body: bytes,
  })
  const payload = await r.json().catch(() => ({}))
  if (!r.ok || payload?.ok !== true) throw appError(payload?.error || `Document AI worker ${r.status}`, payload?.code || 'document_ai_failed', 502)
  return payload
}

function responseOutputText(payload: any) {
  if (typeof payload?.output_text === 'string' && payload.output_text.trim()) return payload.output_text.trim()
  for (const item of Array.isArray(payload?.output) ? payload.output : []) {
    for (const part of Array.isArray(item?.content) ? item.content : []) {
      if ((part?.type === 'output_text' || part?.type === 'text') && typeof part?.text === 'string') return part.text.trim()
    }
  }
  return null
}

const interpretationSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    family: { type: 'string', enum: ['financial', 'administrative', 'travel', 'unknown'] },
    document_type: { type: 'string', enum: [...DOCUMENT_TYPES] },
    summary: { type: 'string' },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    financial: {
      type: 'object', additionalProperties: false,
      properties: {
        present: { type: 'boolean' }, merchant: { type: ['string', 'null'] }, date: { type: ['string', 'null'] },
        total_amount: { type: ['number', 'null'] }, currency: { type: ['string', 'null'] }, payment_method: { type: ['string', 'null'] },
        items: { type: 'array', items: { type: 'object', additionalProperties: false, properties: {
          description: { type: 'string' }, quantity: { type: ['number', 'null'] }, unit_price: { type: ['number', 'null'] }, total: { type: ['number', 'null'] },
        }, required: ['description', 'quantity', 'unit_price', 'total'] } },
      }, required: ['present', 'merchant', 'date', 'total_amount', 'currency', 'payment_method', 'items'],
    },
    administrative: {
      type: 'object', additionalProperties: false,
      properties: {
        present: { type: 'boolean' }, title: { type: ['string', 'null'] }, parties: { type: 'array', items: { type: 'string' } },
        relevant_dates: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { label: { type: 'string' }, date: { type: ['string', 'null'] } }, required: ['label', 'date'] } },
        relevant_values: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { label: { type: 'string' }, amount: { type: ['number', 'null'] }, currency: { type: ['string', 'null'] } }, required: ['label', 'amount', 'currency'] } },
        due_date: { type: ['string', 'null'] }, obligations: { type: 'array', items: { type: 'string' } },
      }, required: ['present', 'title', 'parties', 'relevant_dates', 'relevant_values', 'due_date', 'obligations'],
    },
    travel: {
      type: 'object', additionalProperties: false,
      properties: {
        present: { type: 'boolean' }, provider: { type: ['string', 'null'] }, origin: { type: ['string', 'null'] }, destination: { type: ['string', 'null'] },
        start_date: { type: ['string', 'null'] }, end_date: { type: ['string', 'null'] }, reservation_code: { type: ['string', 'null'] },
        travelers: { type: 'array', items: { type: 'string' } }, amount: { type: ['number', 'null'] }, currency: { type: ['string', 'null'] },
      }, required: ['present', 'provider', 'origin', 'destination', 'start_date', 'end_date', 'reservation_code', 'travelers', 'amount', 'currency'],
    },
    suggestions: {
      type: 'array', items: { type: 'object', additionalProperties: false, properties: {
        kind: { type: 'string', enum: ['calendar_event', 'task', 'financial_reconciliation'] }, reason: { type: 'string' },
      }, required: ['kind', 'reason'] },
    },
  },
  required: ['family', 'document_type', 'summary', 'confidence', 'financial', 'administrative', 'travel', 'suggestions'],
}

async function interpretText(text: string, file: any) {
  if (!OPENAI_API_KEY) throw appError('OpenAI API nao configurada', 'openai_not_configured', 503)
  const inputText = text.slice(0, MAX_INTERPRET_CHARS)
  const instructions = `Voce e a camada de interpretacao documental do Jarvis. Classifique apenas uma destas familias: financeiro, administrativo/contrato, viagem ou unknown. Nao invente campos. Use null/lista vazia quando nao estiver no documento. O resumo deve ser curto e factual. Sugestoes podem ser propostas, mas nunca executadas. Tipos permitidos: financial_invoice, financial_receipt, financial_proof, contract, administrative, travel_reservation, travel_ticket, travel_lodging, travel_other, unknown. Datas preferencialmente ISO YYYY-MM-DD quando houver base suficiente.`
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      store: false,
      input: [
        { role: 'system', content: instructions },
        { role: 'user', content: `Arquivo: ${file.name}\nMIME: ${file.mime_type}\n\nTexto OCR:\n${inputText}` },
      ],
      text: { format: { type: 'json_schema', name: 'jarvis_document_interpretation', strict: true, schema: interpretationSchema } },
    }),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw appError(payload?.error?.message || `OpenAI ${response.status}`, 'openai_interpretation_failed', 502)
  const output = responseOutputText(payload)
  if (!output) throw appError('OpenAI sem saida estruturada', 'openai_empty_output', 502)
  const parsed = JSON.parse(output)
  if (!DOCUMENT_TYPES.has(parsed.document_type)) parsed.document_type = 'unknown'
  return { parsed, usage: payload?.usage || {}, model: payload?.model || OPENAI_MODEL, truncated: text.length > inputText.length }
}

async function markFailed(userClient: any, userId: string, fileId: string, code: string, message: string, extractedText: string | null = null, metadata: Record<string, unknown> = {}) {
  const { error } = await userClient.from('jarvis_document_processing').upsert({
    user_id: userId,
    jarvis_file_id: fileId,
    processing_status: 'failed',
    document_type: 'unknown',
    processor: PROCESSOR,
    extracted_text: extractedText,
    extracted_data: null,
    confidence: null,
    processed_at: null,
    error_code: code,
    error_message: String(message).slice(0, 2000),
    processing_metadata: metadata,
  }, { onConflict: 'user_id,jarvis_file_id' })
  if (error) console.error('Falha ao registrar erro documental', error)
}

async function processFile(userClient: any, userId: string, fileId: string) {
  const { data: file, error: fileError } = await userClient.from('jarvis_files').select('*').eq('user_id', userId).eq('id', fileId).maybeSingle()
  if (fileError) throw fileError
  if (!file) throw appError('Arquivo nao encontrado', 'file_not_found', 404)
  if (!SUPPORTED_MIME.has(String(file.mime_type || ''))) throw appError('Nesta versao, Ler documento aceita PDF, JPG e PNG', 'unsupported_document_mime', 415)
  if (file.size_bytes != null && Number(file.size_bytes) > MAX_BYTES) throw appError('Documento maior que 20 MB', 'document_too_large', 413)

  const { accessToken, connection } = await driveAccessToken(userClient, userId, true)
  const remote = await driveFileMetadata(accessToken, file.provider_file_id)
  const root = await assertFileInsideRoot(accessToken, connection, remote)

  await userClient.from('jarvis_document_processing').upsert({
    user_id: userId,
    jarvis_file_id: file.id,
    processing_status: 'processing',
    document_type: 'unknown',
    processor: PROCESSOR,
    extracted_text: null,
    extracted_data: null,
    confidence: null,
    processed_at: null,
    error_code: null,
    error_message: null,
    processing_metadata: { started_at: new Date().toISOString(), source_modified_at: file.modified_at_provider || null, drive_root_folder_id: root.id },
  }, { onConflict: 'user_id,jarvis_file_id' })

  let ocrText: string | null = null
  try {
    if (remote.capabilities?.canDownload === false) throw appError('O Google Drive nao permite baixar este arquivo', 'drive_download_not_allowed', 409)
    const bytes = await downloadDriveBytes(accessToken, file.provider_file_id)
    const contentSha = await sha256Hex(bytes)
    const worker = await callDocumentWorker(userId, file, bytes, contentSha)
    ocrText = String(worker.text || '')
    if (!ocrText.trim()) throw appError('Document AI nao retornou texto', 'document_ai_empty_text', 422)
    const interpretation = await interpretText(ocrText, file)
    const pageCount = Math.max(0, Number(worker.page_count || 0))
    const now = new Date().toISOString()
    const metadata = {
      completed_at: now,
      source_modified_at: file.modified_at_provider || null,
      source_sha256: contentSha,
      drive_root_folder_id: root.id,
      document_ai: {
        processor: worker.processor || null,
        page_count: pageCount,
        request_id: worker.request_id || null,
        estimated_list_price_usd: Number((pageCount * DOCAI_LIST_PRICE_PER_PAGE_USD).toFixed(6)),
        unit_price_usd_per_page: DOCAI_LIST_PRICE_PER_PAGE_USD,
        pricing_reference_date: '2026-09-07',
      },
      openai: {
        model: interpretation.model,
        input_tokens: Number(interpretation.usage?.input_tokens || 0),
        output_tokens: Number(interpretation.usage?.output_tokens || 0),
        total_tokens: Number(interpretation.usage?.total_tokens || 0),
        input_truncated: interpretation.truncated,
      },
      binary_persisted: false,
    }
    const { data, error } = await userClient.from('jarvis_document_processing').upsert({
      user_id: userId,
      jarvis_file_id: file.id,
      processing_status: 'completed',
      document_type: interpretation.parsed.document_type,
      processor: PROCESSOR,
      extracted_text: ocrText,
      extracted_data: interpretation.parsed,
      confidence: interpretation.parsed.confidence,
      processed_at: now,
      error_code: null,
      error_message: null,
      processing_metadata: metadata,
    }, { onConflict: 'user_id,jarvis_file_id' }).select('*').single()
    if (error) throw error
    return data
  } catch (e) {
    const code = String((e as any)?.code || 'document_processing_failed')
    const message = e instanceof Error ? e.message : String(e)
    await markFailed(userClient, userId, file.id, code, message, ocrText, {
      failed_at: new Date().toISOString(),
      source_modified_at: file.modified_at_provider || null,
      drive_root_folder_id: root.id,
      binary_persisted: false,
    })
    throw e
  }
}

async function listProcessing(userClient: any, userId: string, body: any) {
  let query = userClient.from('jarvis_document_processing').select('*').eq('user_id', userId)
  if (Array.isArray(body.file_ids) && body.file_ids.length) query = query.in('jarvis_file_id', body.file_ids.slice(0, 500))
  if (body.status) query = query.eq('processing_status', String(body.status))
  const { data, error } = await query.order('updated_at', { ascending: false }).limit(1000)
  if (error) throw error
  return data || []
}

async function costSummary(userClient: any, userId: string) {
  const { data, error } = await userClient.from('jarvis_document_processing')
    .select('processing_status,processing_metadata')
    .eq('user_id', userId)
  if (error) throw error
  let pages = 0
  let estimatedUsd = 0
  let completed = 0
  for (const row of data || []) {
    if (row.processing_status !== 'completed') continue
    completed += 1
    pages += Number(row.processing_metadata?.document_ai?.page_count || 0)
    estimatedUsd += Number(row.processing_metadata?.document_ai?.estimated_list_price_usd || 0)
  }
  return { completed_documents: completed, document_ai_pages: pages, estimated_document_ai_list_price_usd: Number(estimatedUsd.toFixed(6)), promotional_credits_brl_reference: 1761.10 }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Metodo nao suportado' }, 405)
  try {
    const { userClient, user } = await userContext(req)
    const body = await req.json().catch(() => ({}))
    const action = String(body?.action || 'list')
    if (['prepare_selected', 'process', 'reprocess'].includes(action) && body?.explicit !== true) return json({ error: 'Acao explicita obrigatoria', code: 'explicit_required' }, 400)

    if (action === 'picker_config') {
      const connection = await driveConnection(userClient, user.id).catch(() => null)
      const root = connection ? driveRootConfig(connection) : null
      return json({
        ok: true,
        client_id: GOOGLE_CLIENT_ID || null,
        developer_key: GOOGLE_PICKER_API_KEY || null,
        app_id: GOOGLE_PICKER_APP_ID,
        scope: DRIVE_FILE_SCOPE,
        metadata_ready: !!connection && hasScope(connection, DRIVE_METADATA_SCOPE),
        drive_file_ready: !!connection && hasScope(connection, DRIVE_FILE_SCOPE),
        worker_ready: !!WORKER_URL && !!WORKER_SECRET,
        root_configured: !!root,
        root_folder_id: root?.id || null,
        root_folder_name: root?.name || null,
        drive_scope_mode: root?.mode || null,
      })
    }
    if (action === 'list') return json({ ok: true, items: await listProcessing(userClient, user.id, body) })
    if (action === 'get') {
      if (!body.id && !body.jarvis_file_id) return json({ error: 'id ou jarvis_file_id obrigatorio' }, 400)
      let query = userClient.from('jarvis_document_processing').select('*').eq('user_id', user.id)
      query = body.id ? query.eq('id', body.id) : query.eq('jarvis_file_id', body.jarvis_file_id)
      const { data, error } = await query.maybeSingle()
      if (error) throw error
      return json({ ok: true, item: data || null })
    }
    if (action === 'prepare_selected') {
      const providerFileId = String(body.provider_file_id || '').trim()
      if (!providerFileId) return json({ error: 'provider_file_id obrigatorio' }, 400)
      return json({ ok: true, item: await prepareSelectedFile(userClient, user.id, providerFileId) })
    }
    if (action === 'process' || action === 'reprocess') {
      const fileId = String(body.jarvis_file_id || '').trim()
      if (!fileId) return json({ error: 'jarvis_file_id obrigatorio' }, 400)
      return json({ ok: true, item: await processFile(userClient, user.id, fileId) })
    }
    if (action === 'cost_summary') return json({ ok: true, ...(await costSummary(userClient, user.id)) })
    return json({ error: 'Acao nao suportada', code: 'unsupported_action' }, 400)
  } catch (e) {
    console.error('jarvis-document-processing', (e as any)?.code || '', e instanceof Error ? e.message : String(e))
    return json({ error: e instanceof Error ? e.message : String(e), code: (e as any)?.code || 'document_processing_unavailable' }, Number((e as any)?.status || 500))
  }
})
