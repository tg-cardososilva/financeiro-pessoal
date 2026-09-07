import { documentStatusLabel, documentTypeLabel, shortSummary, documentFieldRows, documentSuggestions } from './document-intelligence-core.js?v=3.6.0'

const SUPABASE_URL = 'https://qhpkraqrcvhhtbqjhkmm.supabase.co'
const SUPABASE_KEY = 'sb_publishable_OXgobfJOCgDy4OP2n_zKgg_tOvEa28F'
const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file'

const state = {
  processing: new Map(),
  config: null,
  cost: null,
  loading: false,
  lastRefresh: 0,
  pickerToken: null,
}

function esc(v = '') {
  return String(v).replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]))
}

function installStyles() {
  if (document.getElementById('documentIntelligenceCss')) return
  const link = document.createElement('link')
  link.id = 'documentIntelligenceCss'
  link.rel = 'stylesheet'
  link.href = './document-intelligence.css?v=3.6.0'
  document.head.appendChild(link)
}

let docSupabasePromise = null

async function documentSupabase() {
  if (!docSupabasePromise) {
    docSupabasePromise = import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4/+esm').then(({ createClient }) => createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: true, autoRefreshToken: false, detectSessionInUrl: false },
    }))
  }
  return docSupabasePromise
}

async function invoke(functionName, body) {
  const client = await documentSupabase()
  const { data: sessionData } = await client.auth.getSession()
  if (!sessionData?.session) throw new Error('Sessão do Jarvis não encontrada. Entre novamente.')
  const { data, error } = await client.functions.invoke(functionName, { body })
  if (error) {
    const message = data?.error || error.message || 'Falha ao chamar o Jarvis.'
    const out = new Error(message)
    out.code = data?.code || null
    throw out
  }
  if (data?.error) {
    const out = new Error(data.error)
    out.code = data?.code || null
    throw out
  }
  return data || {}
}

function ownToast(message, type = 'default') {
  const host = document.getElementById('toastHost') || document.body
  const node = document.createElement('div')
  node.className = `toast ${type === 'default' ? '' : type}`.trim()
  node.textContent = message
  host.appendChild(node)
  setTimeout(() => node.remove(), 4200)
}

async function refreshProcessing(force = false) {
  if (state.loading) return
  if (!force && Date.now() - state.lastRefresh < 4000) return
  state.loading = true
  try {
    const [list, config, cost] = await Promise.all([
      invoke('jarvis-document-processing', { action: 'list' }),
      invoke('jarvis-document-processing', { action: 'picker_config' }),
      invoke('jarvis-document-processing', { action: 'cost_summary' }),
    ])
    state.processing = new Map((list.items || []).map((row) => [row.jarvis_file_id, row]))
    state.config = config
    state.cost = cost
    state.lastRefresh = Date.now()
  } catch (_) {
    // A falha desta camada nao deve quebrar Arquivos/Home.
  } finally {
    state.loading = false
    enhanceFilesView()
  }
}

function loadScript(src, id) {
  return new Promise((resolve, reject) => {
    const existing = document.getElementById(id)
    if (existing) {
      if (existing.dataset.loaded === '1') return resolve()
      existing.addEventListener('load', () => resolve(), { once: true })
      existing.addEventListener('error', reject, { once: true })
      return
    }
    const script = document.createElement('script')
    script.id = id
    script.src = src
    script.async = true
    script.defer = true
    script.addEventListener('load', () => { script.dataset.loaded = '1'; resolve() }, { once: true })
    script.addEventListener('error', reject, { once: true })
    document.head.appendChild(script)
  })
}

async function ensurePickerLibraries() {
  await Promise.all([
    loadScript('https://apis.google.com/js/api.js', 'jarvisGoogleApiLoader'),
    loadScript('https://accounts.google.com/gsi/client', 'jarvisGoogleIdentity'),
  ])
  await new Promise((resolve, reject) => {
    if (!window.gapi) return reject(new Error('Google Picker indisponível.'))
    window.gapi.load('picker', { callback: resolve, onerror: () => reject(new Error('Falha ao carregar Google Picker.')) })
  })
}

async function startDriveFileOAuth() {
  const data = await invoke('jarvis-google-drive-oauth', {})
  if (!data.authorization_url) throw new Error('URL de autorização do Drive indisponível.')
  window.location.assign(data.authorization_url)
}

