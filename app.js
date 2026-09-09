Warning: truncated output (original token count: 72857)
Total output lines: 3380

import { ATTENTION_URGENCY_LABELS } from './attention-rules.js?v=1.0.0-rc.3'
import { domainList, domainCreate, domainUpdate, domainDelete, domainTransition } from './jarvis-domain-client.js?v=1.0.0-rc.3'
import { TASK_STATUS_LABELS, TASK_PRIORITY_LABELS, NOTE_TYPE_LABELS, PROJECT_STATUS_LABELS, SOURCE_LABELS, filterTasks, filterNotes, filterProjects, collectNoteTags } from './domain-ui.js?v=1.0.0-rc.3'
import { fileList, fileSync, fileLinkProject, fileUnlinkProject, fileStatus } from './jarvis-files-client.js?v=1.0.0-rc.3'
import { FILE_TYPE_LABELS, fileTypeLabel, fileIcon, fileSizeLabel, matchesFileFilters } from './files-ui.js?v=1.0.0-rc.3'

const SUPABASE_URL = 'https://qhpkraqrcvhhtbqjhkmm.supabase.co'
const SUPABASE_KEY = 'sb_publishable_OXgobfJOCgDy4OP2n_zKgg_tOvEa28F'
let supabase = null

async function loadSupabaseCreateClient() {
  const sources = [
    'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4/+esm',
    'https://esm.sh/@supabase/supabase-js@2.57.4'
  ]
  let lastError = null
  for (const source of sources) {
    try {
      const mod = await import(source)
      if (typeof mod.createClient === 'function') return mod.createClient
    } catch (err) { lastError = err }
  }
  throw lastError || new Error('Não foi possível carregar a biblioteca segura de conexão.')
}

function showBootFailure(err) {
  const splash = document.getElementById('splash')
  if (!splash) return
  const copy = splash.querySelector('.splash-copy')
  if (copy) copy.innerHTML = `<strong>Não consegui abrir o painel</strong><span>${esc(err?.message || 'Falha ao carregar a aplicação. Atualize a página e tente novamente.')}</span><button id="bootRetry" type="button" style="margin-top:12px;border:1px solid #d9ddda;background:white;border-radius:10px;padding:9px 12px;font:inherit;font-size:12px;cursor:pointer">Tentar novamente</button>`
  document.getElementById('bootRetry')?.addEventListener('click', () => location.reload())
}

const $ = (id) => document.getElementById(id)
const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const monthFmt = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' })
const dateFmt = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' })
const fullDateFmt = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })

const state = {
  session: null,
  view: 'home',
  realView: true,
  month: monthKey(new Date()),
  accounts: [],
  accountBalances: [],
  categories: [],
  rules: [],
  transactions: [],
  purchases: [],
  allocations: [],
  receipts: [],
  budget: null,
  profile: null,
  preferences: { use_purchase_details: false },
  loading: false,
  authMode: 'signin',
  import: null,
  selectionMode: false,
  selectedTx: new Set(),
  dismissedSuggestions: new Set(),
  investmentPositions: [],
  investmentGoals: [],
  investmentMovements: [],
  investmentSnapshots: [],
  transactionDrilldown: null,
  investmentMovementFilter: 'all',
  jarvis: { messages: [], annotations: [], notes: [], tasks: [], projects: [], actions: [], connections: [], counts: { annotations: 0, notes: 0, tasks: 0, projects: 0, actions: 0 }, loading: false, loaded: false, engine: null, error: null, whatsapp: { loaded: false, loading: false, paired: false, identity: null, pairing: null } },
  calendar: { events: [], loading: false, loaded: false, error: null, connected: null, syncedAt: null, displayName: null },
  files: { items: [], count: 0, loading: false, loaded: false, error: null, integrationError: null, connected: null, displayName: null, truncated: false, filters: { q: '', type: 'all', project: 'all' } },
  attention: { items: [], summary: '', loading: false, loaded: false, error: null },
  health: { checks: [], loading: false, loaded: false, error: null },
  domainUi: {
    task: { q: '', status: 'open', priority: 'all', due: 'all', project: 'all' },
    note: { q: '', type: 'all', tag: 'all', project: 'all' },
    project: { q: '', status: 'all', due: 'all' }
  }
}

function esc(v = '') {
  return String(v).replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]))
}
function safeMessageHtml(value = '') {
  return String(value).split(/(https:\/\/[^\s<>]+)/g).map((part) => {
    if (!part.startsWith('https://')) return esc(part).replace(/\n/g, '<br>')
    const match = part.match(/^(.*?)([),.;!?]*)$/)
    const url = match?.[1] || part
    const suffix = match?.[2] || ''
    try {
      const parsed = new URL(url)
      if (parsed.protocol !== 'https:') return esc(part)
      return `<a href="${esc(parsed.href)}" target="_blank" rel="noopener noreferrer">${esc(url)}</a>${esc(suffix)}`
    } catch (_) { return esc(part) }
  }).join('')
}
function monthKey(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` }
function parseDate(s) { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, m - 1, d) }
function setHidden(el, hide) { if (el) el.classList.toggle('hidden', !!hide) }
function displayDescription(t) { return t?.display_description?.trim() || t?.description || 'Movimentação' }
function accountById(id) { return state.accounts.find((a) => a.id === id) }
function balanceByAccountId(id) { return state.accountBalances.find((b) => b.account_id === id) || null }
function accountBalanceLabel(a) {
  const b = balanceByAccountId(a.id)
  if (!b || b.current_balance == null) return { value: null, label: 'Saldo não confirmado', date: null }
  return { value: num(b.current_balance), label: a.account_type === 'credit_card' ? 'Saldo / fatura atual' : 'Saldo atual', date: b.balance_date || null }
}
function categoryById(id) { return state.categories.find((c) => c.id === id) }
function purchaseById(id) { return state.purchases.find((p) => p.id === id) }
function num(v) { const n = Number(v); return Number.isFinite(n) ? n : 0 }
function parseMoneyInput(v) {
  const clean = String(v || '').trim().replace(/\s/g, '').replace(/R\$/gi, '').replace(/\./g, '').replace(',', '.').replace(/[^0-9.-]/g, '')
  const n = Number(clean)
  return Number.isFinite(n) ? n : NaN
}

function personalDisplayName() {
  const email = String(state.session?.user?.email || '').toLowerCase()
  if (email === 'tgcs.business@gmail.com') return 'Thiago'
  const profileName = String(state.profile?.display_name || '').trim()
  if (profileName) return profileName.split(/\s+/)[0]
  const meta = state.session?.user?.user_metadata || {}
  const metaName = String(meta.first_name || meta.given_name || meta.full_name || meta.name || '').trim()
  if (metaName) return metaName.split(/\s+/)[0]
  const local = email.split('@')[0] || 'Voce'
  return local.replace(/[._-]+/g, ' ').trim().split(/\s+/)[0] || 'Voce'
}

function jarvisActionFingerprint(a) {
  if (!a) return ''
  if (a.action_type === 'calendar_create') return ['calendar_create', a.payload?.title || '', a.payload?.starts_at || '', a.payload?.ends_at || ''].join('|').toLowerCase()
  return [a.action_type || '', a.payload?.title || '', a.created_at || a.id || ''].join('|').toLowerCase()
}
function dedupeJarvisActions(actions = []) {
  const rank = { executed: 5, confirmed: 4, proposed: 3, failed: 2, cancelled: 1 }
  const map = new Map()
  for (const a of actions) {
    const key = jarvisActionFingerprint(a) || a.id
    const current = map.get(key)
    if (!current) { map.set(key, a); continue }
    const ar = rank[String(a.status || '').toLowerCase()] || 0
    const cr = rank[String(current.status || '').toLowerCase()] || 0
    if (ar > cr || (ar === cr && new Date(a.updated_at || a.created_at || 0) > new Date(current.updated_at || current.created_at || 0))) map.set(key, a)
  }
  return [...map.values()]
}
function dedupeJarvisAnnotations(items = []) {
  const seen = new Set(), out = []
  for (const x of items) {
    const key = [num(x?.amount).toFixed(2), x?.merchant || x?.counterparty || '', x?.occurred_at || x?.transaction_date || x?.date || '', x?.description || x?.note || x?.notes || ''].join('|').toLowerCase()
    if (seen.has(key)) continue
    seen.add(key); out.push(x)
  }
  return out
}

function monthRange() {
  const [y, m] = state.month.split('-').map(Number)
  const start = `${state.month}-01`
  const next = new Date(y, m, 1)
  const end = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-01`
  return { start, end }
}
function setBusy(btn, busy, label = 'Processando') {
  if (!btn) return
  if (busy) {
    if (!btn.dataset.restore) btn.dataset.restore = btn.innerHTML
    btn.disabled = true
    btn.innerHTML = `<span class="spinner"></span><span>${esc(label)}</span>`
  } else {
    btn.disabled = false
    if (btn.dataset.restore) {
      btn.innerHTML = btn.dataset.restore
      delete btn.dataset.restore
    }
  }
}
function showError(msg = '') { setHidden($('errorBanner'), !msg); if ($('errorText')) $('errorText').textContent = msg }
function showInfo(id, msg) { const el = $(id); if (!el) return; el.textContent = msg; setHidden(el, !msg) }
function toast(message, type = 'default') {
  const el = document.createElement('div')
  el.className = `toast ${type === 'default' ? '' : type}`.trim()
  el.textContent = message
  $('toastHost').appendChild(el)
  setTimeout(() => el.remove(), 3600)
}
function humanError(err) {
  const msg = err?.message || String(err)
  if (/Invalid login credentials/i.test(msg)) return 'E-mail ou senha incorretos.'
  if (/already registered/i.test(msg)) return 'Esse e-mail já possui uma conta.'
  if (/allocation_total_mismatch/i.test(msg)) return 'A soma do detalhamento precisa ser igual ao total da compra.'
  if (/invalid_transactions/i.test(msg)) return 'Selecione apenas despesas ainda não agrupadas.'
  if (/purchase_not_found/i.test(msg)) return 'Não foi possível localizar essa compra.'
  if (/duplicate key/i.test(msg)) return 'Esse registro já existe.'
  if (/task_target_ambiguous/i.test(msg)) return 'Encontrei mais de uma tarefa parecida. Use um título mais específico.'
  if (/task_not_found/i.test(msg)) return 'Não encontrei essa tarefa.'
  if (/calendar_details_missing/i.test(msg)) return 'Preciso de título, data e horário para preparar o compromisso.'
  if (/google_drive_not_connected/i.test(msg)) return 'Conecte o Google Drive para criar o arquivo.'
  if (/openai_not_configured|openai_http/i.test(msg)) return 'A inteligência do Jarvis está temporariamente indisponível.'
  return msg
}

async function boot() {
  try {
    const createClient = await loadSupabaseCreateClient()
    supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    })
    $('monthPicker').value = state.month
    bindGlobalEvents()
    const { data, error } = await supabase.auth.getSession()
    if (error) throw error
    state.session = data.session
    supabase.auth.onAuthStateChange((event, session) => {
      state.session = session
      renderSession()
      if (event === 'PASSWORD_RECOVERY' && session) setTimeout(openPasswordResetModal, 120)
    })
    window.__financeiroBooted = true
    renderSession()
    const oauthParams = new URLSearchParams(location.search)
    if (oauthParams.has('jarvis_google') && state.session) {
      const result = oauthParams.get('jarvis_google')
      history.replaceState({}, '', location.pathname + location.hash)
      state.jarvis.loaded = false
      setTimeout(() => { navigate('jarvis'); toast(result === 'connected' ? 'Google Calendar conectado ao Jarvis.' : result === 'cancelled' ? 'Conexão com Google cancelada.' : 'Não foi possível conectar o Google Calendar.', result === 'connected' ? 'success' : 'error') }, 120)
    }
    if (oauthParams.has('jarvis_google_drive') && state.session) {
      const result = oauthParams.get('jarvis_google_drive')
      history.replaceState({}, '', location.pathname + location.hash)
      state.jarvis.loaded = false
      state.files.loaded = false
      setTimeout(() => { navigate('files'); toast(result === 'connected' ? 'Google Drive conectado ao Jarvis.' : result === 'cancelled' ? 'Conexão com Google Drive cancelada.' : 'Não foi possível conectar o Google Drive.', result === 'connected' ? 'success' : 'error') }, 120)
    }
  } catch (err) {
    console.error('Falha ao iniciar Jarvis:', err)
    showBootFailure(err)
  }
}

function bindGlobalEvents() {
  $('authForm').addEventListener('submit', handleAuth)
  $('togglePassword').addEventListener('click', () => {
    const p = $('authPassword')
    const show = p.type === 'password'
    p.type = show ? 'text' : 'password'
    $('togglePassword').textContent = show ? 'Ocultar' : 'Mostrar'
  })
  document.querySelectorAll('[data-auth]').forEach((b) => b.addEventListener('click', () => setAuthMode(b.dataset.auth)))
  document.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => {
    if (b.dataset.view === 'transactions') state.transactionDrilldown = null
    navigate(b.dataset.view)
  }))
  $('monthPicker').addEventListener('change', () => { state.month = $('monthPicker').value; state.selectedTx.clear(); state.transactionDrilldown = null; loadData() })
  $('viewModeBtn').addEventListener('click', () => {
    state.realView = !state.realView
    $('viewModeBtn').textContent = state.realView ? 'Visão real' : 'Contas bancárias'
    renderMain()
  })
  $('newEntryBtn').addEventListener('click', openEntryModal)
  $('logoutBtn').addEventListener('click', () => supabase.auth.signOut())
  $('menuBtn').addEventListener('click', () => toggleSidebar(true))
  $('sidebarClose').addEventListener('click', () => toggleSidebar(false))
  $('mobileOverlay').addEventListener('click', () => toggleSidebar(false))
  $('retryBtn').addEventListener('click', loadData)
  $('askJarvisBtn')?.addEventListener('click', () => navigate('jarvis'))
  $('jarvisDockBtn')?.addEventListener('click', () => navigate('jarvis'))
  $('financeMenuToggle')?.addEventListener('click', () => toggleSidebarGroup('finance'))
  $('futureMenuToggle')?.addEventListener('click', () => toggleSidebarGroup('future'))
  initSidebarGroups()
}

function toggleSidebar(open) { $('sidebar').classList.toggle('open', open); setHidden($('mobileOverlay'), !open) }

const SIDEBAR_GROUPS = {
  finance: { toggle: 'financeMenuToggle', panel: 'financeSubnav', key: 'jarvis_sidebar_finance_open' },
  future: { toggle: 'futureMenuToggle', panel: 'futureSubnav', key: 'jarvis_sidebar_future_open' }
}

function setSidebarGroup(group, open, persist = true) {
  const cfg = SIDEBAR_GROUPS[group]
  if (!cfg) return
  const toggle = $(cfg.toggle)
  const panel = $(cfg.panel)
  if (!toggle || !panel) return
  toggle.setAttribute('aria-expanded', open ? 'true' : 'false')
  panel.setAttribute('aria-hidden', open ? 'false' : 'true')
  panel.classList.toggle('open', !!open)
  if (persist) {
    try { localStorage.setItem(cfg.key, open ? '1' : '0') } catch (_) {}
  }
}

function toggleSidebarGroup(group) {
  const cfg = SIDEBAR_GROUPS[group]
  const toggle = cfg ? $(cfg.toggle) : null
  if (!toggle) return
  const open = toggle.getAttribute('aria-expanded') !== 'true'
  setSidebarGroup(group, open)
  if (open) {
    Object.keys(SIDEBAR_GROUPS).filter((name) => name !== group).forEach((name) => setSidebarGroup(name, false))
  }
}

function initSidebarGroups() {
  let financeOpen = false
  let futureOpen = false
  try {
    financeOpen = localStorage.getItem(SIDEBAR_GROUPS.finance.key) === '1'
    futureOpen = localStorage.getItem(SIDEBAR_GROUPS.future.key) === '1'
  } catch (_) {}
  setSidebarGroup('finance', financeOpen, false)
  setSidebarGroup('future', futureOpen, false)
}

function renderSession() {
  setHidden($('splash'), true)
  const signed = !!state.session
  setHidden($('authView'), signed)
  setHidden($('appView'), !signed)
  if (signed) {
    const email = state.session.user.email || 'usuario'
    $('userEmail').textContent = email
    const friendlyName = personalDisplayName()
    $('userName').textContent = friendlyName
    $('userAvatar').textContent = friendlyName[0]?.toUpperCase() || 'T'
    loadData()
  }
}

function setAuthMode(mode) {
  state.authMode = mode
  showInfo('authMessage', '')
  const map = {
    signin: ['Entrar no Jarvis', 'Use seu e-mail e senha para acessar seu ambiente pessoal.', 'Entrar'],
    signup: ['Criar uma conta', 'Cada pessoa terá um ambiente separado e privado.', 'Criar conta'],
    reset: ['Recuperar senha', 'Enviaremos um link seguro para definir uma nova senha.', 'Enviar recuperação']
  }
  const [title, subtitle, cta] = map[mode]
  $('authTitle').textContent = title
  $('authSubtitle').textContent = subtitle
  $('authSubmit').querySelector('span').textContent = cta
  setHidden($('passwordLabel'), mode === 'reset')
  $('authPassword').required = mode !== 'reset'
  $('authActions').innerHTML = mode === 'signin'
    ? '<button type="button" class="text-button" data-auth="reset">Esqueci minha senha</button><button type="button" class="text-button" data-auth="signup">Criar uma conta</button>'
    : '<button type="button" class="text-button" data-auth="signin">Voltar para o login</button>'
  $('authActions').querySelectorAll('[data-auth]').forEach((b) => b.addEventListener('click', () => setAuthMode(b.dataset.auth)))
}

async function handleAuth(e) {
  e.preventDefault()
  const email = $('authEmail').value.trim()
  const password = $('authPassword').value
  const btn = $('authSubmit')
  showInfo('authMessage', '')
  setBusy(btn, true, 'Processando')
  try {
    if (state.authMode === 'signin') {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error
    }
    if (state.authMode === 'signup') {
      const { error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: location.href.split('#')[0] } })
      if (error) throw error
      showInfo('authMessage', 'Conta criada. Confirme o endereço no e-mail recebido e depois entre no painel.')
    }
    if (state.authMode === 'reset') {
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: location.href.split('#')[0] })
      if (error) throw error
      showInfo('authMessage', 'Link de recuperação enviado para o seu e-mail.')
    }
  } catch (err) {
    showInfo('authMessage', humanError(err))
  } finally {
    setBusy(btn, false)
  }
}

function navigate(view) {
  state.view = view
  state.selectionMode = false
  state.selectedTx.clear()
  const financeViews = ['overview','transactions','purchases','investments','import','accounts']
  document.querySelectorAll('.nav-button[data-view]').forEach((b) => b.classList.toggle('active', b.dataset.view === view))
  $('financeMenuToggle')?.classList.toggle('active-parent', financeViews.includes(view))
  if (financeViews.includes(view)) setSidebarGroup('finance', true, false)
  const meta = {
    home: ['Início', 'AMBIENTE PESSOAL'],
    jarvis: ['Jarvis', 'ASSISTENTE PESSOAL'],
    agenda: ['Agenda', 'TEMPO & COMPROMISSOS'],
    tasks: ['Tarefas', 'PENDÊNCIAS & LEMBRETES'],
    notes: ['Notas & Ideias', 'MEMÓRIA & CRIAÇÃO'],
    projects: ['Projetos', 'PLANOS & OBJETIVOS'],
    files: ['Arquivos', 'DRIVE & MEMÓRIA DOCUMENTAL'],
    overview: ['Visão geral', 'FINANÇAS'],
    transactions: ['Transações', 'FINANÇAS'],
    purchases: ['Compras', 'FINANÇAS'],
    investments: ['Investimentos', 'FINANÇAS'],
    import: ['Importar extratos', 'FINANÇAS'],
    accounts: ['Contas', 'FINANÇAS'],
    health: ['Saúde do sistema', 'DIAGNÓSTICO TÉCNICO']
  }[view] || ['Jarvis', 'AMBIENTE PESSOAL']
  $('pageTitle').textContent = meta[0]
  $('pageEyebrow').textContent = meta[1]
  setHidden($('financeTopActions'), !financeViews.includes(view))
  setHidden($('personalTopActions'), financeViews.includes(view))
  setHidden($('jarvisDockBtn'), ['home','jarvis'].includes(view))
  toggleSidebar(false)
  if (view === 'health' && !state.health.loaded) loadHealthData()
  renderMain()
}

async function loadData() {
  if (!state.session || state.loading) return
  state.loading = true
  state.attention.loaded = false
  showError('')
  renderMain()
  try {
    const user = state.session.user
    const { start, end } = monthRange()
    const monthDate = `${state.month}-01`
    const [acc, balances, cat, rules, tx, pur, profile, budget, invPos, invGoals, invMoves, invSnaps] = await Promise.all([
      supabase.from('accounts').select('*').eq('active', true).order('created_at'),
      supabase.from('account_current_balances').select('*'),
      supabase.from('categories').select('*').eq('active', true).order('group_name').order('name'),
      supabase.from('categorization_rules').select('*').eq('active', true).order('priority'),
      supabase.from('transactions').select('*, accounts(name,institution,account_type), categories(name,group_name,kind)').gte('transaction_date', start).lt('transaction_date', end).order('transaction_date', { ascending: false }).order('created_at', { ascending: false }).limit(1600),
      supabase.from('purchases').select('*').gte('purchase_date', start).lt('purchase_date', end).neq('status', 'ignored').order('purchase_date', { ascending: false }),
      supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),
      supabase.from('budgets').select('*').eq('month', monthDate).is('category_id', null).maybeSingle(),
      supabase.from('investment_positions').select('*, accounts(name,institution,account_type), investment_goals(name,target_amount,target_date)').eq('active', true).order('current_value', { ascending: false }),
      supabase.from('investment_goals').select('*').eq('active', true).order('priority').order('created_at'),
      supabase.from('investment_movements').select('*, investment_positions(name), accounts(name,institution)').gte('movement_date', start).lt('movement_date', end).order('movement_date', { ascending: false }).order('created_at', { ascending: false }),
      supabase.from('investment_snapshots').select('*').order('snapshot_date', { ascending: false }).limit(400)
    ])
    const err = acc.error || balances.error || cat.error || rules.error || tx.error || pur.error || profile.error || budget.error || invPos.error || invGoals.error || invMoves.error || invSnaps.error
    if (err) throw err
    state.accounts = acc.data || []
    state.accountBalances = balances.data || []
    state.categories = cat.data || []
    state.rules = rules.data || []
    state.transactions = tx.data || []
    state.purchases = pur.data || []
    state.profile = profile.data || null
    state.preferences = { use_purchase_details: false, ...(state.profile?.preferences || {}) }
    state.budget = budget.data || null
    state.investmentPositions = invPos.data || []
    state.investmentGoals = invGoals.data || []
    state.investmentMovements = invMoves.data || []
    state.investmentSnapshots = invSnaps.data || []

    const pids = state.purchases.map((p) => p.id)
    if (pids.length) {
      const [alloc, receipts] = await Promise.all([
        supabase.from('purchase_allocations').select('*, categories(name,group_name)').in('purchase_id', pids).order('amount', { ascending: false }),
        supabase.from('purchase_receipts').select('*').in('purchase_id', pids).order('created_at', { ascending: false })
      ])
      if (alloc.error || receipts.error) throw alloc.error || receipts.error
      state.allocations = alloc.data || []
      state.receipts = receipts.data || []
    } else {
      state.allocations = []
      state.receipts = []
    }
    updateUserChrome()
    if (!state.jarvis.loaded) loadJarvisData()
  } catch (err) {
    showError(humanError(err))
  } finally {
    state.loading = false
    renderMain()
  }
}

async function loadAttentionData(force = false) {
  if (!state.session || state.attention.loading || (state.attention.loaded && !force)) return
  state.attention.loading = true
  state.attention.error = null
  if (state.view === 'home') renderMain()
  try {
    const { data, error } = await supabase.functions.invoke('jarvis-attention', { body: {} })
    if (error) throw error
    if (data?.error) throw new Error(data.error)
    state.attention.items = data?.items || []
    state.attention.summary = data?.summary || ''
    state.attention.loaded = true
  } catch (err) {
    state.attention.items = []
    state.attention.summary = ''
    state.attention.error = humanError(err)
    state.attention.loaded = true
  } finally {
    state.attention.loading = false
    if (state.view === 'home') renderMain()
  }
}

function updateUserChrome() {
  const email = state.session?.user?.email || 'usuario'
  const name = personalDisplayName()
  $('userName').textContent = name
  $('userAvatar').textContent = name[0]?.toUpperCase() || 'U'
  const review = state.transactions.filter((t) => ['auto','needs_review'].includes(t.review_status)).length
  ;['reviewBadge', 'financeReviewBadge'].forEach((id) => {
    const badge = $(id)
    if (!badge) return
    badge.textContent = review
    setHidden(badge, !review)
  })
}

function visibleTransactions() {
  if (state.realView) return state.transactions.filter((t) => !t.is_internal_transfer)
  return state.transactions.filter((t) => {
    const type = t.accounts?.account_type || accountById(t.account_id)?.account_type
    return type !== 'virtual' && type !== 'benefit'
  })
}

function renderMain() {
  if (state.loading) {
    $('mainArea').innerHTML = `<div class="content-stack"><div class="skeleton-block h90"></div><div class="kpi-grid">${'<div class="skeleton-block h90"></div>'.repeat(4)}</div><div class="skeleton-block h340"></div></div>`
    return
  }
  if (state.view === 'home') renderHome()
  if (state.view === 'agenda') renderAgenda()
  if (state.view === 'tasks') renderTasks()
  if (state.view === 'notes') renderNotes()
  if (state.view === 'projects') renderProjects()
  if (state.view === 'files') renderFiles()
  if (state.view === 'overview') renderOverview()
  if (state.view === 'transactions') renderTransactions()
  if (state.view === 'purchases') renderPurchases()
  if (state.view === 'investments') renderInvestments()
  if (state.view === 'import') renderImport()
  if (state.view === 'accounts') renderAccounts()
  if (state.view === 'jarvis') renderJarvis()
  if (state.view === 'health') renderHealth()
}

function calcTotals(tx) {
  return tx.reduce((a, t) => {
    const v = num(t.amount)
    const accountType = t.accounts?.account_type || accountById(t.account_id)?.account_type
    if (['income', 'yield'].includes(t.flow_type) && v > 0) {
      if (accountType === 'benefit') a.benefits += v
      else if (accountType === 'virtual') a.thirdPartyIncome += v
      else if (t.metadata?.income_class === 'extraordinary') a.extraordinaryIncome += v
      else a.cashIncome += v
      if (t.flow_type === 'yield') a.yields += v
    }
    if (t.flow_type === 'expense') {
      a.expense += Math.abs(v)
      if (accountType === 'benefit') a.benefitSpend += Math.abs(v)
    }
    if (t.flow_type === 'investment') a.invest += Math.abs(v)
    return a
  }, { cashIncome: 0, extraordinaryIncome: 0, benefits: 0, thirdPartyIncome: 0, expense: 0, invest: 0, yields: 0, benefitSpend: 0 })
}

function categorySpend(tx) {
  const map = new Map()
  const detailedPurchaseIds = new Set(
    state.preferences.use_purchase_details
      ? state.purchases.filter((p) => p.detail_mode === 'detailed' && state.allocations.some((a) => a.purchase_id === p.id)).map((p) => p.id)
      : []
  )
  tx.filter((t) => t.flow_type === 'expense').forEach((t) => {
    if (t.purchase_id && detailedPurchaseIds.has(t.purchase_id)) return
    const n = t.categories?.group_name || categoryById(t.category_id)?.group_name || t.categories?.name || 'Sem categoria'
    map.set(n, (map.get(n) || 0) + Math.abs(num(t.amount)))
  })
  detailedPurchaseIds.forEach((pid) => {
    state.allocations.filter((a) => a.purchase_id === pid).forEach((a) => {
      const n = a.categories?.group_name || categoryById(a.category_id)?.group_name || 'Sem categoria'
      map.set(n, (map.get(n) || 0) + num(a.amount))
    })
  })
  return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 7)
}

function dailySeries(tx) {
  const [y, m] = state.month.split('-').map(Number)
  const days = new Date(y, m, 0).getDate()
  const by = new Map()
  tx.forEach((t) => {
    if (t.flow_type === 'transfer') return
    const d = parseDate(t.transaction_date).getDate()
    by.set(d, (by.get(d) || 0) + num(t.amount))
  })
  let c = 0
  return Array.from({ length: days }, (_, i) => { c += by.get(i + 1) || 0; return c })
}

function renderOverview() {
  const tx = visibleTransactions()
  const totals = calcTotals(tx)
  const resources = totals.cashIncome + totals.extraordinaryIncome + totals.benefits + totals.thirdPartyIncome
  const invMonth = investmentTotals()
  const netInvestment = invMonth.monthContribution - invMonth.monthWithdrawal
  const result = resources - totals.expense - netInvestment
  const cats = categorySpend(tx)
  const series = dailySeries(tx)
  const label = monthFmt.format(parseDate(`${state.month}-01`))
  const reviewCount = state.transactions.filter((t) => t.review_status === 'needs_review').length
  const grouped = state.purchases.length
  const benefitShare = totals.expense ? Math.round((totals.benefitSpend / totals.expense) * 100) : 0
  const budget = num(state.budget?.amount)
  const budgetBase = budget || resources
  const budgetPct = budgetBase ? Math.min(100, (totals.expense / budgetBase) * 100) : 0

  $('mainArea').innerHTML = `<div class="content-stack">
    <section class="section-header">
      <div><span class="muted">Resumo de ${esc(label)}</span><h2>${tx.length ? 'Uma leitura clara do seu mês.' : 'Seu painel está pronto para começar.'}</h2><p>${state.realView ? 'Inclui benefícios e despesas pagas por terceiros.' : 'Somente movimentações das contas bancárias e carteiras.'}</p></div>
      <div class="section-actions"><button id="overviewImport" class="button" type="button">⇧ Importar extrato</button><button id="overviewBudget" class="button" type="button">◎ ${budget ? 'Editar orçamento' : 'Definir orçamento'}</button></div>
    </section>

    <section class="kpi-grid">
      ${kpi('Renda em dinheiro', money.format(totals.cashIncome), totals.extraordinaryIncome ? `${money.format(totals.extraordinaryIncome)} em entrada extraordinária separada` : 'Sem empréstimos e transferências', 'Dinheiro', '', 'cash_income')}
      ${kpi('Benefícios recebidos', money.format(totals.benefits), `${money.format(totals.benefitSpend)} usados no mês`, 'Benefício', 'benefit', 'benefit')}
      ${kpi('Gastos reais', money.format(totals.expense), 'Sem transferências internas', 'Consumo', '', 'expense')}
      ${kpi('Resultado do mês', money.format(result), `${money.format(netInvestment)} direcionados líquidos a investimentos · inclui pagamentos por terceiros`, result >= 0 ? 'Positivo' : 'Atenção', result >= 0 ? 'positive' : '', 'result')}
    </section>

    <section class="dashboard-grid grid-main">
      <div class="panel">${panelHead('Evolução financeira', 'Recursos menos gastos e aportes no decorrer do mês')}<div class="chart-wrap">${lineChart(series)}</div></div>
      <div class="panel pulse-card">${panelHead(budget ? 'Orçamento mensal' : 'Ritmo do mês', budget ? 'Gastos em relação ao limite definido' : 'Gastos em relação aos recursos recebidos')}<div class="pulse-number">${Math.round(budgetPct)}%</div><div class="progress-track"><div class="progress-value" style="width:${budgetPct}%"></div></div><div class="metric-stack"><div><span>Gastos</span><strong>${money.format(totals.expense)}</strong></div><div><span>${budget ? 'Limite' : 'Recursos'}</span><strong>${money.format(budgetBase)}</strong></div></div><div class="inline-note">${budget ? `${money.format(Math.max(0, budget - totals.expense))} ainda disponíveis no orçamento.` : 'Defina um orçamento para separar limite de gasto de renda recebida.'}</div></div>
    </section>

    <section class="insight-strip">
      <button class="insight-item" id="insightReview" type="button"><span class="insight-icon">?</span><div><strong>Precisam de revisão</strong><p>Descrições ou categorias ainda incertas</p></div><b>${reviewCount}</b></button>
      <button class="insight-item" id="insightPurchases" type="button"><span class="insight-icon">◫</span><div><strong>Compras agrupadas</strong><p>Múltiplos pagamentos tratados como uma compra</p></div><b>${grouped}</b></button>
      <button class="insight-item" id="insightBenefit" type="button"><span class="insight-icon">B</span><div><strong>Benefício no consumo</strong><p>Participação do cartão alimentação nos gastos</p></div><b>${benefitShare}%</b></button>
    </section>

    <section class="dashboard-grid grid-two">
      <div class="panel">${panelHead('Gastos por categoria', state.preferences.use_purchase_details ? 'Usando o detalhamento das compras quando disponível' : 'Usando a categoria principal das transações', state.preferences.use_purchase_details ? 'Detalhamento ligado' : 'Resumo')}${cats.length ? categoryBars(cats) : empty('As categorias aparecem depois da primeira importação.')}</div>
      <div class="panel">${panelHead('Contas acompanhadas', 'Bancos, carteiras, benefícios e contas de controle', `${state.accounts.length} contas`)}<div class="account-list">${state.accounts.slice(0, 6).map(accountRow).join('')}</div></div>
    </section>

    <section class="panel">${panelHead('Últimas movimentações', 'Clique em uma transação para revisar ou editar', '<button class="button small" id="allTransactions" type="button">Ver todas →</button>')}${tx.length ? `<div class="tx-table">${tx.slice(0, 8).map((t) => transactionRow(t)).join('')}</div>` : empty('Nenhuma movimentação neste período.','<button class="button primary" id="emptyImport" type="button">Importar extrato</button>')}</section>
  </div>`

  $('overviewImport')?.addEventListener('click', () => navigate('import'))
  $('emptyImport')?.addEventListener('click', () => navigate('import'))
  $('overviewBudget')?.addEventListener('click', openBudgetModal)
  $('allTransactions')?.addEventListener('click', () => navigate('transactions'))
  $('insightReview')?.addEventListener('click', () => { state.view = 'transactions'; navigate('transactions'); setTimeout(() => document.querySelector('[data-filter="needs_review"]')?.click(), 0) })
  $('insightPurchases')?.addEventListener('click', () => navigate('purchases'))
  $('insightBenefit')?.addEventListener('click', () => navigate('accounts'))
  document.querySelectorAll('[data-category-group]').forEach((b) => b.addEventListener('click', () => openCategoryTransactions(b.dataset.categoryGroup)))
  document.querySelectorAll('[data-account-drill]').forEach((b) => b.addEventListener('click', () => openTransactionDrilldown({ accountId: b.dataset.accountDrill })))
  document.querySelectorAll('[data-kpi-drill]').forEach((b) => b.addEventListener('click', () => {
    if (b.dataset.kpiDrill === 'result') openResultBreakdown(totals, result, netInvestment)
    else openTransactionDrilldown({ mode: b.dataset.kpiDrill })
  }))
  bindLineChart()
  bindTransactionOpeners()
}

function kpi(label, value, helper, chip, tone = '', drill = '') {
  const content = `<div class="kpi-head"><span>${esc(label)}</span><span class="kpi-chip">${esc(chip)}</span></div><strong>${esc(value)}</strong><small>${esc(helper)}</small>${drill ? '<span class="kpi-open-hint">Ver detalhes →</span>' : ''}`
  return drill ? `<button type="button" class="kpi-card kpi-clickable ${tone}" data-kpi-drill="${esc(drill)}">${content}</button>` : `<article class="kpi-card ${tone}">${content}</article>`
}
function panelHead(title, subtitle, action = '') {
  return `<div class="panel-head"><div><h3>${esc(title)}</h3><p>${esc(subtitle)}</p></div>${action ? (action.startsWith('<') ? action : `<span class="panel-tag">${esc(action)}</span>`) : ''}</div>`
}
function empty(text, action = '') { return `<div class="empty-state"><div class="empty-icon">◇</div><p>${esc(text)}</p>${action}</div>` }
function lineChart(values) {
  if (!values.length) return empty('Sem dados no período.')
  const w = 760, h = 250, p = 24
  let min = Math.min(0, ...values), max = Math.max(0, ...values)
  if (min === max) { max += 1; min -= 1 }
  const pts = values.map((v, i) => {
    const x = p + i * (w - p * 2) / Math.max(1, values.length - 1)
    const y = p + (max - v) * (h - p * 2) / (max - min)
    return [x, y]
  })
  const d = pts.map((pt, i) => `${i ? 'L' : 'M'}${pt[0].toFixed(1)},${pt[1].toFixed(1)}`).join(' ')
  const area = `${d} L${pts.at(-1)[0]},${h - p} L${pts[0][0]},${h - p} Z`
  const hitPoints = pts.map((pt, i) => `<circle class="chart-hit-point" cx="${pt[0].toFixed(1)}" cy="${pt[1].toFixed(1)}" r="11" tabindex="0" data-chart-index="${i}" data-chart-x="${pt[0].toFixed(1)}" data-chart-y="${pt[1].toFixed(1)}" data-chart-value="${values[i]}" aria-label="Dia ${i + 1}: ${money.format(values[i])}"/>`).join('')
  return `<svg class="interactive-line-chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="Evolução financeira. Passe o mouse ou toque na linha para ver os valores por dia." data-chart-width="${w}" data-chart-padding="${p}"><defs><linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#102535" stop-opacity=".12"/><stop offset="100%" stop-color="#102535" stop-opacity="0"/></linearGradient></defs><line x1="${p}" y1="${h - p}" x2="${w - p}" y2="${h - p}" stroke="#e6e9e6"/><line x1="${p}" y1="${h / 2}" x2="${w - p}" y2="${h / 2}" stroke="#edf0ed"/><path d="${area}" class="chart-fill"/><path d="${d}" class="chart-line"/><g class="chart-interaction-layer">${hitPoints}</g><line class="chart-guide" x1="0" y1="${p}" x2="0" y2="${h - p}"/><circle class="chart-focus-dot" cx="0" cy="0" r="5"/><g class="chart-tooltip" transform="translate(0 0)"><rect class="chart-tooltip-bg" width="154" height="48" rx="9"/><text class="chart-tooltip-date" x="12" y="19"></text><text class="chart-tooltip-value" x="12" y="38"></text></g><circle cx="${pts.at(-1)[0]}" cy="${pts.at(-1)[1]}" r="4" class="chart-end-dot"/><text x="${p}" y="${h - 5}" class="chart-label">01</text><text x="${w / 2}" y="${h - 5}" text-anchor="middle" class="chart-label">15</text><text x="${w - p}" y="${h - 5}" text-anchor="end" class="chart-label">${values.length}</text></svg>`
}

function bindLineChart() {
  const svg = document.querySelector('.interactive-line-chart')
  if (!svg || svg.dataset.bound === '1') return
  svg.dataset.bound = '1'
  const hits = [...svg.querySelectorAll('.chart-hit-point')]
  const guide = svg.querySelector('.chart-guide')
  const dot = svg.querySelector('.chart-focus-dot')
  const tooltip = svg.querySelector('.chart-tooltip')
  const tooltipDate = svg.querySelector('.chart-tooltip-date')
  const tooltipValue = svg.querySelector('.chart-tooltip-value')
  const w = Number(svg.dataset.chartWidth || 760)
  const tooltipW = 154
  let pinned = false

  const showPoint = (hit) => {
    if (!hit) return
    const x = Number(hit.dataset.chartX)
    const y = Number(hit.dataset.chartY)
    const index = Number(hit.dataset.chartIndex)
    const value = Number(hit.dataset.chartValue)
    const [year, month] = state.month.split('-').map(Number)
    const day = index + 1
    const dateLabel = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(year, month - 1, day, 12))
    guide.setAttribute('x1', x); guide.setAttribute('x2', x)
    dot.setAttribute('cx', x); dot.setAttribute('cy', y)
    tooltipDate.textContent = dateLabel
    tooltipValue.textContent = money.format(value)
    const tx = Math.max(6, Math.min(w - tooltipW - 6, x + 12))
    const ty = Math.max(6, Math.min(194, y - 60))
    tooltip.setAttribute('transform', `translate(${tx} ${ty})`)
    svg.classList.add('chart-active')
    hits.forEach((h) => h.classList.toggle('active', h === hit))
  }
  const nearestByClientX = (clientX) => {
    const rect = svg.getBoundingClientRect()
    if (!rect.width) return hits[0]
    const localX = (clientX - rect.left) * w / rect.width
    return hits.reduce((best, h) => Math.abs(Number(h.dataset.chartX) - localX) < Math.abs(Number(best.dataset.chartX) - localX) ? h : best, hits[0])
  }
  const hide = () => {
    if (pinned) return
    svg.classList.remove('chart-active')
    hits.forEach((h) => h.classList.remove('active'))
  }

  svg.addEventListener('pointermove', (event) => {
    if (event.pointerType === 'touch' && pinned) return
    showPoint(nearestByClientX(event.clientX))
  })
  svg.addEventListener('pointerleave', hide)
  svg.addEventListener('click', (event) => {
    const hit = event.target.closest?.('.chart-hit-point') || nearestByClientX(event.clientX)
    pinned = true
    showPoint(hit)
  })
  hits.forEach((hit) => {
    hit.addEventListener('focus', () => { pinned = true; showPoint(hit) })
    hit.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') { pinned = false; svg.classList.remove('chart-active'); hit.blur() }
    })
  })
}
function categoryBars(cats) {
  const max = cats[0]?.[1] || 1
  return `<div class="category-bars">${cats.map(([n, v], i) => `<button class="category-bar-button" data-category-group="${esc(n)}" type="button" title="Ver lançamentos de ${esc(n)}"><div class="cat-line"><span>${esc(n)}</span><strong>${money.format(v)}</strong></div><div class="cat-track"><div class="cat-fill shade-${i}" style="width:${Math.max(3, v / max * 100)}%"></div></div><small>Ver lançamentos</small></button>`).join('')}</div>`
}