async function pickerSelection(query = '') {
  const config = state.config || (await invoke('jarvis-document-processing', { action: 'picker_config' }))
  state.config = config
  if (!config.drive_file_ready) {
    await startDriveFileOAuth()
    return null
  }
  if (!config.worker_ready) throw new Error('Document AI worker ainda não está configurado.')
  if (!config.client_id || !config.developer_key || !config.app_id) throw new Error('Google Picker ainda não está totalmente configurado.')
  await ensurePickerLibraries()
  return new Promise((resolve, reject) => {
    const tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: config.client_id,
      scope: DRIVE_FILE_SCOPE,
      callback: (tokenResponse) => {
        if (tokenResponse?.error) return reject(new Error(tokenResponse.error_description || tokenResponse.error))
        state.pickerToken = tokenResponse.access_token
        const view = new window.google.picker.DocsView(window.google.picker.ViewId.DOCS)
          .setIncludeFolders(false)
          .setSelectFolderEnabled(false)
          .setMimeTypes('application/pdf,image/jpeg,image/png')
        if (query) view.setQuery(query)
        const picker = new window.google.picker.PickerBuilder()
          .addView(view)
          .setOAuthToken(state.pickerToken)
          .setDeveloperKey(config.developer_key)
          .setAppId(config.app_id)
          .setTitle('Escolha o documento que o Jarvis pode ler')
          .setCallback((data) => {
            const action = data[window.google.picker.Response.ACTION]
            if (action === window.google.picker.Action.PICKED) {
              const docs = data[window.google.picker.Response.DOCUMENTS] || []
              const selected = docs[0]
              const id = selected?.[window.google.picker.Document.ID] || null
              state.pickerToken = null
              resolve(id)
            } else if (action === window.google.picker.Action.CANCEL) {
              state.pickerToken = null
              resolve(null)
            }
          })
          .build()
        picker.setVisible(true)
      },
    })
    tokenClient.requestAccessToken({ prompt: '' })
  })
}

function modalHost() {
  return document.getElementById('modalHost') || document.body
}

function fieldHtml(row) {
  return `<div class="doc-intel-field"><span>${esc(row.label)}</span><strong>${esc(row.value)}</strong></div>`
}

function suggestionLabel(kind) {
  return ({ calendar_event: 'Pode sugerir evento', task: 'Pode sugerir tarefa', financial_reconciliation: 'Pode sugerir conciliação' })[kind] || kind
}

function openProcessingModal(processing, fileName = 'Documento') {
  const host = modalHost()
  const rows = documentFieldRows(processing)
  const suggestions = documentSuggestions(processing)
  const summary = shortSummary(processing)
  const meta = processing?.processing_metadata || {}
  host.innerHTML = `<div class="modal-backdrop"><div class="modal wide domain-modal doc-intel-modal">
    <div class="modal-head"><div><span class="eyebrow">DOCUMENTO INTELIGENTE</span><h2>${esc(fileName)}</h2><div class="domain-card-chips"><span class="domain-chip note">${esc(documentTypeLabel(processing?.document_type))}</span><span class="doc-intel-status ${esc(processing?.processing_status || '')}">${esc(documentStatusLabel(processing?.processing_status))}</span></div></div><button id="docIntelClose" class="icon-button" type="button">×</button></div>
    ${processing?.processing_status === 'failed' ? `<div class="error-banner file-inline-error"><span>${esc(processing.error_message || 'Falha no processamento.')}</span></div>` : ''}
    ${summary ? `<section class="doc-intel-summary"><span>Resumo</span><p>${esc(summary)}</p></section>` : ''}
    ${rows.length ? `<section class="doc-intel-fields">${rows.map(fieldHtml).join('')}</section>` : ''}
    ${suggestions.length ? `<section class="doc-intel-suggestions"><span>Sugestões do Jarvis</span><div>${suggestions.map((s) => `<span class="doc-suggestion" title="${esc(s.reason || '')}">${esc(suggestionLabel(s.kind))}</span>`).join('')}</div><small>Nenhuma ação é executada automaticamente.</small></section>` : ''}
    ${processing?.extracted_text ? `<details class="domain-tech doc-full-text"><summary>Texto completo extraído</summary><pre>${esc(processing.extracted_text)}</pre></details>` : ''}
    <details class="domain-tech"><summary>Detalhes técnicos</summary><div><span>Processador</span><code>${esc(processing?.processor || '')}</code></div><div><span>Confiança</span><strong>${processing?.confidence == null ? 'Não informada' : `${Math.round(Number(processing.confidence) * 100)}%`}</strong></div><div><span>Páginas OCR</span><strong>${esc(meta?.document_ai?.page_count ?? '—')}</strong></div><div><span>Custo de tabela estimado</span><strong>${meta?.document_ai?.estimated_list_price_usd == null ? '—' : `US$ ${Number(meta.document_ai.estimated_list_price_usd).toFixed(4)}`}</strong></div><div><span>Binário persistido</span><strong>Não</strong></div></details>
    <div class="modal-actions"><span class="muted">Reprocessar é sempre uma ação explícita.</span><div class="modal-actions-right"><button id="docIntelClose2" class="button" type="button">Fechar</button>${processing?.jarvis_file_id ? '<button id="docIntelReprocess" class="button primary" type="button">↻ Reprocessar</button>' : ''}</div></div>
  </div></div>`
  const close = () => { host.innerHTML = '' }
  document.getElementById('docIntelClose')?.addEventListener('click', close)
  document.getElementById('docIntelClose2')?.addEventListener('click', close)
  document.getElementById('docIntelReprocess')?.addEventListener('click', async (event) => {
    const button = event.currentTarget
    button.disabled = true
    button.textContent = 'Reprocessando...'
    try {
      const result = await invoke('jarvis-document-processing', { action: 'reprocess', explicit: true, jarvis_file_id: processing.jarvis_file_id })
      state.processing.set(result.item.jarvis_file_id, result.item)
      openProcessingModal(result.item, fileName)
      ownToast('Documento reprocessado.', 'success')
      enhanceFilesView()
    } catch (error) {
      ownToast(error.message, 'error')
      button.disabled = false
      button.textContent = '↻ Reprocessar'
    }
  })
}