function openCategoryTransactions(groupName) {
  openTransactionDrilldown({ group: groupName || null })
}
function openTransactionDrilldown(spec = {}) {
  state.transactionDrilldown = { group: null, categoryId: null, accountId: null, mode: null, ...spec }
  navigate('transactions')
}
function openResultBreakdown(totals, result, netInvestment = 0) {
  const resources = totals.cashIncome + totals.extraordinaryIncome + totals.benefits + totals.thirdPartyIncome
  const modal = $('modalHost')
  modal.innerHTML = `<div class="modal-backdrop"><div class="modal"><div class="modal-head"><div><span class="eyebrow">COMPOSIÇÃO DO RESULTADO</span><h2>${esc(monthFmt.format(parseDate(`${state.month}-01`)))}</h2><div class="modal-sub">O resultado é formado pelos recursos do mês menos consumo e aportes.</div></div><button id="closeModal" class="icon-button" type="button">×</button></div><div class="result-breakdown"><button type="button" data-result-drill="cash_income"><span>Renda em dinheiro</span><strong>+ ${money.format(totals.cashIncome)}</strong></button>${totals.extraordinaryIncome ? `<button type="button" data-result-drill="extraordinary"><span>Entradas extraordinárias</span><strong>+ ${money.format(totals.extraordinaryIncome)}</strong></button>` : ''}<button type="button" data-result-drill="benefit"><span>Benefícios</span><strong>+ ${money.format(totals.benefits)}</strong></button><div><span>Recursos via terceiro</span><strong>+ ${money.format(totals.thirdPartyIncome)}</strong></div><button type="button" data-result-drill="expense"><span>Gastos reais</span><strong>− ${money.format(totals.expense)}</strong></button><div><span>Aportes líquidos (aportes − resgates)</span><strong>− ${money.format(netInvestment)}</strong></div><div class="result-total"><span>Resultado</span><strong>${money.format(result)}</strong></div></div></div></div>`
  $('closeModal')?.addEventListener('click', () => { modal.innerHTML = '' })
  modal.querySelectorAll('[data-result-drill]').forEach((b) => b.addEventListener('click', () => { modal.innerHTML = ''; openTransactionDrilldown({ mode: b.dataset.resultDrill }) }))
}
function accountIcon(a) {
  const cls = a.account_type === 'benefit' ? 'benefit' : a.account_type === 'virtual' ? 'virtual' : ''
  const icon = a.account_type === 'credit_card' ? '▣' : a.account_type === 'benefit' ? 'B' : a.account_type === 'virtual' ? '⌂' : a.account_type === 'savings' ? '◇' : '◈'
  return `<div class="account-icon ${cls}">${icon}</div>`
}
function accountRow(a) {
  const balance = accountBalanceLabel(a)
  const value = balance.value == null ? '—' : money.format(balance.value)
  const subtitle = balance.date ? `Saldo em ${dateFmt.format(parseDate(balance.date))}` : balance.label
  return `<button type="button" class="account-row account-row-clickable" data-account-drill="${a.id}" title="Ver movimentações de ${esc(a.name)}">${accountIcon(a)}<div class="account-copy"><strong>${esc(a.name)}</strong><span>${esc(a.institution.replaceAll('_', ' '))} · ${esc(subtitle)}</span></div><strong>${value}</strong></button>`
}
function transactionRow(t, { selectMode = false } = {}) {
  const pos = num(t.amount) > 0
  const accountType = t.accounts?.account_type || accountById(t.account_id)?.account_type
  const iconClass = accountType === 'benefit' ? 'benefit' : pos ? 'income' : ''
  const status = t.review_status || 'reviewed'
  const cat = t.categories?.name || categoryById(t.category_id)?.name || (t.flow_type === 'transfer' ? 'Transferência' : 'Sem categoria')
  const eligible = t.flow_type === 'expense' && !t.purchase_id && !t.is_internal_transfer
  const check = selectMode ? `<input class="tx-check" data-select-tx="${t.id}" type="checkbox" ${state.selectedTx.has(t.id) ? 'checked' : ''} ${eligible ? '' : 'disabled'} aria-label="Selecionar transação">` : ''
  return `<div class="tx-row ${selectMode ? 'select-mode' : ''} clickable" data-open-tx="${t.id}">${check}<div class="tx-icon ${iconClass}">${accountType === 'benefit' ? 'B' : pos ? '↓' : '↑'}</div><div class="tx-main"><strong>${esc(displayDescription(t))}</strong><span><span class="status-dot ${esc(status)}"></span>${esc(t.accounts?.name || accountById(t.account_id)?.name || 'Conta')}${t.purchase_id ? ' · compra agrupada' : ''}</span></div><div class="tx-category">${esc(cat)}</div><div class="tx-date">${esc(dateFmt.format(parseDate(t.transaction_date)))}</div><div class="tx-amount ${pos ? 'income' : ''}">${pos ? '+ ' : ''}${money.format(num(t.amount))}</div><button class="tx-more" data-edit-tx="${t.id}" type="button" aria-label="Editar transação">•••</button></div>`
}
function bindTransactionOpeners() {
  document.querySelectorAll('[data-open-tx]').forEach((row) => row.addEventListener('click', (e) => {
    if (e.target.closest('[data-select-tx]') || e.target.closest('[data-edit-tx]')) return
    openTransactionModal(row.dataset.openTx)
  }))
  document.querySelectorAll('[data-edit-tx]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); openTransactionModal(b.dataset.editTx) }))
}

function renderTransactions() {
  $('mainArea').innerHTML = `<div class="content-stack">
    <section class="section-header"><div><span class="muted">${state.transactions.length} movimentações em ${esc(monthFmt.format(parseDate(`${state.month}-01`)))}</span><h2>Transações</h2><p>Edite o nome amigável e a categoria sem perder o dado original do extrato.</p></div><div class="section-actions"><button id="groupMode" class="button" type="button">◫ Agrupar pagamentos</button><button id="txRefresh" class="button" type="button">↻ Atualizar</button></div></section>
    <section class="panel">
      <div class="toolbar"><label class="search-box">⌕<input id="txSearch" placeholder="Buscar descrição, estabelecimento ou tag"></label><select id="txAccount"><option value="">Todas as contas</option>${state.accounts.map((a) => `<option value="${a.id}">${esc(a.name)}</option>`).join('')}</select><select id="txCategory"><option value="">Todas as categorias</option>${state.categories.map((c) => `<option value="${c.id}">${esc(c.group_name)} · ${esc(c.name)}</option>`).join('')}</select></div>
      <div class="filter-pills"><button class="filter-pill active" data-filter="all" type="button">Todas</button><button class="filter-pill" data-filter="needs_review" type="button">Precisa revisar</button><button class="filter-pill" data-filter="expense" type="button">Despesas</button><button class="filter-pill" data-filter="income" type="button">Receitas</button><button class="filter-pill" data-filter="grouped" type="button">Compras agrupadas</button></div>
      <div id="drilldownFilter"></div><div id="selectionBar"></div><div id="txList" class="tx-table"></div><div id="txFilterSummary"></div>
    </section>
  </div>`

  let filter = 'all'
  if (state.transactionDrilldown?.categoryId) $('txCategory').value = state.transactionDrilldown.categoryId
  if (state.transactionDrilldown?.accountId) $('txAccount').value = state.transactionDrilldown.accountId
  const draw = () => {
    const q = $('txSearch').value.trim().toLowerCase()
    const acc = $('txAccount').value
    const cat = $('txCategory').value
    const group = state.transactionDrilldown?.group || ''
    const drillAccount = state.transactionDrilldown?.accountId || ''
    const drillMode = state.transactionDrilldown?.mode || ''
    const rows = state.transactions.filter((t) => {
      const hay = `${displayDescription(t)} ${t.description || ''} ${t.merchant || ''} ${(t.tags || []).join(' ')}`.toLowerCase()
      const statusMatch = filter === 'all' || (filter === 'needs_review' && t.review_status === 'needs_review') || (filter === 'expense' && t.flow_type === 'expense') || (filter === 'income' && ['income', 'yield'].includes(t.flow_type)) || (filter === 'grouped' && !!t.purchase_id)
      const txGroup = t.categories?.group_name || categoryById(t.category_id)?.group_name || ''
      const accountType = t.accounts?.account_type || accountById(t.account_id)?.account_type || ''
      const modeMatch = !drillMode || (drillMode === 'cash_income' && ['income','yield'].includes(t.flow_type) && num(t.amount) > 0 && !t.is_internal_transfer && !['benefit','virtual'].includes(accountType) && t.metadata?.income_class !== 'extraordinary') || (drillMode === 'extraordinary' && t.metadata?.income_class === 'extraordinary') || (drillMode === 'benefit' && accountType === 'benefit') || (drillMode === 'expense' && t.flow_type === 'expense')
      return (!q || hay.includes(q)) && (!acc || t.account_id === acc) && (!drillAccount || t.account_id === drillAccount) && (!cat || t.category_id === cat) && (!group || txGroup === group) && modeMatch && statusMatch
    })
    $('txList').innerHTML = rows.length ? rows.map((t) => transactionRow(t, { selectMode: state.selectionMode })).join('') : empty('Nenhuma transação com esses filtros.')
    renderDrilldownFilter(rows.length)
    renderFilterSummary(rows, { q, acc, cat, group, drillAccount, drillMode, filter })
    renderSelectionBar()
    bindTransactionOpeners()
    document.querySelectorAll('[data-select-tx]').forEach((c) => c.addEventListener('change', (e) => {
      e.stopPropagation()
      if (c.checked) state.selectedTx.add(c.dataset.selectTx); else state.selectedTx.delete(c.dataset.selectTx)
      renderSelectionBar()
    }))
  }
  const renderFilterSummary = (rows, active) => {
    const host = $('txFilterSummary')
    if (!host) return
    const hasFilter = !!(active.q || active.acc || active.cat || active.group || active.drillAccount || active.drillMode || active.filter !== 'all')
    if (!hasFilter || !rows.length) { host.innerHTML = ''; return }

    const expenses = rows.filter((t) => t.flow_type === 'expense' && !t.is_internal_transfer)
    const incomes = rows.filter((t) => ['income', 'yield'].includes(t.flow_type) && !t.is_internal_transfer)
    const transfers = rows.filter((t) => t.is_internal_transfer || t.flow_type === 'transfer')
    const expenseTotal = expenses.reduce((sum, t) => sum + Math.abs(num(t.amount)), 0)
    const incomeTotal = incomes.reduce((sum, t) => sum + Math.abs(num(t.amount)), 0)
    const net = incomeTotal - expenseTotal

    let metrics = ''
    if (expenseTotal > 0 && incomeTotal === 0) {
      const avg = expenses.length ? expenseTotal / expenses.length : 0
      metrics = `<div class="filter-summary-main"><span>Total gasto</span><strong>${money.format(expenseTotal)}</strong></div><div class="filter-summary-metrics"><div><span>Lançamentos</span><strong>${expenses.length}</strong></div><div><span>Ticket médio</span><strong>${money.format(avg)}</strong></div></div>`
    } else if (incomeTotal > 0 && expenseTotal === 0) {
      const avg = incomes.length ? incomeTotal / incomes.length : 0
      metrics = `<div class="filter-summary-main income"><span>Total recebido</span><strong>${money.format(incomeTotal)}</strong></div><div class="filter-summary-metrics"><div><span>Lançamentos</span><strong>${incomes.length}</strong></div><div><span>Valor médio</span><strong>${money.format(avg)}</strong></div></div>`
    } else {
      metrics = `<div class="filter-summary-main"><span>Saldo do filtro</span><strong class="${net >= 0 ? 'positive' : 'negative'}">${money.format(net)}</strong></div><div class="filter-summary-metrics"><div><span>Entradas</span><strong>${money.format(incomeTotal)}</strong></div><div><span>Saídas</span><strong>${money.format(expenseTotal)}</strong></div><div><span>Lançamentos</span><strong>${rows.length}</strong></div></div>`
    }

    host.innerHTML = `<div class="filter-summary-card"><div class="filter-summary-head"><div><span class="eyebrow">RESUMO DO FILTRO</span><h3>O que este recorte representa</h3></div><small>${rows.length} item(ns) exibido(s)</small></div>${metrics}${transfers.length ? `<p class="filter-summary-note">${transfers.length} transferência(s) interna(s) aparecem na lista, mas não entram no total de gasto/receita.</p>` : ''}</div>`
  }

  const renderDrilldownFilter = (count) => {
    const host = $('drilldownFilter')
    if (!host) return
    const group = state.transactionDrilldown?.group
    const categoryId = state.transactionDrilldown?.categoryId
    const accountId = state.transactionDrilldown?.accountId
    const mode = state.transactionDrilldown?.mode
    const cat = categoryId ? categoryById(categoryId) : null
    const modeLabel = ({cash_income:'Renda em dinheiro',extraordinary:'Entradas extraordinárias',benefit:'Benefícios',expense:'Gastos reais'})[mode] || ''
    const label = cat ? `${cat.group_name} · ${cat.name}` : group || (accountId ? (accountById(accountId)?.name || 'Conta') : '') || modeLabel
    if (!label) { host.innerHTML = ''; return }
    host.innerHTML = `<div class="drilldown-banner"><div><span>Filtro vindo do dashboard</span><strong>${esc(label)}</strong><small>${count} lançamento(s) neste mês</small></div><button id="clearDrilldown" class="button small" type="button">× Limpar filtro</button></div>`
    $('clearDrilldown')?.addEventListener('click', () => { state.transactionDrilldown = null; $('txCategory').value = ''; $('txAccount').value = ''; draw() })
  }

  const renderSelectionBar = () => {
    if (!state.selectionMode) { $('selectionBar').innerHTML = ''; return }
    $('selectionBar').innerHTML = `<div class="selection-bar"><span>${state.selectedTx.size ? `${state.selectedTx.size} pagamento(s) selecionado(s)` : 'Selecione dois ou mais pagamentos da mesma compra'}</span><div class="selection-actions"><button id="cancelSelection" class="button small" type="button">Cancelar</button><button id="confirmGroup" class="button primary small" type="button" ${state.selectedTx.size >= 2 ? '' : 'disabled'}>Agrupar como compra</button></div></div>`
    $('cancelSelection').addEventListener('click', () => { state.selectionMode = false; state.selectedTx.clear(); draw() })
    $('confirmGroup').addEventListener('click', () => openGroupModal([...state.selectedTx]))
  }

  $('txSearch').addEventListener('input', draw)
  $('txAccount').addEventListener('change', draw)
  $('txCategory').addEventListener('change', () => {
    const id = $('txCategory').value
    state.transactionDrilldown = id ? { group: null, categoryId: id } : null
    draw()
  })
  document.querySelectorAll('[data-filter]').forEach((b) => b.addEventListener('click', () => {
    filter = b.dataset.filter
    document.querySelectorAll('[data-filter]').forEach((x) => x.classList.toggle('active', x === b))
    draw()
  }))
  $('groupMode').addEventListener('click', () => { state.selectionMode = !state.selectionMode; state.selectedTx.clear(); draw() })
  $('txRefresh').addEventListener('click', loadData)
  draw()
}

function openTransactionModal(id) {
  const t = state.transactions.find((x) => x.id === id)
  if (!t) return
  const modal = $('modalHost')
  const sourceAccount = t.accounts?.name || accountById(t.account_id)?.name || 'Conta'
  const currentAccountMissing = !state.accounts.some((a) => a.id === t.account_id)
  const currentAccountOption = currentAccountMissing ? `<option value="${t.account_id}" selected>${esc(sourceAccount)} · encerrada</option>` : ''
  const relevantCategories = state.categories.filter((c) => t.flow_type === 'expense' ? c.kind === 'expense' : ['income', 'yield'].includes(t.flow_type) ? c.kind === 'income' : true)
  const snapshot = t.metadata?.source_snapshot
  const originalDescription = snapshot?.description || t.description
  const originalDate = snapshot?.transaction_date || t.transaction_date
  const originalAmount = snapshot?.amount ?? t.amount
  const rulePattern = (t.merchant || t.description || '').trim().slice(0, 120)

  modal.innerHTML = `<div class="modal-backdrop"><form id="txEditForm" class="modal wide">
    <div class="modal-head"><div><span class="eyebrow">EDITAR TRANSAÇÃO</span><h2>${esc(displayDescription(t))}</h2><div class="modal-sub">O dado original do extrato permanece preservado.</div></div><button id="closeModal" class="icon-button" type="button">×</button></div>
    <div class="form-grid">
      <label class="field-label full-span">Nome que aparece no painel<input id="editDisplay" value="${esc(t.display_description || '')}" placeholder="${esc(t.description)}"></label>
      <label class="field-label">Data usada nos relatórios<input id="editDate" type="date" value="${esc(t.transaction_date)}"></label>
      <label class="field-label">Valor usado no painel<input id="editAmount" inputmode="decimal" value="${Math.abs(num(t.amount)).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})}"><span class="tag-input-help">Use apenas o valor absoluto; o tipo define entrada ou saída.</span></label>
      <label class="field-label">Conta<select id="editAccount">${currentAccountOption}${state.accounts.map((a) => `<option value="${a.id}" ${a.id === t.account_id ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select></label>
      <label class="field-label">Tipo<select id="editFlow"><option value="expense" ${t.flow_type === 'expense' ? 'selected' : ''}>Despesa</option><option value="income" ${t.flow_type === 'income' ? 'selected' : ''}>Receita</option><option value="yield" ${t.flow_type === 'yield' ? 'selected' : ''}>Rendimento</option><option value="transfer" ${t.flow_type === 'transfer' ? 'selected' : ''}>Transferência</option><option value="investment" ${t.flow_type === 'investment' ? 'selected' : ''}>Investimento</option><option value="adjustment" ${t.flow_type === 'adjustment' ? 'selected' : ''}>Ajuste</option></select></label>
      <label class="field-label">Categoria<select id="editCategory"><option value="">Sem categoria</option>${relevantCategories.map((c) => `<option value="${c.id}" ${c.id === t.category_id ? 'selected' : ''}>${esc(c.group_name)} · ${esc(c.name)}</option>`).join('')}<option value="__custom__">＋ Outro / criar categoria…</option></select></label><div id="customCategoryFields" class="custom-category-fields full-span hidden"><label class="field-label">Grupo<select id="customCategoryGroup">${[...new Set(relevantCategories.map((c) => c.group_name))].map((g) => `<option value="${esc(g)}">${esc(g)}</option>`).join('')}<option value="Outros">Outros</option></select></label><label class="field-label">Nome da categoria<input id="customCategoryName" placeholder="Ex.: Mercado do condomínio"></label><div class="custom-learn-note"><strong>Categoria personalizada</strong><span>Por padrão, somente este lançamento será alterado.</span></div><div class="toggle-row full-span"><div><strong>Aplicar também a lançamentos semelhantes</strong><p>Ative apenas quando esta descrição realmente significar sempre a mesma coisa.</p></div><label class="switch"><input id="customApplySimilar" type="checkbox"><span class="switch-track"></span></label></div></div>
      <label class="field-label full-span">Observação<textarea id="editNotes" placeholder="Contexto que ajude você no futuro">${esc(t.notes || '')}</textarea></label>
      <label class="field-label full-span">Tags<input id="editTags" value="${esc((t.tags || []).join(', '))}" placeholder="ex.: mercado, casa, viagem"><span class="tag-input-help">Separe as tags por vírgula.</span></label>
    </div>
    <div class="toggle-row"><div><strong>Incluir no orçamento</strong><p>Desative quando a movimentação não representar consumo do mês.</p></div><label class="switch"><input id="editBudget" type="checkbox" ${t.include_in_budget ? 'checked' : ''}><span class="switch-track"></span></label></div>
    <div class="toggle-row"><div><strong>Transferência entre minhas contas</strong><p>Evita que a movimentação seja tratada como gasto ou receita real.</p></div><label class="switch"><input id="editInternal" type="checkbox" ${t.is_internal_transfer ? 'checked' : ''}><span class="switch-track"></span></label></div>
    <div class="source-box"><div class="source-box-title">DADO ORIGINAL / FONTE</div><div class="source-grid"><div><span>Descrição original</span><strong>${esc(originalDescription)}</strong></div><div><span>Valor original</span><strong>${money.format(num(originalAmount))}</strong></div><div><span>Data original</span><strong>${esc(fullDateFmt.format(parseDate(originalDate)))}</strong></div><div><span>Origem</span><strong>${esc(sourceAccount)} · ${esc(t.transaction_source)}</strong></div></div></div>
    ${t.transaction_source === 'import' && rulePattern ? `<div class="toggle-row"><div><strong>Criar regra automática com esta edição</strong><p>Próximas transações que contenham “${esc(rulePattern)}” recebem esta categoria automaticamente.</p></div><label class="switch"><input id="createRule" type="checkbox"><span class="switch-track"></span></label></div>` : ''}
    <div id="txEditMessage" class="form-message hidden"></div>
    <div class="modal-actions"><div class="modal-actions-left"><button id="deleteTx" class="button danger" type="button">Excluir lançamento</button>${t.flow_type === 'expense' ? '<button id="splitTx" class="button" type="button">≡ Dividir em categorias</button>' : ''}</div><div class="modal-actions-right"><button id="cancelModal" class="button" type="button">Cancelar</button><button id="saveTx" class="button primary" type="submit">✓ Salvar alterações</button></div></div>
  </form></div>`

  const close = () => { modal.innerHTML = '' }
  $('closeModal').addEventListener('click', close)
  $('cancelModal').addEventListener('click', close)
  $('splitTx')?.addEventListener('click', () => openSplitModal(t.id))
  $('deleteTx').addEventListener('click', async () => {
    if (t.purchase_id) { showInfo('txEditMessage', 'Desagrupe esta compra antes de excluir um dos pagamentos.'); return }
    if (!confirm(`Excluir ${displayDescription(t)} (${money.format(num(t.amount))})? Esta ação remove o lançamento do painel.`)) return
    const btn=$('deleteTx'); setBusy(btn,true,'Excluindo')
    try {
      const {error}=await supabase.from('transactions').delete().eq('id',t.id)
      if(error) throw error
      close(); toast('Lançamento excluído.','success'); await loadData()
    } catch(err) { showInfo('txEditMessage',humanError(err)); setBusy(btn,false) }
  })
  $('editInternal').addEventListener('change', () => { if ($('editInternal').checked) $('editFlow').value = 'transfer' })
  $('editCategory').addEventListener('change', () => setHidden($('customCategoryFields'), $('editCategory').value !== '__custom__'))

  $('txEditForm').addEventListener('submit', async (e) => {
    e.preventDefault()
    const btn = $('saveTx')
    setBusy(btn, true, 'Salvando')
    showInfo('txEditMessage', '')
    try {
      const metadata = { ...(t.metadata || {}) }
      if (!metadata.source_snapshot && t.transaction_source !== 'manual') {
        metadata.source_snapshot = { description: t.description, transaction_date: t.transaction_date, amount: t.amount, account_id: t.account_id, flow_type: t.flow_type }
      }
      const tags = $('editTags').value.split(',').map((x) => x.trim()).filter(Boolean).slice(0, 12)
      const display = $('editDisplay').value.trim()
      const flow = $('editFlow').value
      const internal = $('editInternal').checked
      const editedAmount=Math.abs(parseMoneyInput($('editAmount').value)||0)
      if(!editedAmount) throw new Error('Informe um valor válido.')
      const signedAmount = flow === 'expense' ? -editedAmount : (flow === 'income' || flow === 'yield') ? editedAmount : (num(t.amount) < 0 ? -editedAmount : editedAmount)
      let categoryId = $('editCategory').value || null
      const accountId = $('editAccount').value
      const isCustomCategory = categoryId === '__custom__'
      if (isCustomCategory) {
        const customName = $('customCategoryName').value.trim()
        const customGroup = $('customCategoryGroup').value || 'Outros'
        if (!customName) throw new Error('Escreva o nome da nova categoria.')
        const kind = flow === 'income' || flow === 'yield' ? 'income' : flow === 'transfer' ? 'transfer' : flow === 'investment' ? 'investment' : 'expense'
        const applySimilar = !!$('customApplySimilar')?.checked
        if (applySimilar) {
          const acc = accountById(accountId) || (accountId === t.account_id ? t.accounts : null)
          const matchField = t.merchant ? 'merchant' : 'description'
          const { data: learned, error: learnError } = await supabase.rpc('create_category_rule_and_reclassify', {
            p_group_name: customGroup, p_category_name: customName, p_kind: kind,
            p_institution: acc?.institution || '', p_match_field: matchField, p_pattern: rulePattern, p_flow_type: internal ? 'transfer' : flow, p_set_internal_transfer: internal
          })
          if (learnError) throw learnError
          categoryId = learned?.category_id || null
        } else {
          let existing = state.categories.find((c) => c.kind === kind && c.name.toLowerCase() === customName.toLowerCase() && c.group_name.toLowerCase() === customGroup.toLowerCase())
          if (existing) categoryId = existing.id
          else {
            const { data: created, error: createError } = await supabase.from('categories').insert({ user_id: state.session.user.id, name: customName, group_name: customGroup, kind, active: true }).select('*').single()
            if (createError) throw createError
            categoryId = created?.id || null
            if (created) state.categories.push(created)
          }
        }
        if (!categoryId) throw new Error('Não foi possível criar a categoria.')
      }
      const { error } = await supabase.from('transactions').update({
        display_description: display || null,
        transaction_date: $('editDate').value,
        amount: signedAmount,
        account_id: accountId,
        category_id: categoryId,
        flow_type: internal ? 'transfer' : flow,
        notes: $('editNotes').value.trim() || null,
        tags,
        include_in_budget: $('editBudget').checked,
        is_internal_transfer: internal,
        review_status: 'reviewed',
        metadata
      }).eq('id', t.id)
      if (error) throw error

      if (!isCustomCategory && $('createRule')?.checked && rulePattern && categoryId) {
        const acc = accountById(accountId) || (accountId === t.account_id ? t.accounts : null)
        const { error: ruleError } = await supabase.from('categorization_rules').insert({
          user_id: state.session.user.id,
          institution: acc?.institution || null,
          match_field: t.merchant ? 'merchant' : 'description',
          pattern: rulePattern,
          category_id: categoryId,
          flow_type: internal ? 'transfer' : flow,
          set_internal_transfer: internal,
          priority: 50,
          active: true
        })
        if (ruleError && ruleError.code !== '23505') throw ruleError
      }
      close()
      toast(isCustomCategory && $('customApplySimilar')?.checked ? 'Categoria criada e aplicada aos lançamentos semelhantes.' : isCustomCategory ? 'Categoria criada apenas para este lançamento.' : 'Transação atualizada.', 'success')
      await Promise.all([loadData(), loadAttentionData(true)])
    } catch (err) {
      showInfo('txEditMessage', humanError(err))
      setBusy(btn, false)
    }
  })
}

function openGroupModal(ids, suggestedName = '') {
  const tx = ids.map((id) => state.transactions.find((t) => t.id === id)).filter(Boolean)
  if (tx.length < 2) return
  const total = tx.reduce((s, t) => s + Math.abs(num(t.amount)), 0)
  const candidate = suggestedName || commonMerchant(tx) || 'Compra com múltiplos pagamentos'
  const currentCategory = tx.find((t) => t.category_id)?.category_id || ''
  const modal = $('modalHost')
  modal.innerHTML = `<div class="modal-backdrop"><form id="groupForm" class="modal">
    <div class="modal-head"><div><span class="eyebrow">AGRUPAR PAGAMENTOS</span><h2>Transformar em uma única compra</h2><div class="modal-sub">Os lançamentos continuam existindo nas contas, mas os relatórios passam a entender que pertencem à mesma compra.</div></div><button id="closeModal" class="icon-button" type="button">×</button></div>
    <div class="payment-box">${tx.map((t) => `<div class="payment-line"><span>${esc(accountById(t.account_id)?.name || t.accounts?.name || 'Conta')} · ${esc(dateFmt.format(parseDate(t.transaction_date)))}</span><strong>${money.format(Math.abs(num(t.amount)))}</strong></div>`).join('')}<div class="payment-line"><strong>Total da compra</strong><strong>${money.format(total)}</strong></div></div>
    <label class="field-label">Nome da compra<input id="groupName" value="${esc(candidate)}"></label>
    <label class="field-label">Categoria principal<select id="groupCategory"><option value="">Sem categoria principal</option>${state.categories.filter((c) => c.kind === 'expense').map((c) => `<option value="${c.id}" ${c.id === currentCategory ? 'selected' : ''}>${esc(c.group_name)} · ${esc(c.name)}</option>`).join('')}</select></label>
    <div id="groupMessage" class="form-message hidden"></div>
    <div class="modal-actions"><span class="muted">Você poderá anexar nota fiscal e detalhar categorias depois.</span><div class="modal-actions-right"><button id="cancelModal" class="button" type="button">Cancelar</button><button id="saveGroup" class="button primary" type="submit">✓ Criar compra</button></div></div>
  </form></div>`
  const close = () => { modal.innerHTML = '' }
  $('closeModal').addEventListener('click', close)
  $('cancelModal').addEventListener('click', close)
  $('groupForm').addEventListener('submit', async (e) => {
    e.preventDefault()
    const btn = $('saveGroup')
    setBusy(btn, true, 'Agrupando')
    try {
      const { error } = await supabase.rpc('group_transactions_into_purchase', {
        p_transaction_ids: ids,
        p_description: $('groupName').value.trim() || null,
        p_primary_category_id: $('groupCategory').value || null
      })
      if (error) throw error
      close()
      state.selectionMode = false
      state.selectedTx.clear()
      toast('Pagamentos agrupados em uma compra.', 'success')
      await loadData()
      navigate('purchases')
    } catch (err) {
      showInfo('groupMessage', humanError(err))
      setBusy(btn, false)
    }
  })
}

function commonMerchant(tx) {
  const names = tx.map((t) => t.merchant || displayDescription(t)).filter(Boolean)
  if (!names.length) return ''
  const key = merchantKey(names[0])
  return names.every((n) => merchantKey(n) === key) ? names[0] : ''
}
function merchantKey(v) {
  const s = String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').replace(/\b(PAG|COMPRA|DEBITO|CREDITO|PIX|LTDA|SA|S A|BRASIL)\b/g, ' ').replace(/\d+/g, ' ').replace(/\s+/g, ' ').trim()
  if (s.includes('ASSAI')) return 'ASSAI'
  if (s.includes('GUANABARA')) return 'GUANABARA'
  if (s.includes('ZONA SUL')) return 'ZONA SUL'
  return s.split(' ').slice(0, 2).join(' ')
}

async function ensurePurchaseForTransaction(t) {
  if (t.purchase_id) return t.purchase_id
  const { data, error } = await supabase.rpc('group_transactions_into_purchase', {
    p_transaction_ids: [t.id],
    p_description: displayDescription(t),
    p_primary_category_id: t.category_id || null
  })
  if (error) throw error
  return data
}

function openSplitModal(transactionId) {
  const t = state.transactions.find((x) => x.id === transactionId)
  if (!t) return
  const modal = $('modalHost')
  const total = t.purchase_id ? num(purchaseById(t.purchase_id)?.total_amount) || Math.abs(num(t.amount)) : Math.abs(num(t.amount))
  let rows = [{ category_id: t.category_id || state.categories.find((c) => c.kind === 'expense')?.id || '', amount: total }]
  if (t.purchase_id) {
    const existing = state.allocations.filter((a) => a.purchase_id === t.purchase_id)
    if (existing.length) rows = existing.map((a) => ({ category_id: a.category_id, amount: num(a.amount) }))
  }
  render()

  function render() {
    const sum = rows.reduce((s, r) => s + num(r.amount), 0)
    const diff = total - sum
    modal.innerHTML = `<div class="modal-backdrop"><form id="splitForm" class="modal">
      <div class="modal-head"><div><span class="eyebrow">DETALHAR COMPRA</span><h2>Dividir ${esc(displayDescription(t))}</h2><div class="modal-sub">O total financeiro continua sendo ${money.format(total)}. Aqui você só melhora a análise por categoria.</div></div><button id="closeModal" class="icon-button" type="button">×</button></div>
      <div class="allocation-list">${rows.map((r, i) => allocationRowHtml(r, i)).join('')}</div>
      <button id="addAllocation" class="button small" type="button">＋ Adicionar categoria</button>
      <div class="allocation-footer"><span>Soma do detalhamento</span><strong class="${Math.abs(diff) <= .01 ? 'ok' : 'bad'}">${money.format(sum)} ${Math.abs(diff) <= .01 ? '✓' : `· faltam ${money.format(diff)}`}</strong></div>
      <div id="splitMessage" class="form-message hidden"></div>
      <div class="modal-actions"><span class="muted">Você pode desligar o detalhamento nos gráficos a qualquer momento.</span><div class="modal-actions-right"><button id="cancelModal" class="button" type="button">Cancelar</button><button id="saveSplit" class="button primary" type="submit" ${Math.abs(diff) <= .01 ? '' : 'disabled'}>✓ Salvar divisão</button></div></div>
    </form></div>`
    $('closeModal').addEventListener('click', () => { modal.innerHTML = '' })
    $('cancelModal').addEventListener('click', () => { modal.innerHTML = '' })
    $('addAllocation').addEventListener('click', () => { rows.push({ category_id: state.categories.find((c) => c.kind === 'expense')?.id || '', amount: 0 }); render() })
    modal.querySelectorAll('[data-allocation-cat]').forEach((el) => el.addEventListener('change', () => { rows[Number(el.dataset.allocationCat)].category_id = el.value }))
    modal.querySelectorAll('[data-allocation-amount]').forEach((el) => el.addEventListener('input', () => { rows[Number(el.dataset.allocationAmount)].amount = parseMoneyInput(el.value) || 0; render() }))
    modal.querySelectorAll('[data-remove-allocation]').forEach((el) => el.addEventListener('click', () => { rows.splice(Number(el.dataset.removeAllocation), 1); render() }))
    $('splitForm').addEventListener('submit', save)
  }

  async function save(e) {
    e.preventDefault()
    const btn = $('saveSplit')
    setBusy(btn, true, 'Salvando')
    try {
      const purchaseId = await ensurePurchaseForTransaction(t)
      const allocations = rows.filter((r) => r.category_id && num(r.amount) > 0).map((r) => ({ category_id: r.category_id, amount: num(r.amount), source: 'manual' }))
      const { error } = await supabase.rpc('save_purchase_allocations', { p_purchase_id: purchaseId, p_allocations: allocations })
      if (error) throw error
      modal.innerHTML = ''
      toast('Detalhamento salvo.', 'success')
      await loadData()
    } catch (err) {
      showInfo('splitMessage', humanError(err))
      setBusy(btn, false)
    }
  }
}
function allocationRowHtml(r, i, totalOverride = null) {
  const categories = state.categories.filter((c) => c.kind === 'expense')
  const amount = Number.isFinite(num(r.amount)) ? num(r.amount) : 0
  return `<div class="allocation-row"><select data-allocation-cat="${i}">${categories.map((c) => `<option value="${c.id}" ${c.id === r.category_id ? 'selected' : ''}>${esc(c.group_name)} · ${esc(c.name)}</option>`).join('')}</select><input data-allocation-amount="${i}" inputmode="decimal" value="${amount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}" aria-label="Valor da categoria"><button data-remove-allocation="${i}" class="icon-button" type="button" aria-label="Remover categoria">×</button></div>`
}

function renderPurchases() {
  const total = state.purchases.reduce((s, p) => s + num(p.total_amount), 0)
  const detailed = state.purchases.filter((p) => p.detail_mode === 'detailed').length
  const benefitFunding = state.transactions.filter((t) => t.purchase_id && (t.accounts?.account_type || accountById(t.account_id)?.account_type) === 'benefit').reduce((s, t) => s + Math.abs(num(t.amount)), 0)
  const suggestions = purchaseSuggestions()
  $('mainArea').innerHTML = `<div class="content-stack">
    <section class="section-header"><div><span class="muted">Camada extra de análise</span><h2>Compras</h2><p>Agrupe várias formas de pagamento e detalhe notas fiscais sem bagunçar o painel principal.</p></div></section>
    <section class="purchase-summary"><article class="mini-stat"><span>Total em compras agrupadas</span><strong>${money.format(total)}</strong></article><article class="mini-stat"><span>Pago com benefício</span><strong>${money.format(benefitFunding)}</strong></article><article class="mini-stat"><span>Compras detalhadas</span><strong>${detailed} de ${state.purchases.length}</strong></article></section>
    <section class="panel"><div class="panel-head"><div><h3>Detalhamento opcional</h3><p>Quando ligado, os gráficos usam a divisão da nota fiscal ou a divisão manual.</p></div><span class="panel-tag ${state.preferences.use_purchase_details ? '' : 'attention'}">${state.preferences.use_purchase_details ? 'Ligado' : 'Desligado'}</span></div><div class="preference-box"><div><strong>Usar detalhamento das compras nos relatórios</strong><p>Ex.: uma compra no Assaí pode ser distribuída entre Alimentação, Limpeza, Higiene e Pet. O total da compra não muda.</p></div><label class="switch"><input id="detailPreference" type="checkbox" ${state.preferences.use_purchase_details ? 'checked' : ''}><span class="switch-track"></span></label></div></section>
    <section class="purchase-layout"><div class="panel">${panelHead('Compras do mês', 'Clique para ver pagamentos, divisão e nota fiscal', `${state.purchases.length} compras`)}<div class="purchase-list">${state.purchases.length ? state.purchases.map(purchaseCard).join('') : empty('Nenhuma compra agrupada ainda. Selecione pagamentos na tela de Transações para criar a primeira.')}</div></div><div class="panel">${panelHead('Sugestões de agrupamento', 'Mesmo estabelecimento, mesma data e contas diferentes', suggestions.length ? `${suggestions.length} sugestão(ões)` : 'Tudo certo')}<div class="suggestion-list">${suggestions.length ? suggestions.map(suggestionCard).join('') : empty('Nenhum par provável encontrado neste mês.')}</div></div></section>
  </div>`

  $('detailPreference').addEventListener('change', updateDetailPreference)
  document.querySelectorAll('[data-open-purchase]').forEach((b) => b.addEventListener('click', () => openPurchaseModal(b.dataset.openPurchase)))
  document.querySelectorAll('[data-accept-suggestion]').forEach((b) => b.addEventListener('click', () => {
    const s = suggestions.find((x) => x.key === b.dataset.acceptSuggestion)
    if (s) openGroupModal(s.ids, s.name)
  }))
  document.querySelectorAll('[data-dismiss-suggestion]').forEach((b) => b.addEventListener('click', () => { state.dismissedSuggestions.add(b.dataset.dismissSuggestion); renderPurchases() }))
}

function purchaseCard(p) {
  const payments = state.transactions.filter((t) => t.purchase_id === p.id)
  const allocs = state.allocations.filter((a) => a.purchase_id === p.id)
  const receipts = state.receipts.filter((r) => r.purchase_id === p.id)
  const benefit = payments.some((t) => (t.accounts?.account_type || accountById(t.account_id)?.account_type) === 'benefit')
  const title = p.description || p.merchant || 'Compra agrupada'
  return `<button class="purchase-card" data-open-purchase="${p.id}" type="button"><div><h4>${esc(title)}</h4><div class="purchase-meta"><span class="meta-chip">${esc(dateFmt.format(parseDate(p.purchase_date)))}</span><span class="meta-chip">${payments.length} pagamento(s)</span>${benefit ? '<span class="meta-chip benefit">Benefício + complemento</span>' : ''}${p.detail_mode === 'detailed' ? `<span class="meta-chip detail">${allocs.length} categorias</span>` : ''}${receipts.length ? '<span class="meta-chip">Nota anexada</span>' : ''}</div><div class="purchase-payments">${payments.slice(0, 3).map((t) => `<div class="purchase-payment"><span>${esc(t.accounts?.name || accountById(t.account_id)?.name || 'Conta')}</span><span>${money.format(Math.abs(num(t.amount)))}</span></div>`).join('')}</div></div><div class="amount">${money.format(num(p.total_amount))}</div></button>`
}
function purchaseSuggestions() {
  const groups = new Map()
  state.transactions.filter((t) => t.flow_type === 'expense' && !t.purchase_id && !t.is_internal_transfer).forEach((t) => {
    const key = merchantKey(t.merchant || displayDescription(t))
    if (!key || key.length < 3) return
    const groupKey = `${t.transaction_date}|${key}`
    if (!groups.has(groupKey)) groups.set(groupKey, [])
    groups.get(groupKey).push(t)
  })
  const out = []
  for (const [key, tx] of groups) {
    if (tx.length < 2 || new Set(tx.map((t) => t.account_id)).size < 2 || state.dismissedSuggestions.has(key)) continue
    const ids = tx.map((t) => t.id)
    const total = tx.reduce((s, t) => s + Math.abs(num(t.amount)), 0)
    out.push({ key, ids, tx, total, name: tx[0].merchant || displayDescription(tx[0]) })
  }
  return out.slice(0, 8)
}
function suggestionCard(s) {
  return `<article class="suggestion-card"><div class="suggestion-card-head"><div><h4>${esc(s.name)}</h4><p>${esc(fullDateFmt.format(parseDate(s.tx[0].transaction_date)))} · possível pagamento dividido</p></div><strong>${money.format(s.total)}</strong></div><div class="suggestion-lines">${s.tx.map((t) => `<div class="suggestion-line"><span>${esc(t.accounts?.name || accountById(t.account_id)?.name || 'Conta')}</span><strong>${money.format(Math.abs(num(t.amount)))}</strong></div>`).join('')}</div><div class="suggestion-actions"><button class="button small" data-dismiss-suggestion="${esc(s.key)}" type="button">Ignorar</button><button class="button primary small" data-accept-suggestion="${esc(s.key)}" type="button">Agrupar</button></div></article>`
}
async function updateDetailPreference() {
  const checked = $('detailPreference').checked
  const preferences = { ...(state.profile?.preferences || {}), use_purchase_details: checked }
  const { error } = await supabase.from('profiles').update({ preferences }).eq('id', state.session.user.id)
  if (error) { toast(humanError(error), 'error'); $('detailPreference').checked = !checked; return }
  state.preferences = preferences
  if (state.profile) state.profile.preferences = preferences
  toast(checked ? 'Detalhamento ligado nos relatórios.' : 'Relatórios voltaram à categoria principal.', 'success')
  renderPurchases()
}

function openPurchaseModal(id, initialTab = 'summary') {
  const p = purchaseById(id)
  if (!p) return
  const modal = $('modalHost')
  let tab = initialTab
  let draftAlloc = state.allocations.filter((a) => a.purchase_id === id).map((a) => ({ category_id: a.category_id, amount: num(a.amount) }))
  if (!draftAlloc.length) draftAlloc = [{ category_id: p.primary_category_id || state.categories.find((c) => c.kind === 'expense')?.id || '', amount: num(p.total_amount) }]
  render()

  function render() {
    const payments = state.transactions.filter((t) => t.purchase_id === id)
    const receipts = state.receipts.filter((r) => r.purchase_id === id)
    const sum = draftAlloc.reduce((s, x) => s + num(x.amount), 0)
    const diff = num(p.total_amount) - sum
    modal.innerHTML = `<div class="modal-backdrop"><div class="modal wide"><div class="modal-head"><div><span class="eyebrow">COMPRA</span><h2>${esc(p.description || p.merchant || 'Compra agrupada')}</h2><div class="modal-sub">${money.format(num(p.total_amount))} · ${esc(fullDateFmt.format(parseDate(p.purchase_date)))}</div></div><button id="closeModal" class="icon-button" type="button">×</button></div><div class="modal-tabs"><button data-purchase-tab="summary" class="${tab === 'summary' ? 'active' : ''}" type="button">Resumo</button><button data-purchase-tab="detail" class="${tab === 'detail' ? 'active' : ''}" type="button">Detalhamento</button><button data-purchase-tab="receipt" class="${tab === 'receipt' ? 'active' : ''}" type="button">Nota fiscal</button></div>
      ${tab === 'summary' ? `<form id="purchaseSummaryForm"><div class="form-grid"><label class="field-label full-span">Nome da compra<input id="purchaseDescription" value="${esc(p.description || '')}" placeholder="Ex.: Compra do mês no Assaí"></label><label class="field-label">Estabelecimento<input id="purchaseMerchant" value="${esc(p.merchant || '')}"></label><label class="field-label">Categoria principal<select id="purchaseCategory"><option value="">Sem categoria</option>${state.categories.filter((c) => c.kind === 'expense').map((c) => `<option value="${c.id}" ${c.id === p.primary_category_id ? 'selected' : ''}>${esc(c.group_name)} · ${esc(c.name)}</option>`).join('')}</select></label><label class="field-label full-span">Observação<textarea id="purchaseNotes">${esc(p.notes || '')}</textarea></label></div><div class="payment-box"><div class="source-box-title">FORMAS DE PAGAMENTO</div>${payments.map((t) => `<div class="payment-line"><span>${esc(t.accounts?.name || accountById(t.account_id)?.name || 'Conta')} · ${esc(displayDescription(t))}</span><strong>${money.format(Math.abs(num(t.amount)))}</strong></div>`).join('')}</div><div id="purchaseMessage" class="form-message hidden"></div><div class="modal-actions"><span class="muted">O total é calculado pelos pagamentos vinculados.</span><div class="modal-actions-right"><button id="openDetail" class="button" type="button">Detalhar categorias</button><button id="savePurchase" class="button primary" type="submit">✓ Salvar</button></div></div></form>` : ''}
      ${tab === 'detail' ? `<div><div class="panel-head"><div><h3>Como esta compra deve aparecer nos gráficos?</h3><p>Distribua o total entre as categorias reais da compra.</p></div><span class="panel-tag">${money.format(num(p.total_amount))}</span></div><div class="allocation-list">${draftAlloc.map((r, i) => allocationRowHtml(r, i)).join('')}</div><button id="addPurchaseAllocation" class="button small" type="button">＋ Adicionar categoria</button><div class="allocation-footer"><span>Soma do detalhamento</span><strong class="${Math.abs(diff) <= .01 ? 'ok' : 'bad'}">${money.format(sum)} ${Math.abs(diff) <= .01 ? '✓' : `· diferença ${money.format(diff)}`}</strong></div><div id="purchaseMessage" class="form-message hidden"></div><div class="modal-actions"><span class="muted">O detalhamento só afeta os gráficos quando a opção estiver ligada.</span><div class="modal-actions-right"><button id="summaryMode" class="button" type="button">Usar só categoria principal</button><button id="savePurchaseDetail" class="button primary" type="button" ${Math.abs(diff) <= .01 ? '' : 'disabled'}>✓ Salvar detalhamento</button></div></div></div>` : ''}
      ${tab === 'receipt' ? `<div><div class="panel-head"><div><h3>Nota fiscal e comprovantes</h3><p>O arquivo fica vinculado à compra, sem aparecer no dashboard principal.</p></div><span class="panel-tag">${receipts.length} anexo(s)</span></div><label class="receipt-zone"><strong>Anexar NFC-e, PDF, XML ou imagem</strong><span>O documento fica guardado de forma privada no Supabase Storage.</span><input id="receiptFile" type="file" accept=".pdf,.xml,text/xml,application/xml,image/jpeg,image/png"></label><div id="receiptMessage" class="form-message hidden"></div><div class="receipt-list">${receipts.length ? receipts.map((r) => `<div class="receipt-item"><div><strong>${esc(r.file_name)}</strong><span>${esc(r.source_type)} · ${r.parse_status === 'pending' ? 'aguardando leitura' : esc(r.parse_status)}</span></div><span>${esc(dateFmt.format(new Date(r.created_at)))}</span></div>`).join('') : '<div class="empty-state"><div class="empty-icon">▧</div><p>Nenhuma nota anexada a esta compra.</p></div>'}</div></div>` : ''}
    </div></div>`
    $('closeModal').addEventListener('click', () => { modal.innerHTML = '' })
    modal.querySelectorAll('[data-purchase-tab]').forEach((b) => b.addEventListener('click', () => { tab = b.dataset.purchaseTab; render() }))

    if (tab === 'summary') {
      $('openDetail').addEventListener('click', () => { tab = 'detail'; render() })
      $('purchaseSummaryForm').addEventListener('submit', async (e) => {
        e.preventDefault(); const btn = $('savePurchase'); setBusy(btn, true, 'Salvando')
        try {
          const { error } = await supabase.from('purchases').update({ description: $('purchaseDescription').value.trim() || null, merchant: $('purchaseMerchant').value.trim() || null, primary_category_id: $('purchaseCategory').value || null, notes: $('purchaseNotes').value.trim() || null }).eq('id', id)
          if (error) throw error
          modal.innerHTML = ''; toast('Compra atualizada.', 'success'); await loadData()
        } catch (err) { showInfo('purchaseMessage', humanError(err)); setBusy(btn, false) }
      })
    }
    if (tab === 'detail') {
      $('addPurchaseAllocation').addEventListener('click', () => { draftAlloc.push({ category_id: state.categories.find((c) => c.kind === 'expense')?.id || '', amount: 0 }); render() })
      modal.querySelectorAll('[data-allocation-cat]').forEach((el) => el.addEventListener('change', () => { draftAlloc[Number(el.dataset.allocationCat)].category_id = el.value }))
      modal.querySelectorAll('[data-allocation-amount]').forEach((el) => el.addEventListener('change', () => { draftAlloc[Number(el.dataset.allocationAmount)].amount = parseMoneyInput(el.value) || 0; render() }))
      modal.querySelectorAll('[data-remove-allocation]').forEach((el) => el.addEventListener('click', () => { draftAlloc.splice(Number(el.dataset.removeAllocation), 1); render() }))
      $('summaryMode').addEventListener('click', async () => {
        const { error } = await supabase.from('purchases').update({ detail_mode: 'summary' }).eq('id', id)
        if (error) { toast(humanError(error), 'error'); return }
        modal.innerHTML = ''; toast('Compra voltou para a categoria principal.', 'success'); await loadData()
      })
      $('savePurchaseDetail').addEventListener('click', async () => {
        const btn = $('savePurchaseDetail'); setBusy(btn, true, 'Salvando')
        try {
          const payload = draftAlloc.filter((x) => x.category_id && num(x.amount) > 0).map((x) => ({ category_id: x.category_id, amount: num(x.amount), source: 'manual' }))
          const { error } = await supabase.rpc('save_purchase_allocations', { p_purchase_id: id, p_allocations: payload })
          if (error) throw error
          modal.innerHTML = ''; toast('Detalhamento da compra salvo.', 'success'); await loadData()
        } catch (err) { showInfo('purchaseMessage', humanError(err)); setBusy(btn, false) }
      })
    }
    if (tab === 'receipt') {
      $('receiptFile').addEventListener('change', async () => {
        const file = $('receiptFile').files?.[0]
        if (!file) return
        const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
        const path = `${state.session.user.id}/receipts/${id}/${Date.now()}-${safe}`
        showInfo('receiptMessage', 'Enviando arquivo...')
        try {
          const { error: uploadError } = await supabase.storage.from('finance-files').upload(path, file, { upsert: false, contentType: file.type || undefined })
          if (uploadError) throw uploadError
          const ext = file.name.toLowerCase().split('.').pop()
          const sourceType = ext === 'xml' ? 'xml' : ext === 'pdf' ? 'pdf' : ['jpg', 'jpeg', 'png'].includes(ext) ? 'image' : 'upload'
          const { error } = await supabase.from('purchase_receipts').insert({ user_id: state.session.user.id, purchase_id: id, storage_path: path, file_name: file.name, mime_type: file.type || null, source_type: sourceType, parse_status: 'pending' })
          if (error) throw error
          toast('Nota fiscal anexada.', 'success')
          await loadData()
          const updated = purchaseById(id)
          if (updated) openPurchaseModal(id, 'receipt')
        } catch (err) { showInfo('receiptMessage', humanError(err)) }
      })
    }
  }
}

function defaultImportState(kind = 'bank') {
  return { step: 1, kind, files: [], rows: [], message: '', filter: 'all', result: null }
}
function bankImportAccounts() {
  return state.accounts.filter((a) => !['benefit', 'virtual', 'savings', 'investment'].includes(a.account_type))
}
function benefitAccount() { return state.accounts.find((a) => a.account_type === 'benefit') }
function sourceLabel(account) {
  if (!account) return 'Origem não identificada'
  const inst = account.institution === 'inter' ? 'Inter' : account.institution === 'mercado_pago' ? 'Mercado Pago' : account.institution.replaceAll('_', ' ')
  const type = account.account_type === 'checking' ? 'Conta Corrente' : account.account_type === 'credit_card' ? 'Cartão' : account.account_type === 'wallet' ? 'Saldo' : accountTypeLabel(account.account_type)
  return `${inst} · ${type}`
}
function detectImportSource(text, file) {
  const sample = String(text || '').slice(0, 40000)
  const upper = sample.toUpperCase()
  const ext = (file?.name || '').toLowerCase().split('.').pop()
  if (ext === 'ofx' && /<OFX>/i.test(sample) && (/BANCO INTERMEDIUM/i.test(sample) || /<FID>0?77\b/i.test(sample) || /<BANKID>0?77\b/i.test(sample))) {
    return { institution: 'inter', accountType: 'checking', profile: 'inter_ofx', label: 'Inter · Conta Corrente', confidence: 'alta' }
  }
  if (/DATA LANÇAMENTO;DESCRIÇÃO;VALOR;SALDO/.test(upper) || (/EXTRATO CONTA CORRENTE/.test(upper) && /DATA LANÇAMENTO;/.test(upper))) {
    return { institution: 'inter', accountType: 'checking', profile: 'inter_checking_csv', label: 'Inter · Conta Corrente', confidence: 'alta' }
  }
  if (/"?DATA"?,"?LANÇAMENTO"?,"?CATEGORIA"?,"?TIPO"?,"?VALOR"?/.test(upper)) {
    return { institution: 'inter', accountType: 'credit_card', profile: 'inter_card_csv', label: 'Inter · Cartão', confidence: 'alta' }
  }
  return null
}
function findAccountForDetection(detected) {
  if (!detected) return null
  return state.accounts.find((a) => a.institution === detected.institution && a.account_type === detected.accountType) || null
}
function importFileId(file) {
  return `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2, 8)}`
}
async function makeImportFileEntry(file) {
  const entry = {
    id: importFileId(file), file, fileText: '', detected: null, accountId: '', manualSource: false,
    status: 'reading', message: '', rows: [], profile: '', result: null
  }
  try {
    entry.fileText = await file.text()
    entry.detected = detectImportSource(entry.fileText, file)
    const account = findAccountForDetection(entry.detected)
    if (account) entry.accountId = account.id
    entry.status = entry.detected && account ? 'ready' : 'needs_source'
    if (!entry.detected) entry.message = 'Origem ainda não reconhecida.'
  } catch {
    entry.status = 'error'
    entry.message = 'Não foi possível ler o arquivo.'
  }
  return entry
}
async function addImportFiles(fileList) {
  const imp = state.import
  const files = [...(fileList || [])]
  if (!files.length) return
  const accepted = files.filter((f) => /\.(csv|ofx)$/i.test(f.name))
  const rejected = files.length - accepted.length
  if (rejected) imp.message = `${rejected} arquivo(s) ignorado(s). Use OFX ou CSV para extratos.`
  const newEntries = []
  for (const file of accepted) newEntries.push(await makeImportFileEntry(file))
  const existingKeys = new Set(imp.files.map((x) => `${x.file.name}|${x.file.size}|${x.file.lastModified}`))
  for (const entry of newEntries) {
    const key = `${entry.file.name}|${entry.file.size}|${entry.file.lastModified}`
    if (!existingKeys.has(key)) { imp.files.push(entry); existingKeys.add(key) }
  }
  renderImport()
}
function removeImportFile(id) {
  const imp = state.import
  imp.files = imp.files.filter((x) => x.id !== id)
  imp.rows = imp.rows.filter((x) => x.fileId !== id)
  renderImport()
}
function renderImportKindPicker(imp) {
  return `<section class="import-kind-picker"><div class="import-kind-heading"><span class="eyebrow">ADICIONAR DADOS</span><h2>O que você quer registrar?</h2><p>Escolha só o tipo de informação. A conta específica é identificada automaticamente quando possível.</p></div><div class="import-kind-grid">
    <button class="import-kind-card ${imp.kind === 'bank' ? 'active' : ''}" data-import-kind="bank" type="button"><span class="import-kind-icon">▦</span><strong>Banco ou cartão</strong><small>Envie vários OFX/CSV de uma vez.</small><b>Extratos →</b></button>
    <button class="import-kind-card ${imp.kind === 'benefit' ? 'active' : ''}" data-import-kind="benefit" type="button"><span class="import-kind-icon benefit">◉</span><strong>Cartão alimentação</strong><small>Benefício recebido e compras do cartão.</small><b>Benefício →</b></button>
    <button class="import-kind-card ${imp.kind === 'third_party' ? 'active' : ''}" data-import-kind="third_party" type="button"><span class="import-kind-icon third">⌂</span><strong>Pagamento por terceiro</strong><small>Ex.: aluguel pago antes do dinheiro entrar.</small><b>Registrar →</b></button>
    <button class="import-kind-card ${imp.kind === 'document' ? 'active' : ''}" data-import-kind="document" type="button"><span class="import-kind-icon document">▧</span><strong>Comprovante ou print</strong><small>PDF, JPG ou PNG. Cofrinho, benefício e comprovantes.</small><b>Ler documento →</b></button>
  </div></section>`
}
function bindImportKindPicker() {
  document.querySelectorAll('[data-import-kind]').forEach((b) => b.addEventListener('click', () => {
    const nextKind = b.dataset.importKind
    if (state.import?.kind === nextKind) return
    state.import = defaultImportState(nextKind)
    renderImport()
  }))
}

function defaultDocumentState() {
  return { files: [], hint: 'auto', message: '', progress: '' }
}
function defaultDocumentEntry(file, hint = 'auto') {
  return { id: `doc-${Date.now()}-${Math.random().toString(36).slice(2,8)}`, file, hint, status: 'idle', message: '', progress: '', text: '', detectedType: '', rows: [], balance: null, benchmark: null }
}
function addDocumentFiles(fileList) {
  const imp=state.import; imp.document ??= defaultDocumentState(); const doc=imp.document
  const files=[…22857 tokens truncated…Position').value);const {error}=await supabase.rpc('record_investment_income',{p_date:$('incomeDate').value,p_amount:amount,p_account_id:pos.account_id,p_position_id:pos.id,p_notes:$('incomeNotes').value.trim()||null});if(error)throw error;close();toast('Rendimento registrado.','success');await loadData()}catch(err){showInfo('incomeMessage',humanError(err));setBusy(btn,false)}})
}
function openInvestmentValuationModal(positionId) {
  const p=state.investmentPositions.find((x)=>x.id===positionId);if(!p)return
  const modal=$('modalHost')
  modal.innerHTML=`<div class="modal-backdrop"><form id="valuationForm" class="modal"><div class="modal-head"><div><span class="eyebrow">ATUALIZAR POSIÇÃO</span><h2>${esc(p.name)}</h2><div class="modal-sub">Salvamos um retrato para construir a evolução do patrimônio ao longo do tempo.</div></div><button id="closeModal" class="icon-button" type="button">×</button></div><div class="form-grid"><label class="field-label">Data<input id="valuationDate" type="date" value="${new Date().toISOString().slice(0,10)}"></label><label class="field-label">Valor atual<input id="valuationValue" inputmode="decimal" value="${num(p.current_value).toLocaleString('pt-BR',{minimumFractionDigits:2})}"></label></div><div id="valuationMessage" class="form-message hidden"></div><div class="modal-actions"><span>Principal registrado: ${money.format(num(p.invested_amount))}</span><div class="modal-actions-right"><button id="cancelModal" class="button" type="button">Cancelar</button><button id="saveValuation" class="button primary" type="submit">✓ Atualizar</button></div></div></form></div>`
  const close=()=>{modal.innerHTML=''};$('closeModal').addEventListener('click',close);$('cancelModal').addEventListener('click',close)
  $('valuationForm').addEventListener('submit',async(e)=>{e.preventDefault();const btn=$('saveValuation');setBusy(btn,true,'Atualizando');try{const value=parseMoneyInput($('valuationValue').value);if(!Number.isFinite(value)||value<0)throw new Error('Informe um valor válido.');const date=$('valuationDate').value;const [{error:e1},{error:e2}]=await Promise.all([supabase.from('investment_positions').update({current_value:value}).eq('id',p.id),supabase.from('investment_snapshots').upsert({user_id:state.session.user.id,position_id:p.id,snapshot_date:date,invested_principal:num(p.invested_amount),market_value:value},{onConflict:'position_id,snapshot_date'})]);if(e1||e2)throw e1||e2;close();toast('Valor da posição atualizado.','success');await loadData()}catch(err){showInfo('valuationMessage',humanError(err));setBusy(btn,false)}})
}

function renderAccounts() {
  const activity = (id) => state.transactions.filter((t) => t.account_id === id).reduce((s, t) => s + num(t.amount), 0)
  const liquidTotal = state.accounts.filter((a) => !['credit_card','virtual'].includes(a.account_type)).reduce((sum,a)=>{ const b=accountBalanceLabel(a); return sum+(b.value==null?0:b.value) },0)
  $('mainArea').innerHTML = `<div class="content-stack"><section class="section-header"><div><span class="muted">Posição financeira atual</span><h2>Contas e saldos</h2><p>Os saldos atravessam os meses. O movimento mensal continua separado para mostrar apenas o que aconteceu no período.</p></div><div class="section-actions"><button id="addAccount" class="button primary" type="button">＋ Adicionar conta</button></div></section><section class="accounts-summary-strip"><div><span>Saldos conhecidos</span><strong>${money.format(liquidTotal)}</strong><small>Contas, benefícios e reservas com saldo confirmado</small></div><div><span>Investimentos</span><strong>${money.format(state.investmentPositions.reduce((sum,p)=>sum+num(p.current_value),0))}</strong><small>Valor atual das posições</small></div></section><section class="accounts-grid">${state.accounts.map((a) => { const bal=accountBalanceLabel(a); const balanceText=bal.value==null?'—':money.format(bal.value); const dateText=bal.date?`Confirmado em ${fullDateFmt.format(parseDate(bal.date))}`:'Sem saldo confirmado'; return `<button class="account-card" data-edit-account="${a.id}" type="button"><div class="account-card-top">${accountIcon(a)}<span class="panel-tag ${a.account_type === 'benefit' ? 'benefit' : ''}">${esc(accountTypeLabel(a.account_type))}</span></div><span class="institution">${esc(a.institution.replaceAll('_', ' '))}</span><h3>${esc(a.name)}</h3><div class="account-current-balance"><span>${a.account_type==='credit_card'?'Saldo / fatura atual':'Saldo atual'}</span><strong>${balanceText}</strong><small>${esc(dateText)}</small></div><div class="account-activity"><span>Movimento em ${esc(monthFmt.format(parseDate(`${state.month}-01`)))}</span><strong>${money.format(activity(a.id))}</strong></div><div class="account-footer"><span>${a.account_type === 'benefit' ? 'Benefício separado da renda' : a.include_in_net_worth ? 'Inclui no patrimônio' : 'Conta de controle'}</span><span>Editar →</span></div></button>` }).join('')}</section></div>`
  $('addAccount').addEventListener('click', () => openAccountModal())
  document.querySelectorAll('[data-edit-account]').forEach((b) => b.addEventListener('click', () => openAccountModal(b.dataset.editAccount)))
}
function accountTypeLabel(type) { return ({ checking: 'Conta corrente', credit_card: 'Cartão', wallet: 'Carteira', savings: 'Reserva', investment: 'Investimento', virtual: 'Controle', benefit: 'Benefício' })[type] || type }
function openAccountModal(id = null) {
  const a = id ? accountById(id) : null
  const balance = a ? balanceByAccountId(a.id) : null
  const modal = $('modalHost')
  modal.innerHTML = `<div class="modal-backdrop"><form id="accountForm" class="modal"><div class="modal-head"><div><span class="eyebrow">${a ? 'EDITAR CONTA' : 'NOVA CONTA'}</span><h2>${a ? esc(a.name) : 'Adicionar fonte financeira'}</h2><div class="modal-sub">O saldo atual é independente do mês selecionado e pode ser atualizado automaticamente por extratos ou manualmente aqui.</div></div><button id="closeModal" class="icon-button" type="button">×</button></div><div class="form-grid"><label class="field-label full-span">Nome<input id="accountName" value="${esc(a?.name || '')}" placeholder="Ex.: Cartão Alimentação"></label><label class="field-label">Instituição<input id="accountInstitution" value="${esc(a?.institution || '')}" placeholder="Ex.: inter"></label><label class="field-label">Tipo<select id="accountType"><option value="checking">Conta corrente</option><option value="credit_card">Cartão de crédito</option><option value="wallet">Carteira</option><option value="savings">Reserva / poupança</option><option value="investment">Investimento</option><option value="benefit">Benefício</option><option value="virtual">Conta de controle</option></select></label><label class="field-label">Saldo atual<input id="accountBalance" inputmode="decimal" value="${balance?.current_balance==null?'':num(balance.current_balance).toLocaleString('pt-BR',{minimumFractionDigits:2})}" placeholder="0,00"></label><label class="field-label">Data do saldo<input id="accountBalanceDate" type="date" value="${esc(balance?.balance_date || new Date().toISOString().slice(0,10))}"></label></div><div class="toggle-row"><div><strong>Incluir no patrimônio</strong><p>Benefícios e contas de controle normalmente ficam fora do patrimônio.</p></div><label class="switch"><input id="accountNetWorth" type="checkbox" ${a ? (a.include_in_net_worth ? 'checked' : '') : 'checked'}><span class="switch-track"></span></label></div><div id="accountMessage" class="form-message hidden"></div><div class="modal-actions"><span class="muted">Se deixar o saldo vazio, apenas os dados da conta serão alterados.</span><div class="modal-actions-right"><button id="cancelModal" class="button" type="button">Cancelar</button><button id="saveAccount" class="button primary" type="submit">✓ Salvar</button></div></div></form></div>`
  $('accountType').value = a?.account_type || 'checking'
  const close = () => { modal.innerHTML = '' }
  $('closeModal').addEventListener('click', close); $('cancelModal').addEventListener('click', close)
  $('accountType').addEventListener('change', () => { if (['benefit', 'virtual'].includes($('accountType').value)) $('accountNetWorth').checked = false })
  $('accountForm').addEventListener('submit', async (e) => {
    e.preventDefault(); const btn = $('saveAccount'); setBusy(btn, true, 'Salvando')
    try {
      const payload = { name: $('accountName').value.trim(), institution: $('accountInstitution').value.trim().toLowerCase().replace(/\s+/g, '_') || 'manual', account_type: $('accountType').value, include_in_net_worth: $('accountNetWorth').checked }
      if (!payload.name) throw new Error('Informe um nome para a conta.')
      let accountId=a?.id || null
      if(a){ const {error}=await supabase.from('accounts').update(payload).eq('id',a.id); if(error)throw error }
      else { const {data,error}=await supabase.from('accounts').insert({ ...payload, user_id: state.session.user.id, currency: 'BRL', active: true }).select('id').single(); if(error)throw error; accountId=data.id }
      const balanceText=$('accountBalance').value.trim()
      if(balanceText){ const value=parseMoneyInput(balanceText); if(!Number.isFinite(value))throw new Error('Informe um saldo válido.'); const date=$('accountBalanceDate').value||new Date().toISOString().slice(0,10); const {error}=await supabase.from('account_balance_snapshots').upsert({user_id:state.session.user.id,account_id:accountId,balance:value,balance_date:date,source:'manual',is_confirmed:true,metadata:{updated_from:'account_editor'}},{onConflict:'account_id,balance_date,source'}); if(error)throw error }
      close(); toast(a ? 'Conta e saldo atualizados.' : 'Conta adicionada.', 'success'); await loadData()
    } catch (err) { showInfo('accountMessage', humanError(err)); setBusy(btn, false) }
  })
}

function openBudgetModal() {
  const modal = $('modalHost')
  modal.innerHTML = `<div class="modal-backdrop"><form id="budgetForm" class="modal"><div class="modal-head"><div><span class="eyebrow">ORÇAMENTO MENSAL</span><h2>${esc(monthFmt.format(parseDate(`${state.month}-01`)))}</h2><div class="modal-sub">Defina um limite de gastos para comparar orçamento e realizado.</div></div><button id="closeModal" class="icon-button" type="button">×</button></div><label class="field-label">Limite total de gastos<input id="budgetAmount" inputmode="decimal" value="${state.budget ? num(state.budget.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : ''}" placeholder="0,00"></label><div id="budgetMessage" class="form-message hidden"></div><div class="modal-actions"><span class="muted">Pode ser alterado a qualquer momento.</span><div class="modal-actions-right"><button id="cancelModal" class="button" type="button">Cancelar</button><button id="saveBudget" class="button primary" type="submit">✓ Salvar orçamento</button></div></div></form></div>`
  const close = () => { modal.innerHTML = '' }
  $('closeModal').addEventListener('click', close); $('cancelModal').addEventListener('click', close)
  $('budgetForm').addEventListener('submit', async (e) => {
    e.preventDefault(); const amount = parseMoneyInput($('budgetAmount').value); const btn = $('saveBudget')
    if (!Number.isFinite(amount) || amount < 0) { showInfo('budgetMessage', 'Informe um valor válido.'); return }
    setBusy(btn, true, 'Salvando')
    try {
      let error
      if (state.budget) ({ error } = await supabase.from('budgets').update({ amount }).eq('id', state.budget.id))
      else ({ error } = await supabase.from('budgets').insert({ user_id: state.session.user.id, month: `${state.month}-01`, category_id: null, amount }))
      if (error) throw error
      close(); toast('Orçamento atualizado.', 'success'); await loadData()
    } catch (err) { showInfo('budgetMessage', humanError(err)); setBusy(btn, false) }
  })
}

function openEntryModal(options = {}) {
  const modal = $('modalHost')
  let mode = options.mode || 'expense'
  const initialAccountId = options.accountId || ''
  const initialDescription = options.description || ''
  render()
  function render() {
    const cats = state.categories.filter((c) => mode === 'income' ? c.kind === 'income' : c.kind === 'expense')
    const availableAccounts = mode === 'third_party' ? [] : state.accounts
    modal.innerHTML = `<div class="modal-backdrop"><form id="entryForm" class="modal"><div class="modal-head"><div><span class="eyebrow">NOVO LANÇAMENTO</span><h2>Registrar movimentação</h2></div><button id="closeModal" class="icon-button" type="button">×</button></div><div class="modal-tabs"><button data-entry-mode="expense" class="${mode === 'expense' ? 'active' : ''}" type="button">Despesa</button><button data-entry-mode="income" class="${mode === 'income' ? 'active' : ''}" type="button">Receita</button><button data-entry-mode="third_party" class="${mode === 'third_party' ? 'active' : ''}" type="button">Pago por terceiro</button></div><div class="form-grid"><label class="field-label">Data<input id="entryDate" type="date" value="${new Date().toISOString().slice(0, 10)}" required></label><label class="field-label">Valor<input id="entryAmount" inputmode="decimal" placeholder="0,00" required></label><label class="field-label full-span">Descrição<input id="entryDescription" value="${esc(initialDescription)}" placeholder="${mode === 'third_party' ? 'Ex.: Aluguel + condomínio' : 'Ex.: supermercado'}"></label>${mode !== 'third_party' ? `<label class="field-label">Conta<select id="entryAccount">${availableAccounts.map((a) => `<option value="${a.id}" ${a.id === initialAccountId ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select></label>` : ''}<label class="field-label">Categoria<select id="entryCategory">${cats.map((c) => `<option value="${c.id}">${esc(c.group_name)} · ${esc(c.name)}</option>`).join('')}</select></label><label class="field-label full-span">Observação<textarea id="entryNotes" placeholder="Opcional"></textarea></label></div>${mode === 'third_party' ? '<div class="third-party-note"><span>⌂</span><span>Esse gasto entra na sua vida financeira real, mas não altera o saldo do Inter, Mercado Pago ou outra conta bancária.</span></div>' : ''}<div id="entryMessage" class="form-message hidden"></div><div class="modal-actions"><span></span><div class="modal-actions-right"><button id="cancelModal" class="button" type="button">Cancelar</button><button id="saveEntry" class="button primary" type="submit">✓ Salvar</button></div></div></form></div>`
    $('closeModal').addEventListener('click', close); $('cancelModal').addEventListener('click', close)
    modal.querySelectorAll('[data-entry-mode]').forEach((b) => b.addEventListener('click', () => { mode = b.dataset.entryMode; render() }))
    $('entryForm').addEventListener('submit', save)
  }
  function close() { modal.innerHTML = '' }
  async function save(e) {
    e.preventDefault()
    const amount = parseMoneyInput($('entryAmount').value)
    if (!Number.isFinite(amount) || amount <= 0) { showInfo('entryMessage', 'Informe um valor válido.'); return }
    const btn = $('saveEntry'); setBusy(btn, true, 'Salvando')
    try {
      const date = $('entryDate').value, description = $('entryDescription').value.trim() || 'Lançamento manual', category = $('entryCategory').value, notes = $('entryNotes').value.trim() || null
      if (mode === 'third_party') {
        const { error } = await supabase.rpc('record_third_party_expense', { p_date: date, p_amount: amount, p_description: description, p_category_id: category, p_notes: notes })
        if (error) throw error
      } else {
        const { error } = await supabase.from('transactions').insert({ user_id: state.session.user.id, account_id: $('entryAccount').value, category_id: category, transaction_date: date, description, display_description: null, amount: mode === 'expense' ? -amount : amount, flow_type: mode, is_internal_transfer: false, include_in_budget: mode === 'expense', transaction_source: 'manual', review_status: 'reviewed', tags: [], notes })
        if (error) throw error
      }
      close(); toast('Lançamento salvo.', 'success'); await loadData()
    } catch (err) { showInfo('entryMessage', humanError(err)); setBusy(btn, false) }
  }
}

function openPasswordResetModal() {
  if (!state.session) return
  const modal = $('modalHost')
  modal.innerHTML = `<div class="modal-backdrop"><form id="passwordForm" class="modal"><div class="modal-head"><div><span class="eyebrow">NOVA SENHA</span><h2>Definir uma nova senha</h2><div class="modal-sub">O link de recuperação foi validado.</div></div></div><label class="field-label">Nova senha<input id="newPassword" type="password" minlength="8" required></label><label class="field-label">Confirmar senha<input id="confirmPassword" type="password" minlength="8" required></label><div id="passwordMessage" class="form-message hidden"></div><div class="modal-actions"><span></span><div class="modal-actions-right"><button id="savePassword" class="button primary" type="submit">✓ Atualizar senha</button></div></div></form></div>`
  $('passwordForm').addEventListener('submit', async (e) => {
    e.preventDefault(); const p = $('newPassword').value, c = $('confirmPassword').value
    if (p.length < 8) { showInfo('passwordMessage', 'Use pelo menos 8 caracteres.'); return }
    if (p !== c) { showInfo('passwordMessage', 'As senhas não coincidem.'); return }
    const btn = $('savePassword'); setBusy(btn, true, 'Atualizando')
    const { error } = await supabase.auth.updateUser({ password: p })
    if (error) { showInfo('passwordMessage', humanError(error)); setBusy(btn, false); return }
    modal.innerHTML = ''; toast('Senha atualizada.', 'success')
  })
}


async function loadJarvisData(force = false) {
  if (!state.session || state.jarvis.loading || (state.jarvis.loaded && !force)) return
  state.jarvis.loading = true
  if (['jarvis','home','agenda','tasks','notes','projects','files'].includes(state.view)) renderMain()
  try {
    const [messages, annotations, notes, tasks, projects, actions, connections] = await Promise.all([
      supabase.from('jarvis_messages').select('*').order('created_at', { ascending: false }).limit(80),
      supabase.from('financial_annotations').select('*', { count: 'exact' }).order('created_at', { ascending: false }).limit(100),
      domainList(supabase, 'note'),
      domainList(supabase, 'task'),
      domainList(supabase, 'project'),
      supabase.from('jarvis_actions').select('*', { count: 'exact' }).order('created_at', { ascending: false }).limit(100),
      supabase.from('jarvis_connections').select('*').order('updated_at', { ascending: false }).limit(12)
    ])
    const err = messages.error || annotations.error || actions.error || connections.error
    if (err) throw err
    state.jarvis.messages = (messages.data || []).reverse()
    state.jarvis.annotations = dedupeJarvisAnnotations(annotations.data || [])
    state.jarvis.notes = notes
    state.jarvis.tasks = tasks
    state.jarvis.projects = projects
    state.jarvis.actions = dedupeJarvisActions(actions.data || [])
    state.jarvis.counts = {
      annotations: annotations.count ?? state.jarvis.annotations.length,
      notes: state.jarvis.notes.length,
      tasks: state.jarvis.tasks.length,
      projects: state.jarvis.projects.length,
      actions: actions.count ?? state.jarvis.actions.length
    }
    state.jarvis.connections = connections.data || []
    state.jarvis.error = null
    state.jarvis.loaded = true
  } catch (err) {
    console.error('Falha ao carregar dados do Jarvis:', err)
    state.jarvis.error = humanError(err)
    state.jarvis.loaded = true
    toast(state.jarvis.error, 'error')
  } finally {
    state.jarvis.loading = false
    if (['jarvis','home','agenda','tasks','notes','projects','files'].includes(state.view)) renderMain()
  }
}


function jarvisIntentLabel(intent) {
  return ({ financial: 'Financeiro', note: 'Nota', reminder: 'Lembrete', calendar: 'Agenda', project: 'Projeto', query: 'Consulta', conversation: 'Conversa', unknown: 'Indefinido' })[intent] || 'Mensagem'
}

function jarvisCreatedSummary() {
  const pending = state.jarvis.annotations.filter((x) => x.reconciliation_status === 'pending').length
  const tasks = state.jarvis.tasks.filter((x) => x.status === 'open').length
  const actions = state.jarvis.actions.filter((x) => x.status === 'proposed').length
  return [
    ['Contextos financeiros', pending, 'Aguardando conciliação com extratos'],
    ['Notas e ideias', state.jarvis.notes.length, 'Memória estruturada do Jarvis'],
    ['Lembretes', tasks, 'Em aberto'],
    ['Arquivos', state.files.loaded ? state.files.count : 0, 'Metadados sincronizados do Google Drive'],
    ['Ações para confirmar', actions, 'Agenda e ações externas']
  ]
}

function jarvisGoogleConnection() {
  return state.jarvis.connections.find((x) => x.provider === 'google_calendar' && x.status === 'connected') || null
}

function jarvisDriveConnection() {
  return state.jarvis.connections.find((x) => x.provider === 'google_drive' && x.status === 'connected') || null
}

function formatJarvisEvent(payload = {}) {
  const start = payload.starts_at ? new Date(payload.starts_at) : null
  const end = payload.ends_at ? new Date(payload.ends_at) : null
  const date = start ? new Intl.DateTimeFormat('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' }).format(start) : 'Data pendente'
  const time = start ? new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(start) : '--:--'
  const endTime = end ? new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(end) : null
  return `${date} · ${time}${endTime ? `–${endTime}` : ''}`
}

function calendarActionBatchId(action) {
  return action?.batch_id || action?.payload?.batch_id || action?.id || ''
}

function groupCalendarActions(actions = []) {
  const groups = new Map()
  for (const action of actions) {
    const batchId = calendarActionBatchId(action)
    if (!groups.has(batchId)) groups.set(batchId, [])
    groups.get(batchId).push(action)
  }
  return [...groups.entries()].map(([batchId, items]) => ({
    batchId,
    items: items.sort((a, b) => Number(a.batch_index ?? 0) - Number(b.batch_index ?? 0)),
  }))
}

function calendarActionGroupsMarkup(actions = [], google = null) {
  return groupCalendarActions(actions).map(({ batchId, items }) => {
    const failed = items.filter((item) => item.status === 'failed').length
    const label = items.length === 1 ? '1 compromisso' : `${items.length} compromissos`
    return `<section class="calendar-batch-card"><div class="calendar-batch-head"><strong>${esc(label)}</strong><small>${failed ? `${failed} com falha · retry seguro` : 'Aguardando confirmação'}</small></div><div class="calendar-batch-events">${items.map((item) => `<article><div><strong>${esc(item.payload?.title || 'Evento')}</strong><span>${esc(formatJarvisEvent(item.payload))}</span>${item.payload?.duration_defaulted ? '<small>Duração padrão: 1 hora</small>' : ''}${item.error_message ? `<small>${esc(item.error_message)}</small>` : ''}</div></article>`).join('')}</div><div class="calendar-batch-actions"><button class="button small" type="button" data-jarvis-calendar-cancel-batch="${esc(batchId)}">Cancelar lote</button><button class="button primary small" type="button" data-jarvis-calendar-batch="${esc(batchId)}" ${google ? '' : 'disabled'}>Confirmar ${items.length > 1 ? 'lote' : ''}</button></div></section>`
  }).join('')
}