function openBusyModal(fileName = 'Documento') {
  const host = modalHost()
  host.innerHTML = `<div class="modal-backdrop"><div class="modal domain-modal doc-intel-busy"><span class="spinner"></span><h3>Lendo ${esc(fileName)}</h3><p>Drive → Document AI OCR → interpretação do Jarvis. O binário existe apenas em memória durante este fluxo.</p></div></div>`
}

async function readDocument(query = '') {
  try {
    if (!state.config) await refreshProcessing(true)
    const providerFileId = await pickerSelection(query)
    if (!providerFileId) return
    openBusyModal(query || 'documento')
    const prepared = await invoke('jarvis-document-processing', { action: 'prepare_selected', explicit: true, provider_file_id: providerFileId })
    const result = await invoke('jarvis-document-processing', { action: 'process', explicit: true, jarvis_file_id: prepared.item.id })
    state.processing.set(result.item.jarvis_file_id, result.item)
    state.lastRefresh = 0
    openProcessingModal(result.item, prepared.item.name)
    ownToast('Leitura concluída.', 'success')
    enhanceFilesView()
  } catch (error) {
    modalHost().innerHTML = ''
    if (error.code === 'drive_file_scope_missing') {
      try { await startDriveFileOAuth() } catch (oauthError) { ownToast(oauthError.message, 'error') }
      return
    }
    ownToast(error.message || 'Falha ao ler documento.', 'error')
    await refreshProcessing(true)
  }
}

function addStatusToRow(row, fileId) {
  const processing = state.processing.get(fileId)
  const main = row.querySelector('.file-main')
  const actions = row.querySelector('.file-actions')
  if (!main || !actions) return
  row.querySelectorAll('[data-doc-intel-added]').forEach((node) => node.remove())
  const status = document.createElement('span')
  status.dataset.docIntelAdded = '1'
  status.className = `doc-intel-row-status ${processing?.processing_status || 'none'}`
  status.textContent = processing ? `${documentStatusLabel(processing.processing_status)} · ${documentTypeLabel(processing.document_type)}` : 'Não lido'
  main.appendChild(status)
  const button = document.createElement('button')
  button.dataset.docIntelAdded = '1'
  button.className = 'button small doc-intel-row-button'
  button.type = 'button'
  button.textContent = processing?.processing_status === 'completed' ? 'Ver leitura' : processing?.processing_status === 'failed' ? 'Ver erro' : processing?.processing_status === 'processing' ? 'Lendo...' : 'Ler documento'
  button.disabled = processing?.processing_status === 'processing'
  button.addEventListener('click', () => {
    const fileName = row.querySelector('.file-main > strong')?.textContent || 'Documento'
    if (processing?.processing_status === 'completed' || processing?.processing_status === 'failed') openProcessingModal(processing, fileName)
    else readDocument(fileName)
  })
  actions.appendChild(button)
}

function enhanceFilesView() {
  const section = document.querySelector('.files-section')
  if (!section) return
  const intro = section.querySelector('.section-intro')
  if (intro && !document.getElementById('docReadNew')) {
    const existingSync = document.getElementById('filesSync')
    const wrap = document.createElement('div')
    wrap.className = 'doc-intel-header-actions'
    const read = document.createElement('button')
    read.id = 'docReadNew'
    read.className = 'button'
    read.type = 'button'
    read.textContent = '▧ Ler documento'
    read.addEventListener('click', () => readDocument())
    wrap.appendChild(read)
    if (state.cost) {
      const cost = document.createElement('small')
      cost.className = 'doc-intel-cost'
      cost.textContent = `${state.cost.document_ai_pages || 0} pág. OCR processada(s)`
      wrap.appendChild(cost)
    }
    if (existingSync?.parentElement === intro) intro.insertBefore(wrap, existingSync)
    else intro.appendChild(wrap)
  }
  section.querySelectorAll('.file-row').forEach((row) => {
    const detail = row.querySelector('[data-file-detail]')
    const fileId = detail?.dataset?.fileDetail
    if (fileId) addStatusToRow(row, fileId)
  })
}

let timer = null
const observer = new MutationObserver(() => {
  clearTimeout(timer)
  timer = setTimeout(() => {
    if (document.querySelector('.files-section')) {
      enhanceFilesView()
      refreshProcessing(false)
    }
  }, 180)
})

installStyles()
observer.observe(document.documentElement, { childList: true, subtree: true })
window.addEventListener('storage', () => { state.lastRefresh = 0 })
setTimeout(() => { if (document.querySelector('.files-section')) refreshProcessing(true) }, 800)