async function connectJarvisGoogleCalendar() {
  const btn = $('jarvisGoogleConnect')
  setBusy(btn, true, 'Abrindo Google')
  try {
    const { data, error } = await supabase.functions.invoke('jarvis-google-oauth', { body: {} })
    if (error) throw error
    if (data?.error) throw new Error(data.error)
    if (!data?.authorization_url) throw new Error('O Google não retornou a tela de autorização.')
    location.href = data.authorization_url
  } catch (err) {
    toast(humanError(err), 'error')
    setBusy(btn, false)
  }
}

async function executeJarvisCalendarBatch(batchId, operation = 'execute') {
  const selector = operation === 'cancel'
    ? `[data-jarvis-calendar-cancel-batch="${batchId}"]`
    : `[data-jarvis-calendar-batch="${batchId}"]`
  const btn = document.querySelector(selector)
  if (operation === 'cancel' && !confirm('Cancelar todas as propostas ainda não executadas deste lote?')) return
  setBusy(btn, true, operation === 'cancel' ? 'Cancelando' : 'Agendando')
  try {
    const { data, error } = await supabase.functions.invoke('jarvis-calendar', {
      body: { batch_id: batchId, operation, explicit_confirmation: true }
    })
    if (error) throw error
    if (data?.error) throw new Error(data.error)
    const summary = data?.summary || {}
    if (operation === 'cancel') {
      toast(`${summary.cancelled || 0} proposta(s) cancelada(s).`, 'success')
    } else if (summary.failed || summary.in_progress) {
      toast(`Lote processado: ${summary.executed || 0} criado(s), ${summary.failed || 0} falhou(aram), ${summary.in_progress || 0} em processamento.`, 'error')
    } else {
      toast(`${summary.executed || 0} evento(s) criado(s) no Google Calendar.`, 'success')
    }
    await Promise.all([loadJarvisData(true), loadCalendarData(true)])
  } catch (err) {
    toast(humanError(err), 'error')
    setBusy(btn, false)
  }
}

function bindCalendarBatchActions() {
  document.querySelectorAll('[data-jarvis-calendar-batch]').forEach((button) => button.addEventListener('click', () => executeJarvisCalendarBatch(button.dataset.jarvisCalendarBatch)))
  document.querySelectorAll('[data-jarvis-calendar-cancel-batch]').forEach((button) => button.addEventListener('click', () => executeJarvisCalendarBatch(button.dataset.jarvisCalendarCancelBatch, 'cancel')))
}

async function loadWhatsAppIdentity() {
  if (!state.session || state.jarvis.whatsapp.loading || state.jarvis.whatsapp.loaded) return
  state.jarvis.whatsapp.loading = true
  try {
    const { data, error } = await supabase.functions.invoke('jarvis-whatsapp-identity', { body: { action: 'status' } })
    if (error) throw error
    state.jarvis.whatsapp.paired = Boolean(data?.paired)
    state.jarvis.whatsapp.identity = data?.identity || null
    state.jarvis.whatsapp.loaded = true
  } catch (_) {
    state.jarvis.whatsapp.loaded = true
  } finally {
    state.jarvis.whatsapp.loading = false
    if (state.view === 'jarvis') renderJarvis()
  }
}

async function startWhatsAppPairing() {
  const button = $('jarvisWhatsAppPair')
  setBusy(button, true, 'Gerando')
  try {
    const { data, error } = await supabase.functions.invoke('jarvis-whatsapp-identity', {
      body: { action: 'start', explicit: true }
    })
    if (error) throw error
    if (data?.error) throw new Error(data.error)
    state.jarvis.whatsapp.pairing = data
    renderJarvis()
  } catch (err) {
    toast(humanError(err), 'error')
    setBusy(button, false)
  }
}

function jarvisDateTime(value, options = {}) {
  if (!value) return 'Sem data definida'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return 'Sem data definida'
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
    ...options
  }).format(d)
}

function jarvisProjectName(project) {
  return project?.name || 'Projeto sem nome'
}

function jarvisTaskTime(task) {
  return task?.due_at || null
}

function isSameLocalDay(a, b = new Date()) {
  if (!a) return false
  const d = new Date(a)
  return d.getFullYear() === b.getFullYear() && d.getMonth() === b.getMonth() && d.getDate() === b.getDate()
}

function personalLoading() {
  return `<div class="personal-loading"><span class="spinner"></span><span>Sincronizando seu ambiente pessoal...</span></div>`
}

function bindPersonalNav() {
  document.querySelectorAll('[data-personal-nav]').forEach((b) => b.addEventListener('click', () => navigate(b.dataset.personalNav)))
}

const JARVIS_VISUAL_LABELS = {
  idle: 'Jarvis online',
  listening: 'Ouvindo você',
  thinking: 'Pensando',
  speaking: 'Respondendo',
  attention: 'Aguardando confirmação'
}

function jarvisPresenceMarkup(visualState = 'idle', variant = 'default') {
  const safeState = JARVIS_VISUAL_LABELS[visualState] ? visualState : 'idle'
  return `<div class="jarvis-presence ${variant === 'hero' ? 'hero-presence' : ''} jarvis-state-${safeState}" data-jarvis-presence data-jarvis-visual-state="${safeState}">
    <div class="jarvis-presence-orbit orbit-a"></div><div class="jarvis-presence-orbit orbit-b"></div><div class="jarvis-presence-scan"></div>
    <div class="jarvis-presence-avatar"><img src="./jarvis-avatar.png" alt="Jarvis, assistente pessoal"></div>
    <div class="jarvis-audio-wave" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div>
    <div class="jarvis-presence-status"><span></span><b data-jarvis-state-label>${esc(JARVIS_VISUAL_LABELS[safeState])}</b></div>
  </div>`
}

function setJarvisVisualState(next = 'idle', holdMs = 0) {
  const safe = JARVIS_VISUAL_LABELS[next] ? next : 'idle'
  document.querySelectorAll('[data-jarvis-presence]').forEach((el) => {
    Object.keys(JARVIS_VISUAL_LABELS).forEach((stateName) => el.classList.remove(`jarvis-state-${stateName}`))
    el.classList.add(`jarvis-state-${safe}`)
    el.dataset.jarvisVisualState = safe
    const label = el.querySelector('[data-jarvis-state-label]')
    if (label) label.textContent = JARVIS_VISUAL_LABELS[safe]
  })
  if (holdMs > 0) {
    clearTimeout(window.__jarvisVisualTimer)
    window.__jarvisVisualTimer = setTimeout(() => {
      const hasPending = state.jarvis.actions.some((x) => x.status === 'proposed')
      setJarvisVisualState(hasPending ? 'attention' : 'idle')
    }, holdMs)
  }
}

const JARVIS_TIMEZONE = 'America/Sao_Paulo'

async function invokeJarvisEngine(message, source = 'panel_jarvis') {
  return supabase.functions.invoke('jarvis-core', {
    body: {
      message,
      channel: 'web',
      source,
      external_message_id: `web:${crypto.randomUUID()}`,
    }
  })
}

async function sendJarvisQuick(message, button = null) {
  const text = String(message || '').trim()
  if (!text) return false
  setBusy(button, true, 'Enviando')
  setJarvisVisualState('thinking')
  try {
    const { data, error } = await invokeJarvisEngine(text, `panel_${state.view}`)
    if (error) throw error
    if (data?.error) throw new Error(data.error)
    state.jarvis.engine = data?.engine || state.jarvis.engine
    await loadJarvisData(true)
    if (data?.confirmation_required) { toast('Ação preparada e aguardando sua confirmação.', 'success'); setJarvisVisualState('attention') }
    else { toast('Jarvis atualizou seu ambiente.', 'success'); setJarvisVisualState('speaking', 1400) }
    return true
  } catch (err) {
    toast(humanError(err), 'error')
    setJarvisVisualState('idle')
    setBusy(button, false)
    return false
  }
}

function zonedDateKey(value = new Date()) {
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: JARVIS_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d)
  const get = (type) => parts.find((p) => p.type === type)?.value || ''
  return `${get('year')}-${get('month')}-${get('day')}`
}

function addDateKeyDays(key, days) {
  const [y,m,d] = String(key).split('-').map(Number)
  if (!y || !m || !d) return ''
  return new Date(Date.UTC(y, m - 1, d + days, 12)).toISOString().slice(0,10)
}

function calendarEventDateKey(event) {
  if (event?.all_day && /^\d{4}-\d{2}-\d{2}$/.test(String(event?.start || ''))) return String(event.start)
  return zonedDateKey(event?.start)
}

function calendarEventStartDate(event) {
  if (!event?.start) return null
  if (event.all_day && /^\d{4}-\d{2}-\d{2}$/.test(String(event.start))) {
    const [y,m,d] = event.start.split('-').map(Number)
    return new Date(Date.UTC(y, m - 1, d, 12))
  }
  const date = new Date(event.start)
  return Number.isNaN(date.getTime()) ? null : date
}

function calendarEventTimeLabel(event) {
  if (event?.all_day) return 'Dia inteiro'
  const date = calendarEventStartDate(event)
  if (!date) return '--:--'
  return new Intl.DateTimeFormat('pt-BR', { timeZone: JARVIS_TIMEZONE, hour: '2-digit', minute: '2-digit' }).format(date)
}

function calendarEventDateLabel(event) {
  const date = calendarEventStartDate(event)
  if (!date) return '--'
  return new Intl.DateTimeFormat('pt-BR', { timeZone: JARVIS_TIMEZONE, day: '2-digit', month: 'short' }).format(date)
}

function calendarEventDayLabel(event) {
  const date = calendarEventStartDate(event)
  if (!date) return '--'
  return new Intl.DateTimeFormat('pt-BR', { timeZone: JARVIS_TIMEZONE, day: '2-digit' }).format(date)
}

function calendarEventMonthLabel(event) {
  const date = calendarEventStartDate(event)
  if (!date) return ''
  return new Intl.DateTimeFormat('pt-BR', { timeZone: JARVIS_TIMEZONE, month: 'short' }).format(date)
}

function dedupeCalendarEvents(items = []) {
  const seen = new Set(), out = []
  for (const event of items) {
    const key = `${event?.id || ''}|${event?.start || ''}`
    if (!event?.id || seen.has(key)) continue
    seen.add(key)
    out.push(event)
  }
  return out.sort((a,b) => (calendarEventStartDate(a)?.getTime() || 0) - (calendarEventStartDate(b)?.getTime() || 0))
}

function groupCalendarEvents(items = []) {
  const today = zonedDateKey()
  const tomorrow = addDateKeyDays(today, 1)
  const afterTomorrow = addDateKeyDays(today, 2)
  return {
    today: items.filter((event) => calendarEventDateKey(event) === today),
    tomorrow: items.filter((event) => calendarEventDateKey(event) === tomorrow),
    upcoming: items.filter((event) => calendarEventDateKey(event) >= afterTomorrow).slice(0,8)
  }
}

async function loadCalendarData(force = false) {
  if (!state.session || state.calendar.loading || (state.calendar.loaded && !force)) return
  if (!state.jarvis.loaded) {
    if (!state.jarvis.loading) loadJarvisData()
    return
  }
  const google = jarvisGoogleConnection()
  if (!google) {
    state.calendar = { events: [], loading: false, loaded: true, error: null, connected: false, syncedAt: null, displayName: null }
    if (['home','agenda'].includes(state.view)) renderMain()
    return
  }
  state.calendar.loading = true
  state.calendar.error = null
  state.calendar.connected = true
  if (['home','agenda'].includes(state.view)) renderMain()
  try {
    const { data, error } = await supabase.functions.invoke('jarvis-calendar-read', { body: { days: 14 } })
    if (error) {
      let details = null
      try { details = await error.context?.json?.() } catch (_) {}
      throw new Error(details?.error || error.message || 'Falha ao ler o Google Calendar.')
    }
    if (data?.error) throw new Error(data.error)
    state.calendar.events = dedupeCalendarEvents(data?.events || [])
    state.calendar.connected = data?.connected !== false
    state.calendar.syncedAt = data?.synced_at || new Date().toISOString()
    state.calendar.displayName = data?.display_name || google.display_name || null
    state.calendar.loaded = true
  } catch (err) {
    state.calendar.events = []
    state.calendar.error = humanError(err)
    state.calendar.connected = true
    state.calendar.loaded = true
  } finally {
    state.calendar.loading = false
    if (['home','agenda'].includes(state.view)) renderMain()
  }
}

function calendarSourceLabel(event) {
  return event?.location ? `Google Calendar · ${event.location}` : 'Google Calendar'
}

function homeAgendaGroup(title, events, emptyText) {
  return `<div class="home-agenda-group"><div class="home-agenda-group-head"><strong>${esc(title)}</strong><span>${events.length}</span></div><div class="home-agenda-items">${events.length ? events.slice(0,3).map((event) => `<article class="home-agenda-item"><span class="home-time">${esc(calendarEventTimeLabel(event))}</span><div><strong>${esc(event.title || 'Compromisso')}</strong><small>${esc(calendarSourceLabel(event))}</small></div></article>`).join('') : `<div class="home-agenda-empty">${esc(emptyText)}</div>`}</div></div>`
}

function renderHome() {
  if (!state.jarvis.loaded && !state.jarvis.loading) loadJarvisData()
  if (!state.files.loaded && !state.files.loading) loadFilesData()
  if (state.jarvis.loaded && !state.calendar.loaded && !state.calendar.loading) loadCalendarData()
  if (!state.attention.loaded && !state.attention.loading) loadAttentionData()
  const name = personalDisplayName()
  const now = new Date()
  const localHour = Number(new Intl.DateTimeFormat('en-US',{timeZone:JARVIS_TIMEZONE,hour:'2-digit',hourCycle:'h23'}).format(now))
  const greeting = localHour < 12 ? 'Bom dia' : localHour < 18 ? 'Boa tarde' : 'Boa noite'
  const proposedActions = state.jarvis.actions.filter((x) => x.action_type === 'calendar_create' && x.status === 'proposed')
  const calendarGroups = groupCalendarEvents(state.calendar.events)
  const todayEvents = calendarGroups.today
  const latestNotes = state.jarvis.notes.slice(0,3)
  const allActiveProjects = state.jarvis.projects.filter((x) => ['active','paused'].includes(String(x.status || '').toLowerCase()))
  const activeProjects = allActiveProjects.slice(0,3)
  const tx = visibleTransactions()
  const totals = calcTotals(tx)
  const reviewCount = state.transactions.filter((t) => ['auto','needs_review'].includes(t.review_status)).length
  const cashBalance = state.accounts.filter((a) => !['credit_card','virtual'].includes(a.account_type)).reduce((sum,a) => sum + (accountBalanceLabel(a).value || 0), 0)
  const google = jarvisGoogleConnection()
  const drive = jarvisDriveConnection()
  const attentionItems = state.attention.items || []
  const focusSummary = state.attention.summary || 'Consolidando seu ambiente pessoal.'
  const attentionBody = state.attention.loading && !state.attention.loaded
    ? '<div class="attention-empty"><span class="spinner"></span><p><strong>Consolidando sinais reais...</strong><small>Verificando pendências financeiras.</small></p></div>'
    : attentionItems.length
      ? `<div class="attention-list">${attentionItems.slice(0,6).map((entry) => `<button type="button" class="attention-item urgency-${esc(entry.urgency)}" data-personal-nav="${esc(entry.navigate)}"><span class="attention-signal"></span><p><strong>${esc(entry.title)}</strong><small>${esc(entry.detail)}</small></p><b class="attention-urgency">${esc(ATTENTION_URGENCY_LABELS[entry.urgency] || 'Média')}</b></button>`).join('')}</div>`
      : '<div class="attention-empty attention-clear"><span>✓</span><p><strong>Nada exige ação agora.</strong><small>Nenhum sinal real ultrapassou os critérios de atenção.</small></p></div>'
  const attentionWarning = state.attention.error
    ? `<div class="attention-data-warning">Não consegui verificar todas as transações para revisão: ${esc(state.attention.error)}</div>`
    : ''
  const calendarBody = !google
    ? '<div class="calendar-state-card"><strong>Google Calendar não conectado.</strong><span>Conecte sua agenda para trazer compromissos reais para a Home.</span></div>'
    : state.calendar.loading && !state.calendar.loaded
      ? '<div class="calendar-state-card"><span class="spinner"></span><span>Lendo Google Calendar...</span></div>'
      : state.calendar.error
        ? `<div class="calendar-state-card error"><strong>Não consegui ler o Calendar agora.</strong><span>${esc(state.calendar.error)}</span><button id="homeCalendarRetry" class="button small" type="button">Tentar novamente</button></div>`
        : `<div class="home-agenda-groups">${homeAgendaGroup('Hoje', calendarGroups.today, 'Nenhum compromisso hoje.')}${homeAgendaGroup('Amanhã', calendarGroups.tomorrow, 'Agenda livre amanhã.')}${homeAgendaGroup('Próximos dias', calendarGroups.upcoming, 'Nenhum compromisso nos próximos dias.')}</div>`
  const proposals = proposedActions.length ? `<div class="home-agenda-proposals"><div class="home-agenda-group-head"><strong>Aguardando confirmação</strong><span>${proposedActions.length}</span></div>${proposedActions.slice(0,2).map((a) => `<article class="home-agenda-item proposed"><span class="home-time">${a.payload?.starts_at ? esc(new Intl.DateTimeFormat('pt-BR',{timeZone:JARVIS_TIMEZONE,hour:'2-digit',minute:'2-digit'}).format(new Date(a.payload.starts_at))) : '•'}</span><div><strong>${esc(a.payload?.title || 'Ação de agenda')}</strong><small>Jarvis · aguardando confirmação</small></div></article>`).join('')}</div>` : ''

  $('mainArea').innerHTML = `<div class="content-stack personal-home">
    <section class="personal-hero personal-hero-with-jarvis">
      <div class="personal-hero-copy"><span class="eyebrow">${esc(new Intl.DateTimeFormat('pt-BR',{timeZone:JARVIS_TIMEZONE,weekday:'long',day:'2-digit',month:'long'}).format(now).toUpperCase())}</span><h2>${esc(greeting)}, ${esc(name)}.</h2><p>${esc(focusSummary)}</p><div class="hero-actions"><button class="button primary personal-hero-cta" data-personal-nav="jarvis" type="button">Falar com Jarvis</button><button id="homeRefresh" class="button personal-hero-refresh" type="button">Atualizar</button></div></div>
      <div class="personal-hero-ai">${jarvisPresenceMarkup(proposedActions.length ? 'attention' : 'idle', 'hero')}<small>${proposedActions.length ? `${proposedActions.length} ação${proposedActions.length > 1 ? 'ões' : ''} esperando você` : 'Pronto para ajudar'}</small></div>
    </section>

    ${state.jarvis.loading && !state.jarvis.loaded ? personalLoading() : ''}

    <section class="home-focus-grid home-focus-grid-agenda">
      <article class="home-focus-card today-card real-agenda-card">
        <div class="home-card-head"><div><span class="eyebrow">AGENDA REAL</span><h3>Hoje, amanhã e próximos dias</h3></div><button data-personal-nav="agenda" type="button">Ver agenda →</button></div>
        ${calendarBody}
        ${proposals}
      </article>

      <article class="home-focus-card attention-card">
        <div class="home-card-head"><div><span class="eyebrow">JARVIS</span><h3>Requer atenção</h3></div><button data-personal-nav="jarvis" type="button">Abrir →</button></div>
        ${attentionBody}
        ${attentionWarning}
      </article>
    </section>

    <section class="home-module-grid">
      <article class="home-module-card finance-module">
        <div class="home-card-head"><div><span class="eyebrow">FINANÇAS</span><h3>${money.format(totals.expense)}</h3></div><button data-personal-nav="overview" type="button">Abrir →</button></div>
        <p>Gasto real em ${esc(monthFmt.format(parseDate(`${state.month}-01`)))}.</p>
        <div class="mini-stats"><span><b>${money.format(cashBalance)}</b><small>Saldos rastreados</small></span><span><b>${reviewCount}</b><small>Para revisar</small></span></div>
      </article>
      <article class="home-module-card">
        <div class="home-card-head"><div><span class="eyebrow">PROJETOS</span><h3>${allActiveProjects.length}</h3></div><button data-personal-nav="projects" type="button">Abrir →</button></div>
        <p>${activeProjects.length ? activeProjects.map(jarvisProjectName).slice(0,2).map(esc).join(' · ') : 'Seus próximos planos podem nascer em uma conversa com o Jarvis.'}</p>
      </article>
      <article class="home-module-card">
        <div class="home-card-head"><div><span class="eyebrow">NOTAS & IDEIAS</span><h3>${state.jarvis.notes.length}</h3></div><button data-personal-nav="notes" type="button">Abrir →</button></div>
        <p>${latestNotes[0] ? esc(latestNotes[0].title || latestNotes[0].content || 'Última nota') : 'Ideias, referências e memórias ficam organizadas aqui.'}</p>
      </article>
    </section>

    <section class="panel home-integrations-panel">
      <div class="panel-head"><div><span class="eyebrow">INTEGRAÇÕES</span><h2>Seu ecossistema</h2><p>O Jarvis conecta serviços sem transformar cada integração em um aplicativo separado.</p></div></div>
      <div class="integration-strip">
        <div class="integration-tile ${google ? 'connected' : ''}"><span class="integration-logo">31</span><div><strong>Google Calendar</strong><small>${google ? (state.calendar.error ? 'Conectado · leitura com erro' : 'Conectado · leitura real') : 'Não conectado'}</small></div><i>${google && !state.calendar.error ? '✓' : google ? '!' : '○'}</i></div>
        <div class="integration-tile configuring"><span class="integration-logo">WA</span><div><strong>WhatsApp</strong><small>Aguardando número de produção</small></div><i>…</i></div>
        <div class="integration-tile ${drive ? 'connected' : 'future'}"><span class="integration-logo">D</span><div><strong>Google Drive</strong><small>${drive ? (state.files.integrationError ? 'Conectado · metadados indisponíveis' : `${state.files.count} metadados no Jarvis`) : 'Não conectado'}</small></div><i>${drive && !state.files.integrationError ? '✓' : drive ? '!' : '○'}</i></div>
        <div class="integration-tile future"><span class="integration-logo">⌖</span><div><strong>Maps / Places</strong><small>Planejado</small></div><i>＋</i></div>
        <div class="integration-tile future"><span class="integration-logo">AI</span><div><strong>Document AI</strong><small>Planejado</small></div><i>＋</i></div>
      </div>
    </section>
  </div>`
  bindPersonalNav()
  $('homeCalendarRetry')?.addEventListener('click', () => loadCalendarData(true))
  $('homeRefresh')?.addEventListener('click', async () => {
    const btn = $('homeRefresh')
    setBusy(btn, true, 'Atualizando')
    try {
      await Promise.all([loadData(), loadJarvisData(true), loadCalendarData(true), loadAttentionData(true), loadFilesData(true)])
      toast(state.calendar.error ? 'Home atualizada. O Calendar segue indisponível.' : 'Home atualizada.', state.calendar.error ? 'error' : 'success')
    } finally { setBusy(btn, false) }
  })
}

function renderAgenda() {
  if (!state.jarvis.loaded && !state.jarvis.loading) { loadJarvisData(); $('mainArea').innerHTML = personalLoading(); return }
  if (state.jarvis.loaded && !state.calendar.loaded && !state.calendar.loading) loadCalendarData()
  const google = jarvisGoogleConnection()
  const pending = state.jarvis.actions.filter((x) => x.action_type === 'calendar_create' && ['proposed','failed'].includes(x.status)).sort((a,b) => new Date(a.payload?.starts_at || a.created_at) - new Date(b.payload?.starts_at || b.created_at))
  const events = state.calendar.events.slice(0,12)
  const calendarPanel = !google
    ? '<div class="personal-empty"><strong>Google Calendar não conectado.</strong><span>Conecte sua agenda para ver compromissos reais aqui.</span></div>'
    : state.calendar.loading && !state.calendar.loaded
      ? personalLoading()
      : state.calendar.error
        ? `<div class="calendar-state-card error"><strong>Leitura do Calendar indisponível.</strong><span>${esc(state.calendar.error)}</span><button id="agendaCalendarRetry" class="button small" type="button">Tentar novamente</button></div>`
        : events.length
          ? events.map((event) => `<article><div class="agenda-date"><strong>${esc(calendarEventDayLabel(event))}</strong><span>${esc(calendarEventMonthLabel(event))}</span></div><div><strong>${esc(event.title || 'Compromisso')}</strong><span>${esc(calendarEventTimeLabel(event))}${event.location ? ` · ${esc(event.location)}` : ''}</span><small>Google Calendar</small></div>${event.html_link ? `<a href="${esc(event.html_link)}" target="_blank" rel="noopener">Abrir ↗</a>` : ''}</article>`).join('')
          : '<div class="personal-empty"><strong>Nenhum compromisso nos próximos 14 dias.</strong><span>A leitura está conectada ao Google Calendar.</span></div>'
  $('mainArea').innerHTML = `<div class="content-stack personal-section">
    <section class="section-intro"><div><span class="eyebrow">AGENDA</span><h2>Tempo com contexto.</h2><p>Compromissos reais do Google Calendar e propostas do Jarvis em camadas separadas.</p></div><button id="agendaAskJarvis" class="button primary" type="button">✦ Criar compromisso</button></section>
    <section class="personal-two-col">
      <div class="panel">
        <div class="panel-head"><div><h2>Google Calendar</h2><p>Leitura real, somente leitura, em ${esc(JARVIS_TIMEZONE)}.</p></div>${state.calendar.syncedAt ? `<span class="panel-tag">Sincronizado</span>` : ''}</div>
        <div class="agenda-list">${calendarPanel}</div>
      </div>
      <aside class="personal-side-stack">
        <section class="panel integration-card-large ${google ? 'connected' : ''}"><span class="integration-logo big">31</span><div><span class="eyebrow">GOOGLE CALENDAR</span><h3>${google ? 'Conectado' : 'Não conectado'}</h3><p>${google ? esc(state.calendar.displayName || google.display_name || 'Agenda principal') : 'Autorize sua agenda para ler e executar compromissos.'}</p></div>${google ? '<span class="connection-ok">✓</span>' : '<button id="agendaGoogleConnect" class="button small" type="button">Conectar</button>'}</section>
        <section class="panel"><div class="panel-head"><div><h2>Aguardando confirmação</h2><p>Propostas do Jarvis não são eventos reais até você confirmar.</p></div></div><div class="pending-action-list">${pending.length ? calendarActionGroupsMarkup(pending, google) : '<div class="personal-empty compact"><span>Nenhuma ação pendente.</span></div>'}</div></section>
      </aside>
    </section>
  </div>`
  $('agendaAskJarvis')?.addEventListener('click', () => navigate('jarvis'))
  $('agendaGoogleConnect')?.addEventListener('click', connectJarvisGoogleCalendar)
  $('agendaCalendarRetry')?.addEventListener('click', () => loadCalendarData(true))
  bindCalendarBatchActions()
}

function domainProjectName(id) {
  return state.jarvis.projects.find((project) => project.id === id)?.name || 'Sem projeto'
}

function domainProjectOptions(selected = '') {
  return `<option value="">Sem projeto</option>${state.jarvis.projects.map((project) => `<option value="${esc(project.id)}" ${project.id === selected ? 'selected' : ''}>${esc(project.name)} · ${esc(PROJECT_STATUS_LABELS[project.status] || project.status)}</option>`).join('')}`
}

function domainDateInput(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function domainDateToIso(value) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) throw new Error('Informe uma data e horário válidos.')
  return date.toISOString()
}

function domainWhen(value, fallback = 'Sem prazo') {
  return value ? jarvisDateTime(value) : fallback
}

function domainTechnicalDetails(record) {
  if (!record) return ''
  return `<details class="domain-tech"><summary>Detalhes técnicos</summary><div><span>Origem</span><strong>${esc(SOURCE_LABELS[record.source] || record.source || 'Não informada')}</strong></div><div><span>ID</span><code>${esc(record.id || '')}</code></div><div><span>Criado</span><strong>${esc(domainWhen(record.created_at, ''))}</strong></div><div><span>Atualizado</span><strong>${esc(domainWhen(record.updated_at, ''))}</strong></div></details>`
}

async function refreshDomainRecords(message = '') {
  state.jarvis.loaded = false
  await loadJarvisData(true)
  if (message) toast(message, 'success')
}

async function performDomainWrite(button, callback, successMessage) {
  if (button) setBusy(button, true, 'Salvando')
  try {
    await callback()
    $('modalHost').innerHTML = ''
    await refreshDomainRecords(successMessage)
    return true
  } catch (err) {
    toast(humanError(err), 'error')
    if (button) setBusy(button, false)
    return false
  }
}

function taskStatusChip(task) {
  return `<span class="domain-chip status ${esc(task.status)}">${esc(TASK_STATUS_LABELS[task.status] || task.status)}</span>`
}
function taskPriorityChip(task) {
  return `<span class="domain-chip priority ${esc(task.priority)}">${esc(TASK_PRIORITY_LABELS[task.priority] || task.priority)}</span>`
}
function projectStatusChip(project) {
  return `<span class="domain-chip status ${esc(project.status)}">${esc(PROJECT_STATUS_LABELS[project.status] || project.status)}</span>`
}
function noteTypeChip(note) {
  return `<span class="domain-chip note ${esc(note.note_type)}">${esc(NOTE_TYPE_LABELS[note.note_type] || note.note_type)}</span>`
}


async function loadFilesData(force = false) {
  if (!state.session || state.files.loading || (state.files.loaded && !force)) return
  state.files.loading = true
  state.files.error = null
  state.files.integrationError = null
  if (['files','projects','jarvis','home'].includes(state.view)) renderMain()
  try {
    const all = []
    let offset = 0
    let count = 0
    let pages = 0
    do {
      const page = await fileList(supabase, { limit: 200, offset })
      all.push(...page.items)
      count = page.count
      offset += page.items.length
      pages += 1
      if (!page.items.length) break
    } while (offset < count && pages < 25)
    state.files.items = all
    state.files.count = count
    state.files.truncated = all.length < count
    state.files.loaded = true
    try {
      const status = await fileStatus(supabase)
      state.files.connected = status?.connected === true
      state.files.displayName = status?.display_name || null
    } catch (err) {
      state.files.connected = false
      state.files.integrationError = humanError(err)
    }
  } catch (err) {
    state.files.items = []
    state.files.count = 0
    state.files.error = humanError(err)
    state.files.loaded = true
  } finally {
    state.files.loading = false
    if (['files','projects','jarvis','home'].includes(state.view)) renderMain()
  }
}

function fileProjectName(file) {
  return file?.project_id ? domainProjectName(file.project_id) : 'Sem projeto'
}

function fileProjectOptions(selected = '') {
  return `<option value="">Sem projeto</option>${state.jarvis.projects.map((project) => `<option value="${esc(project.id)}" ${project.id === selected ? 'selected' : ''}>${esc(project.name)}</option>`).join('')}`
}

function fileTechnicalDetails(file) {
  if (!file) return ''
  const metadata = file.metadata && Object.keys(file.metadata).length ? `<div><span>Metadata</span><code>${esc(JSON.stringify(file.metadata))}</code></div>` : ''
  return `<details class="domain-tech file-tech"><summary>Detalhes técnicos</summary><div><span>Provedor</span><strong>Google Drive</strong></div><div><span>ID no provedor</span><code>${esc(file.provider_file_id || '')}</code></div><div><span>MIME type</span><code>${esc(file.mime_type || '')}</code></div><div><span>ID local</span><code>${esc(file.id || '')}</code></div><div><span>Origem</span><strong>${esc(SOURCE_LABELS[file.source] || file.source || 'Importado')}</strong></div><div><span>Criado</span><strong>${esc(domainWhen(file.created_at, ''))}</strong></div><div><span>Atualizado</span><strong>${esc(domainWhen(file.updated_at, ''))}</strong></div>${metadata}</details>`
}

async function refreshFiles(message = '') {
  state.files.loaded = false
  await loadFilesData(true)
  if (message) toast(message, 'success')
}

async function syncFilesExplicit(button) {
  setBusy(button, true, 'Atualizando')
  try {
    const result = await fileSync(supabase)
    await refreshFiles()
    toast(`${result.synced || 0} arquivo(s) sincronizado(s) · ${result.removed || 0} metadado(s) removido(s).`, 'success')
  } catch (err) {
    state.files.integrationError = humanError(err)
    toast(state.files.integrationError, 'error')
  } finally { setBusy(button, false) }
}

function openFileDetail(id) {
  const file = state.files.items.find((item) => item.id === id)
  if (!file) return
  const modal = $('modalHost')
  modal.innerHTML = `<div class="modal-backdrop"><div class="modal wide domain-modal file-modal"><div class="modal-head"><div><span class="eyebrow">GOOGLE DRIVE</span><h2>${esc(file.name)}</h2><div class="domain-card-chips"><span class="domain-chip note">${esc(fileTypeLabel(file))}</span>${file.project_id ? `<span class="domain-chip project">${esc(fileProjectName(file))}</span>` : ''}</div></div><button id="closeModal" class="icon-button" type="button">×</button></div><div class="file-detail-grid"><div><span>Modificado no Drive</span><strong>${esc(domainWhen(file.modified_at_provider, 'Não informado'))}</strong></div><div><span>Tamanho</span><strong>${esc(fileSizeLabel(file.size_bytes))}</strong></div><div><span>Origem</span><strong>Google Drive</strong></div></div><label class="field-label">Projeto relacionado<select id="fileProjectSelect">${fileProjectOptions(file.project_id || '')}</select></label><p class="muted file-link-copy">O vínculo altera somente o contexto no Jarvis. O arquivo continua pertencendo ao Google Drive.</p>${fileTechnicalDetails(file)}<div class="modal-actions"><span>${file.web_view_link ? `<a class="button" href="${esc(file.web_view_link)}" target="_blank" rel="noopener noreferrer">Abrir no Drive ↗</a>` : ''}</span><div class="modal-actions-right"><button id="fileDetailClose" class="button" type="button">Fechar</button><button id="fileProjectSave" class="button primary" type="button">Salvar vínculo</button></div></div></div></div>`
  const close = () => { modal.innerHTML = '' }
  $('closeModal').addEventListener('click', close)
  $('fileDetailClose').addEventListener('click', close)
  $('fileProjectSave').addEventListener('click', async () => {
    const btn = $('fileProjectSave')
    const projectId = $('fileProjectSelect').value || null
    setBusy(btn, true, 'Salvando')
    try {
      if (projectId) await fileLinkProject(supabase, file.id, projectId)
      else await fileUnlinkProject(supabase, file.id)
      close()
      await refreshFiles(projectId ? 'Arquivo vinculado ao projeto.' : 'Arquivo desvinculado do projeto.')
    } catch (err) {
      toast(humanError(err), 'error')
      setBusy(btn, false)
    }
  })
}

function renderFiles() {
  if (!state.jarvis.loaded && !state.jarvis.loading) loadJarvisData()
  if (!state.files.loaded && !state.files.loading) loadFilesData()
  if ((!state.jarvis.loaded && state.jarvis.loading) || (!state.files.loaded && state.files.loading)) {
    $('mainArea').innerHTML = `<div class="content-stack personal-section">${personalLoading()}<div class="skeleton-block h340"></div></div>`
    return
  }
  const filters = state.files.filters
  const files = state.files.items.filter((file) => matchesFileFilters(file, filters))
  const integrationWarning = state.files.integrationError ? `<div class="error-banner file-inline-error"><span>Google Drive indisponível agora: ${esc(state.files.integrationError)}. Os metadados já sincronizados continuam acessíveis.</span></div>` : ''
  const listError = state.files.error ? `<div class="error-banner file-inline-error"><span>${esc(state.files.error)}</span><button id="filesRetry" type="button">Tentar novamente</button></div>` : ''
  const empty = state.files.items.length === 0
    ? `<div class="personal-empty panel file-empty"><strong>Nenhum arquivo sincronizado ainda.</strong><span>A tela abriu em modo somente leitura. Clique em “Atualizar arquivos” para importar somente os metadados do seu Google Drive.</span></div>`
    : `<div class="personal-empty panel file-empty"><strong>Nenhum arquivo corresponde aos filtros.</strong><span>Ajuste a busca, o tipo ou o projeto.</span></div>`
  $('mainArea').innerHTML = `<div class="content-stack personal-section domain-section files-section">${integrationWarning}${listError}<section class="section-intro domain-intro"><div><span class="eyebrow">ARQUIVOS</span><h2>Seu Drive, com contexto do Jarvis.</h2><p>${state.files.count} arquivo${state.files.count === 1 ? '' : 's'} conhecido${state.files.count === 1 ? '' : 's'} pelo Jarvis. O Google Drive continua sendo a fonte real; aqui ficam apenas metadados e vínculos.</p></div><button id="filesSync" class="button primary" type="button">↻ Atualizar arquivos</button></section><section class="panel domain-toolbar files-toolbar"><label class="domain-search">Buscar<input id="fileFilterQ" type="search" value="${esc(filters.q)}" placeholder="Nome do arquivo"></label><label>Tipo<select id="fileFilterType">${Object.entries(FILE_TYPE_LABELS).map(([value,label]) => `<option value="${value}" ${filters.type === value ? 'selected' : ''}>${esc(label)}</option>`).join('')}</select></label><label>Projeto<select id="fileFilterProject"><option value="all" ${filters.project === 'all' ? 'selected' : ''}>Todos</option><option value="none" ${filters.project === 'none' ? 'selected' : ''}>Sem projeto</option>${state.jarvis.projects.map((project) => `<option value="${esc(project.id)}" ${filters.project === project.id ? 'selected' : ''}>${esc(project.name)}</option>`).join('')}</select></label><div class="file-toolbar-status"><span class="mini-status-dot"></span><strong>${state.files.connected === false ? 'Drive com erro' : 'Google Drive conectado'}</strong><small>${esc(state.files.displayName || 'metadata.readonly')}</small></div></section>${state.files.truncated ? '<div class="form-message">A visualização local está limitada aos primeiros 5.000 registros. A API continua paginada.</div>' : ''}<section class="files-list">${files.length ? files.map((file) => `<article class="file-row"><div class="file-kind ${esc(fileIcon(file).toLowerCase())}">${esc(fileIcon(file))}</div><div class="file-main"><strong title="${esc(file.name)}">${esc(file.name)}</strong><span>${esc(fileTypeLabel(file))} · modificado ${esc(domainWhen(file.modified_at_provider, 'sem data'))}</span></div><div class="file-project"><small>Projeto</small><strong>${esc(fileProjectName(file))}</strong></div><div class="file-origin"><small>Origem</small><strong>Google Drive</strong></div><div class="file-actions">${file.web_view_link ? `<a class="button small" href="${esc(file.web_view_link)}" target="_blank" rel="noopener noreferrer">Abrir ↗</a>` : ''}<button class="button small" data-file-detail="${esc(file.id)}" type="button">Detalhes</button></div></article>`).join('') : empty}</section></div>`
  $('filesSync')?.addEventListener('click', () => syncFilesExplicit($('filesSync')))
  $('filesRetry')?.addEventListener('click', () => loadFilesData(true))
  const bind = (id, key) => $(id)?.addEventListener('change', () => { filters[key] = $(id).value; renderFiles() })
  bind('fileFilterQ', 'q'); bind('fileFilterType', 'type'); bind('fileFilterProject', 'project')
  document.querySelectorAll('[data-file-detail]').forEach((button) => button.addEventListener('click', () => openFileDetail(button.dataset.fileDetail)))
}

function openTaskEditor(id = null) {
  const task = id ? state.jarvis.tasks.find((item) => item.id === id) : null
  const modal = $('modalHost')
  modal.innerHTML = `<div class="modal-backdrop"><form id="domainTaskForm" class="modal wide domain-modal">
    <div class="modal-head"><div><span class="eyebrow">${task ? 'EDITAR TAREFA' : 'NOVA TAREFA'}</span><h2>${task ? esc(task.title) : 'Criar tarefa'}</h2><div class="modal-sub">Algo que precisa ser feito, com prazo e contexto opcionais.</div></div><button id="closeModal" class="icon-button" type="button">×</button></div>
    <div class="form-grid">
      <label class="field-label full-span">Título<input id="domainTaskTitle" value="${esc(task?.title || '')}" maxlength="180" required></label>
      <label class="field-label full-span">Descrição<textarea id="domainTaskDescription" rows="4">${esc(task?.description || '')}</textarea></label>
      <label class="field-label">Prazo<input id="domainTaskDue" type="datetime-local" value="${esc(domainDateInput(task?.due_at))}"></label>
      <label class="field-label">Prioridade<select id="domainTaskPriority">${Object.entries(TASK_PRIORITY_LABELS).map(([value,label]) => `<option value="${value}" ${value === (task?.priority || 'normal') ? 'selected' : ''}>${esc(label)}</option>`).join('')}</select></label>
      <label class="field-label full-span">Projeto<select id="domainTaskProject">${domainProjectOptions(task?.project_id || '')}</select></label>
    </div>
    ${task?.recurrence_rule ? `<div class="domain-structural-note"><strong>Recorrência preparada</strong><span>${esc(task.recurrence_rule)}. A execução automática ainda não está ativa nesta versão.</span></div>` : ''}
    ${domainTechnicalDetails(task)}
    <div class="modal-actions"><div>${task ? '<button id="domainTaskDelete" class="button danger" type="button">Excluir tarefa</button>' : ''}</div><div class="modal-actions-right"><button id="cancelModal" class="button" type="button">Cancelar</button><button id="domainTaskSave" class="button primary" type="submit">✓ Salvar</button></div></div>
  </form></div>`
  const close = () => { modal.innerHTML = '' }
  $('closeModal').addEventListener('click', close)
  $('cancelModal').addEventListener('click', close)
  $('domainTaskForm').addEventListener('submit', async (event) => {
    event.preventDefault()
    const title = $('domainTaskTitle').value.trim()
    if (!title) return
    const payload = {
      title,
      description: $('domainTaskDescription').value.trim() || null,
      due_at: domainDateToIso($('domainTaskDue').value),
      priority: $('domainTaskPriority').value,
      project_id: $('domainTaskProject').value || null
    }
    await performDomainWrite($('domainTaskSave'), () => task ? domainUpdate(supabase, 'task', task.id, payload) : domainCreate(supabase, 'task', payload), task ? 'Tarefa atualizada.' : 'Tarefa criada.')
  })
  $('domainTaskDelete')?.addEventListener('click', async () => {
    if (!confirm(`Excluir definitivamente a tarefa “${task.title}”?`)) return
    await performDomainWrite($('domainTaskDelete'), () => domainDelete(supabase, 'task', task.id), 'Tarefa excluída.')
  })
}

async function transitionTask(id, action, button) {
  const messages = { task_complete: 'Tarefa concluída.', task_reopen: 'Tarefa reaberta.', task_cancel: 'Tarefa cancelada.' }
  await performDomainWrite(button, () => domainTransition(supabase, 'task', id, action), messages[action] || 'Tarefa atualizada.')
}

function renderTasks() {
  if (!state.jarvis.loaded && !state.jarvis.loading) { loadJarvisData(); $('mainArea').innerHTML = personalLoading(); return }
  const filters = state.domainUi.task
  const tasks = filterTasks(state.jarvis.tasks, filters)
  const openCount = state.jarvis.tasks.filter((task) => task.status === 'open').length
  $('mainArea').innerHTML = `<div class="content-stack personal-section domain-section">
    <section class="section-intro domain-intro"><div><span class="eyebrow">TAREFAS</span><h2>O que precisa acontecer.</h2><p>${openCount} tarefa${openCount === 1 ? '' : 's'} em aberto. Tudo aqui usa o mesmo registro que alimenta a Home e o Jarvis.</p></div><button id="domainNewTask" class="button primary" type="button">＋ Nova tarefa</button></section>
    <section class="panel domain-toolbar"><label class="domain-search">Buscar<input id="taskFilterQ" type="search" value="${esc(filters.q)}" placeholder="Título ou descrição"></label><label>Status<select id="taskFilterStatus"><option value="all">Todos</option>${Object.entries(TASK_STATUS_LABELS).map(([value,label]) => `<option value="${value}" ${filters.status === value ? 'selected' : ''}>${esc(label)}</option>`).join('')}</select></label><label>Prioridade<select id="taskFilterPriority"><option value="all">Todas</option>${Object.entries(TASK_PRIORITY_LABELS).map(([value,label]) => `<option value="${value}" ${filters.priority === value ? 'selected' : ''}>${esc(label)}</option>`).join('')}</select></label><label>Prazo<select id="taskFilterDue"><option value="all">Qualquer prazo</option><option value="overdue" ${filters.due === 'overdue' ? 'selected' : ''}>Vencidas</option><option value="today" ${filters.due === 'today' ? 'selected' : ''}>Hoje</option><option value="next7" ${filters.due === 'next7' ? 'selected' : ''}>Próximos 7 dias</option><option value="no_due" ${filters.due === 'no_due' ? 'selected' : ''}>Sem prazo</option></select></label><label>Projeto<select id="taskFilterProject"><option value="all">Todos</option>${state.jarvis.projects.map((project) => `<option value="${esc(project.id)}" ${filters.project === project.id ? 'selected' : ''}>${esc(project.name)}</option>`).join('')}</select></label></section>
    <section class="domain-list">${tasks.length ? tasks.map((task) => `<article class="domain-card task-domain-card"><div class="domain-card-main"><div class="domain-card-chips">${taskStatusChip(task)}${taskPriorityChip(task)}${task.project_id ? `<span class="domain-chip project">${esc(domainProjectName(task.project_id))}</span>` : ''}</div><h3>${esc(task.title)}</h3><p>${esc(task.description || 'Sem descrição adicional.')}</p><div class="domain-card-meta"><span>${esc(domainWhen(task.due_at))}</span>${task.completed_at ? `<span>Concluída ${esc(domainWhen(task.completed_at, ''))}</span>` : ''}</div></div><div class="domain-card-actions">${task.status === 'open' ? `<button class="button small primary" data-task-transition="task_complete" data-id="${esc(task.id)}" type="button">Concluir</button><button class="button small" data-task-transition="task_cancel" data-id="${esc(task.id)}" type="button">Cancelar</button>` : `<button class="button small" data-task-transition="task_reopen" data-id="${esc(task.id)}" type="button">Reabrir</button>`}<button class="button small" data-task-edit="${esc(task.id)}" type="button">Editar</button></div></article>`).join('') : '<div class="personal-empty panel"><strong>Nenhuma tarefa encontrada.</strong><span>Crie uma tarefa real ou ajuste os filtros acima.</span></div>'}</section>
  </div>`
  $('domainNewTask').addEventListener('click', () => openTaskEditor())
  const bind = (id, key, event = 'change') => $(id).addEventListener(event, () => { filters[key] = $(id).value; renderTasks() })
  bind('taskFilterQ', 'q'); bind('taskFilterStatus', 'status'); bind('taskFilterPriority', 'priority'); bind('taskFilterDue', 'due'); bind('taskFilterProject', 'project')
  document.querySelectorAll('[data-task-edit]').forEach((button) => button.addEventListener('click', () => openTaskEditor(button.dataset.taskEdit)))
  document.querySelectorAll('[data-task-transition]').forEach((button) => button.addEventListener('click', () => transitionTask(button.dataset.id, button.dataset.taskTransition, button)))
}

function openNoteEditor(id = null) {
  const note = id ? state.jarvis.notes.find((item) => item.id === id) : null
  const modal = $('modalHost')
  modal.innerHTML = `<div class="modal-backdrop"><form id="domainNoteForm" class="modal wide domain-modal"><div class="modal-head"><div><span class="eyebrow">${note ? 'EDITAR NOTA' : 'NOVA NOTA'}</span><h2>${note ? esc(note.title) : 'Criar nota ou ideia'}</h2><div class="modal-sub">Informação para guardar, consultar ou desenvolver. Não vira tarefa automaticamente.</div></div><button id="closeModal" class="icon-button" type="button">×</button></div><div class="form-grid"><label class="field-label full-span">Título<input id="domainNoteTitle" value="${esc(note?.title || '')}" maxlength="180" required></label><label class="field-label full-span">Conteúdo<textarea id="domainNoteContent" rows="8" required>${esc(note?.content || '')}</textarea></label><label class="field-label">Tipo<select id="domainNoteType">${Object.entries(NOTE_TYPE_LABELS).map(([value,label]) => `<option value="${value}" ${value === (note?.note_type || 'note') ? 'selected' : ''}>${esc(label)}</option>`).join('')}</select></label><label class="field-label">Projeto<select id="domainNoteProject">${domainProjectOptions(note?.project_id || '')}</select></label><label class="field-label full-span">Tags<input id="domainNoteTags" value="${esc((note?.tags || []).join(', '))}" placeholder="Ex.: conteúdo, financeiro, referência"><span class="tag-input-help">Separe as tags por vírgula.</span></label></div>${domainTechnicalDetails(note)}<div class="modal-actions"><div>${note ? '<button id="domainNoteDelete" class="button danger" type="button">Excluir nota</button>' : ''}</div><div class="modal-actions-right"><button id="cancelModal" class="button" type="button">Cancelar</button><button id="domainNoteSave" class="button primary" type="submit">✓ Salvar</button></div></div></form></div>`
  const close = () => { modal.innerHTML = '' }
  $('closeModal').addEventListener('click', close); $('cancelModal').addEventListener('click', close)
  $('domainNoteForm').addEventListener('submit', async (event) => {
    event.preventDefault()
    const title = $('domainNoteTitle').value.trim(), content = $('domainNoteContent').value.trim()
    if (!title || !content) return
    const tags = [...new Set($('domainNoteTags').value.split(',').map((tag) => tag.trim()).filter(Boolean))]
    const payload = { title, content, note_type: $('domainNoteType').value, tags, project_id: $('domainNoteProject').value || null }
    await performDomainWrite($('domainNoteSave'), () => note ? domainUpdate(supabase, 'note', note.id, payload) : domainCreate(supabase, 'note', payload), note ? 'Nota atualizada.' : 'Nota criada.')
  })
  $('domainNoteDelete')?.addEventListener('click', async () => {
    if (!confirm(`Excluir definitivamente a nota “${note.title}”?`)) return
    await performDomainWrite($('domainNoteDelete'), () => domainDelete(supabase, 'note', note.id), 'Nota excluída.')
  })
}

function renderNotes() {
  if (!state.jarvis.loaded && !state.jarvis.loading) { loadJarvisData(); $('mainArea').innerHTML = personalLoading(); return }
  const filters = state.domainUi.note
  const tags = collectNoteTags(state.jarvis.notes)
  const notes = filterNotes(state.jarvis.notes, filters)
  $('mainArea').innerHTML = `<div class="content-stack personal-section domain-section"><section class="section-intro domain-intro"><div><span class="eyebrow">NOTAS & IDEIAS</span><h2>Memória que você consegue encontrar.</h2><p>${state.jarvis.notes.length} registro${state.jarvis.notes.length === 1 ? '' : 's'} real${state.jarvis.notes.length === 1 ? '' : 'is'}, sem status e sem virar tarefa automaticamente.</p></div><button id="domainNewNote" class="button primary" type="button">＋ Nova nota</button></section><section class="panel domain-toolbar"><label class="domain-search">Buscar<input id="noteFilterQ" type="search" value="${esc(filters.q)}" placeholder="Título, conteúdo ou tag"></label><label>Tipo<select id="noteFilterType"><option value="all">Todos</option>${Object.entries(NOTE_TYPE_LABELS).map(([value,label]) => `<option value="${value}" ${filters.type === value ? 'selected' : ''}>${esc(label)}</option>`).join('')}</select></label><label>Tag<select id="noteFilterTag"><option value="all">Todas</option>${tags.map((tag) => `<option value="${esc(tag)}" ${filters.tag === tag ? 'selected' : ''}>${esc(tag)}</option>`).join('')}</select></label><label>Projeto<select id="noteFilterProject"><option value="all">Todos</option>${state.jarvis.projects.map((project) => `<option value="${esc(project.id)}" ${filters.project === project.id ? 'selected' : ''}>${esc(project.name)}</option>`).join('')}</select></label></section><section class="notes-grid domain-notes-grid">${notes.length ? notes.map((note) => `<article class="note-card domain-note-card"><div class="domain-card-chips">${noteTypeChip(note)}${note.project_id ? `<span class="domain-chip project">${esc(domainProjectName(note.project_id))}</span>` : ''}</div><h3>${esc(note.title)}</h3><p>${esc(note.content)}</p>${Array.isArray(note.tags) && note.tags.length ? `<div class="domain-tags">${note.tags.map((tag) => `<span>${esc(tag)}</span>`).join('')}</div>` : ''}<footer><span>Atualizada ${esc(domainWhen(note.updated_at, ''))}</span><button class="button small" data-note-edit="${esc(note.id)}" type="button">Abrir / editar</button></footer></article>`).join('') : '<div class="personal-empty panel"><strong>Nenhuma nota encontrada.</strong><span>Crie uma nota real ou ajuste os filtros acima.</span></div>'}</section></div>`
  $('domainNewNote').addEventListener('click', () => openNoteEditor())
  const bind = (id, key, event = 'change') => $(id).addEventListener(event, () => { filters[key] = $(id).value; renderNotes() })
  bind('noteFilterQ','q'); bind('noteFilterType','type'); bind('noteFilterTag','tag'); bind('noteFilterProject','project')
  document.querySelectorAll('[data-note-edit]').forEach((button) => button.addEventListener('click', () => openNoteEditor(button.dataset.noteEdit)))
}

function openProjectEditor(id = null) {
  const project = id ? state.jarvis.projects.find((item) => item.id === id) : null
  const modal = $('modalHost')
  modal.innerHTML = `<div class="modal-backdrop"><form id="domainProjectForm" class="modal wide domain-modal"><div class="modal-head"><div><span class="eyebrow">${project ? 'EDITAR PROJETO' : 'NOVO PROJETO'}</span><h2>${project ? esc(project.name) : 'Criar projeto'}</h2><div class="modal-sub">Um contexto para agrupar trabalho e informação sem duplicar registros.</div></div><button id="closeModal" class="icon-button" type="button">×</button></div><div class="form-grid"><label class="field-label full-span">Nome<input id="domainProjectName" value="${esc(project?.name || '')}" maxlength="180" required></label><label class="field-label full-span">Descrição<textarea id="domainProjectDescription" rows="6">${esc(project?.description || '')}</textarea></label><label class="field-label">Prazo opcional<input id="domainProjectDue" type="datetime-local" value="${esc(domainDateInput(project?.due_at))}"></label>${project ? `<div class="field-label"><span>Status atual</span><div class="domain-current-status">${projectStatusChip(project)}</div></div>` : ''}</div>${domainTechnicalDetails(project)}<div class="modal-actions"><div>${project ? '<button id="domainProjectDelete" class="button danger ghost-danger" type="button">Excluir definitivamente</button>' : ''}</div><div class="modal-actions-right"><button id="cancelModal" class="button" type="button">Cancelar</button><button id="domainProjectSave" class="button primary" type="submit">✓ Salvar</button></div></div></form></div>`
  const close = () => { modal.innerHTML = '' }
  $('closeModal').addEventListener('click', close); $('cancelModal').addEventListener('click', close)
  $('domainProjectForm').addEventListener('submit', async (event) => {
    event.preventDefault()
    const name = $('domainProjectName').value.trim()
    if (!name) return
    const payload = { name, description: $('domainProjectDescription').value.trim() || null, due_at: domainDateToIso($('domainProjectDue').value) }
    await performDomainWrite($('domainProjectSave'), () => project ? domainUpdate(supabase, 'project', project.id, payload) : domainCreate(supabase, 'project', payload), project ? 'Projeto atualizado.' : 'Projeto criado.')
  })
  $('domainProjectDelete')?.addEventListener('click', async () => {
    if (!confirm(`Excluir definitivamente o projeto “${project.name}”? Tarefas, notas e arquivos serão preservados sem vínculo com ele.`)) return
    await performDomainWrite($('domainProjectDelete'), () => domainDelete(supabase, 'project', project.id), 'Projeto excluído; tarefas, notas e arquivos foram preservados.')
  })
}

async function transitionProject(id, action, button) {
  const messages = { project_pause: 'Projeto pausado.', project_complete: 'Projeto concluído.', project_archive: 'Projeto arquivado.', project_reopen: 'Projeto reativado.' }
  await performDomainWrite(button, () => domainTransition(supabase, 'project', id, action), messages[action] || 'Projeto atualizado.')
}

function openProjectDetail(id) {
  const project = state.jarvis.projects.find((item) => item.id === id)
  if (!project) return
  const tasks = state.jarvis.tasks.filter((task) => task.project_id === id)
  const notes = state.jarvis.notes.filter((note) => note.project_id === id)
  const files = state.files.items.filter((file) => file.project_id === id)
  const modal = $('modalHost')
  modal.innerHTML = `<div class="modal-backdrop"><div class="modal wide domain-modal"><div class="modal-head"><div><span class="eyebrow">PROJETO</span><h2>${esc(project.name)}</h2><div class="domain-card-chips">${projectStatusChip(project)}</div></div><button id="closeModal" class="icon-button" type="button">×</button></div><div class="project-context"><p>${esc(project.description || 'Sem descrição adicional.')}</p><div class="project-context-stats"><button id="projectTasksLink" type="button"><strong>${tasks.length}</strong><span>Tarefas relacionadas</span></button><button id="projectNotesLink" type="button"><strong>${notes.length}</strong><span>Notas relacionadas</span></button><button id="projectFilesLink" type="button"><strong>${files.length}</strong><span>Arquivos relacionados</span></button><div><strong>${esc(domainWhen(project.due_at))}</strong><span>Prazo</span></div></div><div class="project-related-preview"><div><strong>Tarefas</strong>${tasks.length ? tasks.slice(0,4).map((task) => `<span>${taskStatusChip(task)} ${esc(task.title)}</span>`).join('') : '<span>Nenhuma tarefa ligada a este projeto.</span>'}</div><div><strong>Notas</strong>${notes.length ? notes.slice(0,4).map((note) => `<span>${noteTypeChip(note)} ${esc(note.title)}</span>`).join('') : '<span>Nenhuma nota ligada a este projeto.</span>'}</div><div><strong>Arquivos</strong>${files.length ? files.slice(0,4).map((file) => `<span><span class="domain-chip note">${esc(fileTypeLabel(file))}</span> ${esc(file.name)}</span>`).join('') : '<span>Nenhum arquivo ligado a este projeto.</span>'}</div></div></div>${domainTechnicalDetails(project)}<div class="modal-actions"><span></span><div class="modal-actions-right"><button id="projectDetailClose" class="button" type="button">Fechar</button><button id="projectDetailEdit" class="button primary" type="button">Editar projeto</button></div></div></div></div>`
  const close = () => { modal.innerHTML = '' }
  $('closeModal').addEventListener('click', close); $('projectDetailClose').addEventListener('click', close)
  $('projectDetailEdit').addEventListener('click', () => openProjectEditor(id))
  $('projectTasksLink').addEventListener('click', () => { close(); state.domainUi.task.project = id; state.domainUi.task.status = 'all'; navigate('tasks') })
  $('projectNotesLink').addEventListener('click', () => { close(); state.domainUi.note.project = id; navigate('notes') })
  $('projectFilesLink').addEventListener('click', () => { close(); state.files.filters.project = id; navigate('files') })
}

function projectActionMarkup(project) {
  if (project.status === 'active') return `<button class="button small" data-project-transition="project_pause" data-id="${esc(project.id)}" type="button">Pausar</button><button class="button small" data-project-transition="project_complete" data-id="${esc(project.id)}" type="button">Concluir</button><button class="button small" data-project-transition="project_archive" data-id="${esc(project.id)}" type="button">Arquivar</button>`
  if (project.status === 'paused') return `<button class="button small primary" data-project-transition="project_reopen" data-id="${esc(project.id)}" type="button">Reativar</button><button class="button small" data-project-transition="project_complete" data-id="${esc(project.id)}" type="button">Concluir</button><button class="button small" data-project-transition="project_archive" data-id="${esc(project.id)}" type="button">Arquivar</button>`
  if (project.status === 'completed') return `<button class="button small" data-project-transition="project_reopen" data-id="${esc(project.id)}" type="button">Reativar</button><button class="button small" data-project-transition="project_archive" data-id="${esc(project.id)}" type="button">Arquivar</button>`
  return `<button class="button small primary" data-project-transition="project_reopen" data-id="${esc(project.id)}" type="button">Reabrir como ativo</button>`
}

function renderProjects() {
  if (!state.jarvis.loaded && !state.jarvis.loading) { loadJarvisData(); $('mainArea').innerHTML = personalLoading(); return }
  if (!state.files.loaded && !state.files.loading) loadFilesData()
  const filters = state.domainUi.project
  const projects = filterProjects(state.jarvis.projects, filters)
  const activeCount = state.jarvis.projects.filter((project) => project.status === 'active').length
  $('mainArea').innerHTML = `<div class="content-stack personal-section domain-section"><section class="section-intro domain-intro"><div><span class="eyebrow">PROJETOS</span><h2>Contextos que agrupam coisas.</h2><p>${activeCount} projeto${activeCount === 1 ? '' : 's'} ativo${activeCount === 1 ? '' : 's'}. Tarefas, notas e arquivos continuam sendo registros próprios e apenas se relacionam ao projeto.</p></div><button id="domainNewProject" class="button primary" type="button">＋ Novo projeto</button></section><section class="panel domain-toolbar"><label class="domain-search">Buscar<input id="projectFilterQ" type="search" value="${esc(filters.q)}" placeholder="Nome ou descrição"></label><label>Status<select id="projectFilterStatus"><option value="all">Todos</option>${Object.entries(PROJECT_STATUS_LABELS).map(([value,label]) => `<option value="${value}" ${filters.status === value ? 'selected' : ''}>${esc(label)}</option>`).join('')}</select></label><label>Prazo<select id="projectFilterDue"><option value="all">Qualquer prazo</option><option value="overdue" ${filters.due === 'overdue' ? 'selected' : ''}>Vencidos</option><option value="next30" ${filters.due === 'next30' ? 'selected' : ''}>Próximos 30 dias</option><option value="no_due" ${filters.due === 'no_due' ? 'selected' : ''}>Sem prazo</option></select></label></section><section class="projects-grid domain-projects-grid">${projects.length ? projects.map((project) => `<article class="project-card domain-project-card"><div class="project-mark">◇</div><div class="domain-project-body"><div class="domain-card-chips">${projectStatusChip(project)}</div><h3>${esc(project.name)}</h3><p>${esc(project.description || 'Sem descrição adicional.')}</p><div class="domain-card-meta"><span>${esc(domainWhen(project.due_at))}</span><span>${state.jarvis.tasks.filter((task) => task.project_id === project.id).length} tarefas · ${state.jarvis.notes.filter((note) => note.project_id === project.id).length} notas · ${state.files.items.filter((file) => file.project_id === project.id).length} arquivos</span></div><div class="domain-card-actions project-actions">${projectActionMarkup(project)}<button class="button small" data-project-open="${esc(project.id)}" type="button">Abrir contexto</button><button class="button small" data-project-edit="${esc(project.id)}" type="button">Editar</button></div></div></article>`).join('') : '<div class="personal-empty panel"><strong>Nenhum projeto encontrado.</strong><span>Crie um projeto real ou ajuste os filtros acima.</span></div>'}</section></div>`
  $('domainNewProject').addEventListener('click', () => openProjectEditor())
  const bind = (id, key, event = 'change') => $(id).addEventListener(event, () => { filters[key] = $(id).value; renderProjects() })
  bind('projectFilterQ','q'); bind('projectFilterStatus','status'); bind('projectFilterDue','due')
  document.querySelectorAll('[data-project-open]').forEach((button) => button.addEventListener('click', () => openProjectDetail(button.dataset.projectOpen)))
  document.querySelectorAll('[data-project-edit]').forEach((button) => button.addEventListener('click', () => openProjectEditor(button.dataset.projectEdit)))
  document.querySelectorAll('[data-project-transition]').forEach((button) => button.addEventListener('click', () => transitionProject(button.dataset.id, button.dataset.projectTransition, button)))
}

function renderJarvis() {
  if (!state.jarvis.whatsapp.loaded && !state.jarvis.whatsapp.loading) loadWhatsAppIdentity()
  if (!state.files.loaded && !state.files.loading) loadFilesData()
  if (!state.jarvis.loaded && !state.jarvis.loading) {
    $('mainArea').innerHTML = `<div class="content-stack">${personalLoading()}<div class="skeleton-block h340"></div></div>`
    loadJarvisData()
    return
  }
  const messages = state.jarvis.messages
  const hasOpenAI = state.jarvis.engine === 'openai' || messages.some((m) => m.raw_data?.engine === 'openai')
  const cards = jarvisCreatedSummary()
  const google = jarvisGoogleConnection()
  const drive = jarvisDriveConnection()
  const whatsapp = state.jarvis.whatsapp
  const calendarActions = state.jarvis.actions.filter((x) => x.action_type === 'calendar_create' && ['proposed','failed'].includes(x.status))
  const pendingActions = state.jarvis.actions.filter((x) => x.status === 'proposed').length
  const loadError = state.jarvis.error ? `<div class="error-banner jarvis-load-error" role="alert"><span>${esc(state.jarvis.error)}</span><button id="jarvisRetryLoad" type="button">Tentar novamente</button></div>` : ''
  $('mainArea').innerHTML = `<div class="content-stack jarvis-view jarvis-v3-view">
    ${loadError}
    <section class="jarvis-hero jarvis-v3-hero jarvis-hero-with-face">
      <div class="jarvis-hero-copy"><span class="eyebrow">SEU ASSISTENTE PESSOAL</span><h2>Converse. O Jarvis organiza o resto.</h2><p>Uma única conversa para consultar seu ambiente, registrar contexto, preparar ações e conectar agenda, finanças, projetos e arquivos e, em breve, WhatsApp e lugares.</p><div class="jarvis-statuses"><span class="jarvis-status ${hasOpenAI ? 'online' : 'local'}"><i></i>${hasOpenAI ? 'IA conectada' : 'IA disponível'}</span><span class="jarvis-status ${google ? 'online' : 'waiting'}"><i></i>Calendar ${google ? 'conectado' : 'pendente'}</span><span class="jarvis-status ${drive ? 'online' : 'waiting'}"><i></i>Drive ${drive ? 'conectado' : 'pendente'}</span><span class="jarvis-status waiting"><i></i>WhatsApp em produção</span></div></div>
      ${jarvisPresenceMarkup(pendingActions ? 'attention' : 'idle', 'hero')}
    </section>
    <section class="jarvis-layout jarvis-v3-layout">
      <div class="panel jarvis-chat-panel">
        <div class="panel-head"><div><h2>Conversa</h2><p>Pergunte sobre seu painel ou peça uma ação. O mesmo cérebro será usado no WhatsApp.</p></div><button id="jarvisRefresh" class="button small" type="button">Atualizar</button></div>
        <div id="jarvisChat" class="jarvis-chat" aria-live="polite">
          ${messages.length ? messages.map((m) => `<div class="jarvis-message ${m.direction === 'inbound' ? 'user' : 'assistant'}"><div class="jarvis-bubble"><span>${safeMessageHtml(m.body || m.transcript || '')}</span>${m.direction === 'outbound' ? `<small>${esc(jarvisIntentLabel(m.intent))}</small>` : ''}</div></div>`).join('') : `<div class="jarvis-empty"><strong>Comece por qualquer assunto.</strong><span>Ex.: “O que tenho amanhã?”, “Quanto gastei este mês?” ou “Anota essa ideia...”.</span></div>`}
        </div>
        <div class="jarvis-quick-prompts">
          <button type="button" data-jarvis-prompt="Jarvis, o que eu tenho pendente hoje?">Meu dia</button>
          <button type="button" data-jarvis-prompt="Jarvis, quanto eu gastei este mês e o que merece atenção?">Finanças</button>
          <button type="button" data-jarvis-prompt="Jarvis, me mostra minhas últimas ideias e notas.">Notas</button>
          <button type="button" data-jarvis-prompt="Jarvis, quais projetos estão ativos?">Projetos</button>
          <button type="button" data-jarvis-prompt="Jarvis, encontre o PDF com contrato.">Arquivos</button>
        </div>
        <form id="jarvisForm" class="jarvis-composer">
          <textarea id="jarvisInput" rows="2" maxlength="2000" placeholder="Fale com o Jarvis..."></textarea>
          <button id="jarvisSend" class="button primary" type="submit">Enviar</button>
        </form>
        <div id="jarvisMessage" class="form-message hidden"></div>
      </div>
      <aside class="jarvis-side">
        <section class="panel jarvis-command-center">
          <div class="panel-head"><div><span class="eyebrow">CENTRAL DE AÇÕES</span><h2>${pendingActions} aguardando</h2><p>O Jarvis prepara. Você mantém o controle do que sai do sistema.</p></div></div>
          ${calendarActions.length ? `<div class="jarvis-calendar-actions">${calendarActionGroupsMarkup(calendarActions, google)}</div>` : '<div class="personal-empty compact"><span>Nenhuma ação externa pendente agora.</span></div>'}
        </section>
        <section class="panel jarvis-integrations-compact">
          <div class="panel-head"><div><h2>Integrações</h2><p>Um assistente, vários canais e serviços.</p></div></div>
          <div class="compact-integration ${google ? 'connected' : ''}"><span>31</span><div><strong>Google Calendar</strong><small>${google ? esc(google.display_name || 'Conectado') : 'Não conectado'}</small></div>${google ? '<b>✓</b>' : '<button id="jarvisGoogleConnect" class="button small" type="button">Conectar</button>'}</div>
          <div class="compact-integration ${whatsapp.paired ? 'connected' : 'configuring'}"><span>WA</span><div><strong>WhatsApp</strong><small>${whatsapp.paired ? 'Identidade vinculada com segurança' : whatsapp.pairing ? `Código ${esc(whatsapp.pairing.code)} · expira em 15 min` : 'Aguardando vínculo seguro'}</small>${whatsapp.pairing ? `<em>${esc(whatsapp.pairing.instruction)}</em>` : ''}</div>${whatsapp.paired ? '<b>✓</b>' : `<button id="jarvisWhatsAppPair" class="button small" type="button">${whatsapp.pairing ? 'Gerar outro' : 'Gerar código'}</button>`}</div>
          <div class="compact-integration ${drive ? 'connected' : 'future'}"><span>D</span><div><strong>Google Drive</strong><small>${drive ? `${state.files.count} metadados sincronizados` : 'Não conectado'}</small></div><b>${drive ? '✓' : '○'}</b></div>
        </section>
        <section class="panel"><div class="panel-head"><div><h2>Memória estruturada</h2><p>O que já existe por trás da conversa.</p></div></div><div class="jarvis-metric-list">${cards.map(([label,value,sub]) => `<div><span>${esc(label)}</span><strong>${value}</strong><small>${esc(sub)}</small></div>`).join('')}</div></section>
        <section class="panel jarvis-rules"><span class="eyebrow">COMO O JARVIS AGE</span><h3>Conversa primeiro. Ação com contexto.</h3><p>Notas, ideias e contexto financeiro podem ser registrados diretamente. Ações externas sensíveis continuam pedindo confirmação.</p><div><span>Painel</span><b>Central visual</b></div><div><span>WhatsApp</span><b>Canal móvel</b></div><div><span>Dados</span><b>Mesmo núcleo</b></div></section>
      </aside>
    </section>
  </div>`
  $('jarvisRetryLoad')?.addEventListener('click', () => { state.jarvis.loaded = false; state.jarvis.error = null; loadJarvisData(true) })
  $('jarvisRefresh')?.addEventListener('click', () => Promise.all([loadJarvisData(true), loadFilesData(true)]))
  $('jarvisGoogleConnect')?.addEventListener('click', connectJarvisGoogleCalendar)
  $('jarvisWhatsAppPair')?.addEventListener('click', startWhatsAppPairing)
  bindCalendarBatchActions()
  document.querySelectorAll('[data-jarvis-prompt]').forEach((b) => b.addEventListener('click', () => { $('jarvisInput').value = b.dataset.jarvisPrompt; $('jarvisInput').focus() }))
  $('jarvisForm')?.addEventListener('submit', sendJarvisMessage)
  $('jarvisInput')?.addEventListener('focus', () => setJarvisVisualState('listening'))
  $('jarvisInput')?.addEventListener('input', () => setJarvisVisualState('listening'))
  $('jarvisInput')?.addEventListener('blur', () => { if (!$('jarvisInput')?.value.trim()) setJarvisVisualState(pendingActions ? 'attention' : 'idle') })
  requestAnimationFrame(() => { const chat = $('jarvisChat'); if (chat) chat.scrollTop = chat.scrollHeight; setJarvisVisualState(pendingActions ? 'attention' : 'idle') })
}

const HEALTH_LABELS = {
  supabase: 'Supabase',
  openai: 'OpenAI',
  google_calendar: 'Google Calendar',
  google_drive: 'Google Drive',
  document_ai: 'Document AI',
  cloud_run: 'Cloud Run',
  whatsapp_webhook: 'Webhook WhatsApp',
  whatsapp_sender: 'Envio WhatsApp',
}

async function loadHealthData(refresh = false) {
  if (!state.session || state.health.loading) return
  state.health.loading = true
  state.health.error = null
  if (state.view === 'health') renderMain()
  try {
    const { data, error } = await supabase.functions.invoke('jarvis-health', {
      body: { action: refresh ? 'check' : 'status' }
    })
    if (error) throw error
    if (data?.error) throw new Error(data.error)
    state.health.checks = data?.checks || []
    if (!refresh && !state.health.checks.length) {
      state.health.loading = false
      return loadHealthData(true)
    }
    state.health.loaded = true
  } catch (err) {
    state.health.error = humanError(err)
    state.health.loaded = true
  } finally {
    state.health.loading = false
    if (state.view === 'health') renderMain()
  }
}

function renderHealth() {
  const checks = state.health.checks || []
  const actionCount = checks.filter((entry) => entry.action_required).length
  $('mainArea').innerHTML = `<div class="content-stack health-section">
    <section class="panel health-head">
      <div><span class="eyebrow">OBSERVABILIDADE</span><h2>Saúde do Jarvis</h2><p>Diagnóstico discreto das integrações e serviços. Nenhum secret ou conteúdo pessoal é exibido.</p></div>
      <button id="healthRefresh" class="button primary" type="button">${state.health.loading ? '<span class="spinner"></span> Verificando' : 'Executar verificação'}</button>
    </section>
    ${state.health.error ? `<div class="form-message error">${esc(state.health.error)}</div>` : ''}
    <section class="health-summary">
      <article><span>Serviços</span><strong>${checks.length}</strong></article>
      <article><span>Exigem ação</span><strong>${actionCount}</strong></article>
      <article><span>Última verificação</span><strong>${checks[0]?.checked_at ? esc(jarvisDateTime(checks[0].checked_at)) : 'Ainda não executada'}</strong></article>
    </section>
    <section class="health-grid">
      ${checks.length ? checks.map((entry) => `<article class="health-card status-${esc(entry.status)}">
        <div><span class="health-dot"></span><strong>${esc(HEALTH_LABELS[entry.component] || entry.component)}</strong></div>
        <b>${esc(entry.status === 'healthy' ? 'Saudável' : entry.status === 'blocked' ? 'Bloqueado' : entry.status === 'degraded' ? 'Degradado' : 'Desconhecido')}</b>
        <p>${esc(entry.message)}</p>
        <small>${esc(entry.code)} · ${entry.checked_at ? esc(jarvisDateTime(entry.checked_at)) : 'sem leitura'}</small>
      </article>`).join('') : `<div class="personal-empty"><span>${state.health.loading ? 'Verificando serviços...' : 'Execute a primeira verificação de saúde.'}</span></div>`}
    </section>
  </div>`
  $('healthRefresh')?.addEventListener('click', () => loadHealthData(true))
}

async function sendJarvisMessage(e) {
  e.preventDefault()
  const input = $('jarvisInput')
  const text = input?.value.trim()
  if (!text) return
  const btn = $('jarvisSend')
  setBusy(btn, true, 'Pensando')
  setJarvisVisualState('thinking')
  showInfo('jarvisMessage', '')
  try {
    const { data, error } = await invokeJarvisEngine(text, 'panel_jarvis')
    if (error) throw error
    if (data?.error) throw new Error(data.error)
    state.jarvis.engine = data?.engine || null
    input.value = ''
    await loadJarvisData(true)
    if (data?.confirmation_required) { toast('O Jarvis entendeu, mas essa acao precisa de confirmacao.', 'success'); setJarvisVisualState('attention') }
    else setJarvisVisualState('speaking', 1500)
  } catch (err) {
    showInfo('jarvisMessage', humanError(err))
    setJarvisVisualState('idle')
  } finally {
    setBusy(btn, false)
  }
}

boot()
