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
  jarvis: { messages: [], annotations: [], notes: [], tasks: [], projects: [], actions: [], connections: [], counts: { annotations: 0, notes: 0, tasks: 0, projects: 0, actions: 0 }, loading: false, loaded: false, engine: null, error: null },
  calendar: { events: [], loading: false, loaded: false, error: null, connected: null, syncedAt: null, displayName: null }
}

function esc(v = '') {
  return String(v).replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]))
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
    overview: ['Visão geral', 'FINANÇAS'],
    transactions: ['Transações', 'FINANÇAS'],
    purchases: ['Compras', 'FINANÇAS'],
    investments: ['Investimentos', 'FINANÇAS'],
    import: ['Importar extratos', 'FINANÇAS'],
    accounts: ['Contas', 'FINANÇAS']
  }[view] || ['Jarvis', 'AMBIENTE PESSOAL']
  $('pageTitle').textContent = meta[0]
  $('pageEyebrow').textContent = meta[1]
  setHidden($('financeTopActions'), !financeViews.includes(view))
  setHidden($('personalTopActions'), financeViews.includes(view))
  setHidden($('jarvisDockBtn'), ['home','jarvis'].includes(view))
  toggleSidebar(false)
  renderMain()
}

async function loadData() {
  if (!state.session || state.loading) return
  state.loading = true
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

function updateUserChrome() {
  const email = state.session?.user?.email || 'usuario'
  const name = personalDisplayName()
  $('userName').textContent = name
  $('userAvatar').textContent = name[0]?.toUpperCase() || 'U'
  const review = state.transactions.filter((t) => t.review_status === 'needs_review').length
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
  if (state.view === 'overview') renderOverview()
  if (state.view === 'transactions') renderTransactions()
  if (state.view === 'purchases') renderPurchases()
  if (state.view === 'investments') renderInvestments()
  if (state.view === 'import') renderImport()
  if (state.view === 'accounts') renderAccounts()
  if (state.view === 'jarvis') renderJarvis()
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
      await loadData()
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
  const files=[...(fileList||[])]; if(!files.length)return
  const accepted=files.filter((f)=>/\.(pdf|jpe?g|png)$/i.test(f.name) || ['application/pdf','image/jpeg','image/png'].includes(f.type))
  const rejected=files.length-accepted.length
  const existing=new Set(doc.files.map((x)=>`${x.file.name}|${x.file.size}|${x.file.lastModified}`))
  let added=0
  for(const file of accepted){ const key=`${file.name}|${file.size}|${file.lastModified}`; if(existing.has(key))continue; doc.files.push(defaultDocumentEntry(file,doc.hint)); existing.add(key); added++ }
  doc.message=rejected?`${rejected} arquivo(s) ignorado(s). Use PDF, JPG ou PNG.`:(added?`${added} arquivo(s) adicionado(s).`:'Esses arquivos já estão no lote.')
  renderImport()
}
function documentTypeLabel(type) {
  return ({ third_party:'Pagamento por terceiro', cofrinho:'Mercado Pago · Cofrinho', benefit:'Cartão alimentação', receipt:'Nota fiscal', bank_pdf:'Mercado Pago · Extrato em PDF', other:'Documento não identificado' })[type] || 'Documento'
}
function normalizeSearchText(v='') { return String(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase() }
function moneyFromText(v='') {
  const m=String(v).match(/(?:R\$\s*)?([+-]?\s*[\d.]+,\d{2})/)
  if (!m) return NaN
  return parseMoneyInput(m[1].replace(/\s/g,''))
}
function ptMonthNumber(name='') {
  const n=normalizeSearchText(name).slice(0,3)
  return ({JAN:1,FEV:2,MAR:3,ABR:4,MAI:5,JUN:6,JUL:7,AGO:8,SET:9,OUT:10,NOV:11,DEZ:12})[n] || null
}
function isoFromPtDay(day, monthName, year=null) {
  const m=ptMonthNumber(monthName); if (!m) return null
  const y=Number(year || state.month.split('-')[0])
  return `${y}-${String(m).padStart(2,'0')}-${String(Number(day)).padStart(2,'0')}`
}
function detectDocumentType(text, hint='auto') {
  if (hint && hint !== 'auto') return hint
  const u=normalizeSearchText(text)
  if (u.includes('EXTRATO DE CONTA') && u.includes('MERCADO PAGO') && (u.includes('DETALHE DOS MOVIMENTOS') || u.includes('ID DA OPERACAO'))) return 'bank_pdf'
  if (u.includes('MOVIMENTACOES DO COFRINHO') || (u.includes('RENDIMENTOS') && (u.includes('DINHEIRO RESERVADO') || u.includes('DINHEIRO RETIRADO'))) || u.includes('120% DO CDI')) return 'cofrinho'
  if (u.includes('COMPROVANTE DE PAGAMENTO') && (u.includes('BTG') || u.includes('DADOS DA COBRANCA'))) return 'third_party'
  if (u.includes('BENEFICIO BASE') || u.includes('SALDO GASTO') || u.includes('EMGEPRON')) return 'benefit'
  if (u.includes('NFC-E') || u.includes('NOTA FISCAL') || u.includes('CUPOM FISCAL')) return 'receipt'
  return 'other'
}
async function extractPdfText(file) {
  const pdfjs = await import('https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs')
  pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs'
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise
  const parts=[]
  for (let i=1;i<=pdf.numPages;i++) {
    const page=await pdf.getPage(i); const content=await page.getTextContent()
    parts.push(content.items.map((x)=>x.str).join(' '))
  }
  return parts.join('\n')
}
async function extractImageText(file, onProgress=()=>{}) {
  const mod = await import('https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/+esm')
  const recognize = mod.recognize || mod.default?.recognize
  if (!recognize) throw new Error('Leitor de imagem indisponível.')
  const out = await recognize(file, 'por', { logger: (m) => { if (m.status === 'recognizing text' && Number.isFinite(m.progress)) onProgress(Math.round(m.progress*100)) } })
  return out?.data?.text || ''
}
async function extractDocumentText(file, onProgress=()=>{}) {
  if (/\.pdf$/i.test(file.name) || file.type === 'application/pdf') {
    onProgress(15); const text=await extractPdfText(file); onProgress(100); return text
  }
  return extractImageText(file,onProgress)
}
function parseThirdPartyDocument(text) {
  const flat=String(text).replace(/\s+/g,' ')
  const dateMatch=flat.match(/Feito\s+em\s+(\d{1,2})\/(\d{1,2})\/(\d{4})/i) || flat.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  const amountMatch=flat.match(/Valor\s+(?:do\s+documento\s+)?R\$\s*([\d.]+,\d{2})/i) || flat.match(/R\$\s*([\d.]+,\d{2})/)
  const date=dateMatch ? `${dateMatch[3]}-${String(dateMatch[2]).padStart(2,'0')}-${String(dateMatch[1]).padStart(2,'0')}` : `${state.month}-01`
  const amount=amountMatch ? parseMoneyInput(amountMatch[1]) : 0
  return [{ date, type:'third_party', description:'Aluguel + condomínio', amount:Math.abs(num(amount)) }]
}
function parseCofrinhoDocument(text) {
  const lines=String(text).split(/\n+/).map((x)=>x.trim()).filter(Boolean)
  const rows=[]; let currentDate=null; let year=Number(state.month.split('-')[0])
  const monthYear=String(text).match(/(JANEIRO|FEVEREIRO|MAR[ÇC]O|ABRIL|MAIO|JUNHO|JULHO|AGOSTO|SETEMBRO|OUTUBRO|NOVEMBRO|DEZEMBRO)\s*\/?\s*(20\d{2})/i)
  if (monthYear) year=Number(monthYear[2])
  for (let i=0;i<lines.length;i++) {
    const normalizedLine=normalizeSearchText(lines[i])
    if (normalizedLine==='HOJE') { currentDate=new Date().toISOString().slice(0,10); continue }
    const d=lines[i].match(/(\d{1,2})\s+de\s+([A-Za-zÀ-ÿ]+)/i)
    if (d) { currentDate=isoFromPtDay(d[1],d[2],year); continue }
    const window=[lines[i],lines[i+1]||'',lines[i+2]||''].join(' ')
    const u=normalizeSearchText(window)
    let movement=null
    if (u.includes('DINHEIRO RESERVADO')) movement='contribution'
    else if (u.includes('DINHEIRO RETIRADO')) movement='withdrawal'
    else if (u.includes('RENDIMENTOS')) movement='income'
    if (!movement || !currentDate) continue
    const amountMatch=window.match(/[+-]\s*R\$\s*([\d.]+(?:,\d{2})?)/i) || window.match(/R\$\s*([\d.]+(?:,\d{2})?)/i)
    if (!amountMatch) continue
    const amount=Math.abs(parseMoneyInput(amountMatch[1]))
    const duplicate=rows.some((r)=>r.date===currentDate && r.type===movement && (movement==='income' || Math.abs(r.amount-amount)<.001))
    if (!amount || duplicate) continue
    rows.push({ date:currentDate, type:movement, description:movement==='contribution'?'Dinheiro reservado':movement==='withdrawal'?'Dinheiro retirado':'Rendimento do cofrinho', amount })
  }
  const flat=String(text).replace(/\s+/g,' ')
  const balanceMatch=flat.match(/R\$\s*([\d.]+)[,.](\d{2})\s*(?:120%|DO CDI|$)/i)
  const balance=balanceMatch ? parseMoneyInput(`${balanceMatch[1]},${balanceMatch[2]}`) : null
  const benchmark=/120%\s+do\s+CDI/i.test(flat) ? '120% do CDI' : null
  return { rows, balance, benchmark }
}
function parseMercadoPagoStatementDocument(text) {
  const flat=String(text).replace(/\s+/g,' ').trim()
  const holderMatch=flat.match(/EXTRATO DE CONTA\s+(.+?)\s+CPF\/CNPJ:/i)
  const holder=holderMatch ? holderMatch[1].trim() : ''
  const detailStart=flat.search(/DETALHE DOS MOVIMENTOS/i)
  const detail=detailStart>=0 ? flat.slice(detailStart).replace(/^.*?Data\s+Descri[cç][aã]o\s+ID da opera[cç][aã]o\s+Valor\s+Saldo\s*/i,'') : flat
  const rowRe=/(\d{2}-\d{2}-\d{4})\s+(.+?)\s+(\d{9,16})\s+R\$\s*([+-]?\s*[\d.]+,\d{2})\s+R\$\s*([+-]?\s*[\d.]+,\d{2})(?=\s+\d{2}-\d{2}-\d{4}|\s+Saldo final|$)/gi
  const rows=[]
  for(const m of detail.matchAll(rowRe)) {
    const [dd,mm,yyyy]=m[1].split('-')
    const date=`${yyyy}-${mm}-${dd}`
    const description=String(m[2]).replace(/\s+/g,' ').trim()
    const operationId=m[3]
    const signedAmount=parseMoneyInput(m[4].replace(/\s/g,''))
    const balanceAfter=parseMoneyInput(m[5].replace(/\s/g,''))
    const u=normalizeSearchText(description)
    const holderU=normalizeSearchText(holder)
    let type
    if (u.includes('DINHEIRO RESERVADO')) type='contribution'
    else if (u.includes('DINHEIRO RETIRADO')) type='withdrawal'
    else if (u.includes('PIX RECEBIDO') && holderU && u.includes(holderU)) type='transfer_in'
    else if (u.includes('PIX ENVIADO') && holderU && u.includes(holderU)) type='transfer_out'
    else if (u.includes('PIX RECEBIDO')) type='income'
    else if (u.includes('PIX ENVIADO')) type='expense'
    else type=signedAmount>=0?'income':'expense'
    rows.push({date,type,description,amount:Math.abs(num(signedAmount)),operation_id:operationId,balance_after:balanceAfter})
  }
  const summary={
    holder,
    period:(flat.match(/Per[ií]odo:\s*De\s*(\d{2}-\d{2}-\d{4})\s*(?:a|al)\s*(\d{2}-\d{2}-\d{4})/i)||[]).slice(1),
    initial_balance:moneyFromText((flat.match(/Saldo inicial:\s*(R\$\s*[+-]?[\d.]+,\d{2})/i)||[])[1]||''),
    entries:moneyFromText((flat.match(/Entradas:\s*(R\$\s*[+-]?[\d.]+,\d{2})/i)||[])[1]||''),
    outflows:moneyFromText((flat.match(/Sa[ií]das:\s*(R\$\s*[+-]?[\d.]+,\d{2})/i)||[])[1]||''),
    final_balance:moneyFromText((flat.match(/Saldo final:\s*(R\$\s*[+-]?[\d.]+,\d{2})/i)||[])[1]||'')
  }
  return {rows,statement:summary}
}

function parseBenefitDocument(text) {
  const lines=String(text).split(/\n+/).map((x)=>x.trim()).filter(Boolean)
  const rows=[]; let year=Number(state.month.split('-')[0]); let current=null
  const head=String(text).match(/(JANEIRO|FEVEREIRO|MAR[ÇC]O|ABRIL|MAIO|JUNHO|JULHO|AGOSTO|SETEMBRO|OUTUBRO|NOVEMBRO|DEZEMBRO)\s*\/?\s*(20\d{2})/i)
  if (head) year=Number(head[2])
  const flush=()=>{
    if(!current)return
    const block=current.lines.join(' ')
    const u=normalizeSearchText(block)
    const matches=[...block.matchAll(/([+-])\s*R\$\s*([\d.]+,\d{2})/gi)]
    const seen=new Set()
    for(const m of matches){
      const amount=Math.abs(parseMoneyInput(m[2])); if(!amount)continue
      const key=`${m[1]}|${amount.toFixed(2)}`
      if(seen.has(key)) continue
      seen.add(key)
      const isCredit=m[1]==='+'
      let desc=isCredit?'Crédito do benefício':'Compra com cartão alimentação'
      if (u.includes('ASSAI')) desc='Assaí Atacadista'
      else if (u.includes('ZONA SUL')) desc='Zona Sul'
      else if (u.includes('EMGEPRON') || u.includes('BENEFICIO BASE')) desc='EMGEPRON · Benefício Base'
      rows.push({date:current.date,type:isCredit?'benefit_credit':'expense',description:desc,amount})
    }
  }
  for(const line of lines){
    const d=line.match(/(?:segunda-feira|ter[cç]a-feira|quarta-feira|quinta-feira|sexta-feira|s[aá]bado|domingo)?\s*,?\s*(\d{1,2})\s+de\s+([A-Za-zÀ-ÿ]+)/i)
    if(d){ flush(); current={date:isoFromPtDay(d[1],d[2],year),lines:[]}; continue }
    if(current) current.lines.push(line)
  }
  flush()
  return rows
}
function parseDocument(text,type) {
  if (type==='third_party') return { rows:parseThirdPartyDocument(text) }
  if (type==='cofrinho') return parseCofrinhoDocument(text)
  if (type==='benefit') return { rows:parseBenefitDocument(text) }
  if (type==='bank_pdf') return parseMercadoPagoStatementDocument(text)
  return { rows:[] }
}
function documentRowHtml(row,index,type,entryId) {
  const typeOptions = type==='cofrinho'
    ? [['contribution','Aporte / reservado'],['withdrawal','Resgate / retirado'],['income','Rendimento']]
    : type==='benefit' ? [['benefit_credit','Crédito do benefício'],['expense','Compra']]
    : type==='bank_pdf' ? [['transfer_in','Transferência recebida'],['transfer_out','Transferência enviada'],['contribution','Reserva no Cofrinho'],['withdrawal','Resgate do Cofrinho'],['expense','Despesa (revisar)'],['income','Entrada (revisar)']]
    : [['third_party','Despesa paga por terceiro']]
  return `<div class="document-row"><input data-doc-entry="${entryId}" data-doc-date="${index}" type="date" value="${esc(row.date||'')}"><select data-doc-entry="${entryId}" data-doc-type="${index}">${typeOptions.map(([v,l])=>`<option value="${v}" ${row.type===v?'selected':''}>${l}</option>`).join('')}</select><input data-doc-entry="${entryId}" data-doc-desc="${index}" value="${esc(row.description||'')}" placeholder="Descrição"><input data-doc-entry="${entryId}" data-doc-amount="${index}" inputmode="decimal" value="${num(row.amount).toLocaleString('pt-BR',{minimumFractionDigits:2})}" placeholder="0,00"><button data-doc-remove="${entryId}:${index}" class="icon-button" type="button" title="Remover">×</button></div>`
}
function syncDocumentRowsFromDom(entry) {
  entry.rows.forEach((r,i)=>{
    const q=(attr)=>document.querySelector(`[data-doc-entry="${entry.id}"][${attr}="${i}"]`)
    const d=q('data-doc-date'); const t=q('data-doc-type'); const desc=q('data-doc-desc'); const a=q('data-doc-amount')
    if(d)r.date=d.value; if(t)r.type=t.value; if(desc)r.description=desc.value; if(a)r.amount=Math.abs(parseMoneyInput(a.value)||0)
  })
}
function removeDocumentFile(id) {
  const doc=state.import?.document; if(!doc)return
  doc.files=doc.files.filter((x)=>x.id!==id); renderImport()
}
function reparseDocumentEntry(entry) {
  entry.detectedType=entry.hint==='auto'?detectDocumentType(entry.text,'auto'):entry.hint
  const parsed=parseDocument(entry.text,entry.detectedType)
  entry.rows=parsed.rows||[]; entry.balance=parsed.balance??null; entry.benchmark=parsed.benchmark??null; entry.statement=parsed.statement||null; entry.status='parsed'; entry.message=''
  if (!entry.rows.length && entry.detectedType!=='receipt' && !(entry.detectedType==='cofrinho' && entry.balance!=null)) entry.message='Arquivo lido, mas sem movimentações identificadas com segurança. Você pode adicionar linhas manualmente.'
}
async function analyzeFinancialDocuments() {
  const imp=state.import; imp.document ??= defaultDocumentState(); const doc=imp.document
  if (!doc.files.length) { doc.message='Escolha um ou mais PDFs, JPGs ou PNGs primeiro.'; renderImport(); return }
  const btn=$('analyzeDocumentBtn'); setBusy(btn,true,'Lendo documentos')
  let ok=0, failed=0
  try {
    doc.message='';
    for (let i=0;i<doc.files.length;i++) {
      const entry=doc.files[i]
      entry.status='reading'; entry.message=''; entry.progress='Preparando leitura…'; doc.progress=`Documento ${i+1} de ${doc.files.length}: ${entry.file.name}`; renderDocumentProgressOnly(doc)
      try {
        const text=await extractDocumentText(entry.file,(pct)=>{ entry.progress=`${pct}%`; doc.progress=`Documento ${i+1} de ${doc.files.length}: ${entry.file.name} · ${pct}%`; renderDocumentProgressOnly(doc) })
        entry.text=text; entry.hint=entry.hint||doc.hint||'auto'; reparseDocumentEntry(entry); entry.progress=''; ok++
      } catch(err) { entry.status='error'; entry.message=humanError(err); entry.progress=''; failed++ }
    }
    doc.progress=''; doc.message=failed?`${ok} documento(s) lido(s); ${failed} precisam de atenção.`:`${ok} documento(s) prontos para conferência.`; renderImport()
  } finally { setBusy($('analyzeDocumentBtn'),false) }
}
function renderDocumentProgressOnly(doc) { const el=$('documentProgress'); if(el){el.textContent=doc.progress||''; setHidden(el,!doc.progress)} }
async function uploadDocumentFile(entry) {
  const user=state.session.user; const safe=entry.file.name.replace(/[^a-zA-Z0-9._-]+/g,'-'); const path=`${user.id}/documents/${Date.now()}-${Math.random().toString(36).slice(2,7)}-${safe}`
  const { error:upErr }=await supabase.storage.from('finance-files').upload(path,entry.file,{upsert:false,contentType:entry.file.type||undefined}); if(upErr)throw upErr
  const account = entry.detectedType==='cofrinho' ? state.accounts.find((a)=>a.name==='Mercado Pago - Cofrinho') : entry.detectedType==='benefit' ? benefitAccount() : entry.detectedType==='bank_pdf' ? state.accounts.find((a)=>a.name==='Mercado Pago - Saldo') : null
  const { data,error }=await supabase.from('financial_documents').insert({user_id:user.id,account_id:account?.id||null,file_name:entry.file.name,storage_path:path,mime_type:entry.file.type||null,document_type:entry.detectedType||'other',parse_status:'parsed',extracted_text:(entry.text||'').slice(0,50000),extracted_data:{rows:entry.rows,balance:entry.balance,benchmark:entry.benchmark,statement:entry.statement||null}}).select().single(); if(error)throw error
  return data
}
async function ensureCofrinhoPosition() {
  const account=state.accounts.find((a)=>a.name==='Mercado Pago - Cofrinho') || state.accounts.find((a)=>a.institution==='mercado_pago' && a.account_type==='savings')
  if(!account) throw new Error('Conta Mercado Pago - Cofrinho não encontrada.')
  let p=state.investmentPositions.find((x)=>x.account_id===account.id && /cofrinho/i.test(x.name))
  if(p) return p
  const {data,error}=await supabase.from('investment_positions').insert({user_id:state.session.user.id,account_id:account.id,name:'Mercado Pago · Cofrinho',asset_type:'cash_reserve',benchmark:'120% do CDI',liquidity_label:'Liquidez diária',invested_amount:0,current_value:0,metadata:{source:'document_import',auto_calculate_from_movements:true}}).select().single(); if(error)throw error
  state.investmentPositions.push(data)
  return data
}
async function refreshCofrinhoPrincipal(positionId) {
  const {data,error}=await supabase.from('investment_movements').select('movement_type,amount').eq('position_id',positionId); if(error)throw error
  const principal=(data||[]).reduce((sum,m)=>sum+(m.movement_type==='contribution'||m.movement_type==='transfer_in'?num(m.amount):m.movement_type==='withdrawal'||m.movement_type==='transfer_out'?-num(m.amount):0),0)
  const {error:uErr}=await supabase.from('investment_positions').update({invested_amount:Math.max(0,principal)}).eq('id',positionId); if(uErr)throw uErr
  return Math.max(0,principal)
}
function mercadoPagoSaldoAccount() {
  return state.accounts.find((a)=>a.name==='Mercado Pago - Saldo') || state.accounts.find((a)=>a.institution==='mercado_pago' && a.account_type==='wallet')
}
async function saveMercadoPagoStatement(entry) {
  const user=state.session.user
  const account=mercadoPagoSaldoAccount(); if(!account) throw new Error('Conta Mercado Pago - Saldo não encontrada.')
  const transferCat=state.categories.find((c)=>c.kind==='transfer'&&c.name==='Transferência interna') || state.categories.find((c)=>c.kind==='transfer')
  const expenseCat=state.categories.find((c)=>c.kind==='expense'&&c.name==='Outras despesas') || state.categories.find((c)=>c.kind==='expense')
  const incomeCat=state.categories.find((c)=>c.kind==='income'&&c.name==='Outras receitas') || state.categories.find((c)=>c.kind==='income')
  let pos=null
  const holderU=normalizeSearchText(entry.statement?.holder||'')
  for(const r of entry.rows.filter((x)=>x.date&&x.amount)) {
    const opId=String(r.operation_id||'').trim()
    const sourceFingerprint=await sha256(opId?`mercado_pago|operation|${opId}`:`mercado_pago|${r.date}|${r.type}|${r.description}|${num(r.amount).toFixed(2)}`)
    const {data:existing,error:eErr}=await supabase.from('transactions').select('id').eq('source_fingerprint',sourceFingerprint).limit(1); if(eErr)throw eErr
    let signedAmount=Math.abs(num(r.amount)); let flowType='transfer'; let isInternal=true; let includeBudget=false; let categoryId=transferCat?.id||null; let review='reviewed'
    if(r.type==='contribution'){ signedAmount=-signedAmount }
    else if(r.type==='withdrawal'){ signedAmount=signedAmount }
    else if(r.type==='transfer_in'){ signedAmount=signedAmount }
    else if(r.type==='transfer_out'){ signedAmount=-signedAmount }
    else if(r.type==='expense'){ signedAmount=-signedAmount; flowType='expense'; isInternal=false; includeBudget=true; categoryId=expenseCat?.id||null; review='needs_review' }
    else if(r.type==='income'){ signedAmount=signedAmount; flowType='income'; isInternal=false; includeBudget=false; categoryId=incomeCat?.id||null; review='needs_review' }
    if(!existing?.length){
      const {error}=await supabase.from('transactions').insert({user_id:user.id,account_id:account.id,category_id:categoryId,transaction_date:r.date,description:r.description||'Mercado Pago',amount:signedAmount,flow_type:flowType,is_internal_transfer:isInternal,include_in_budget:includeBudget,transaction_source:'import',source_record_id:opId||null,source_fingerprint:sourceFingerprint,review_status:review,metadata:{source:'mercado_pago_pdf',file_name:entry.file.name,operation_id:opId||null,balance_after:r.balance_after??null}}); if(error)throw error
    }
    if(r.type==='transfer_in' && holderU){
      const candidates=state.transactions.filter((t)=>t.transaction_date===r.date && num(t.amount)===-Math.abs(num(r.amount)) && accountById(t.account_id)?.institution==='inter' && normalizeSearchText(t.description||'').includes(holderU))
      if(candidates.length===1){
        const t=candidates[0]
        const {error}=await supabase.from('transactions').update({flow_type:'transfer',is_internal_transfer:true,include_in_budget:false,category_id:transferCat?.id||t.category_id,review_status:'reviewed',display_description:t.display_description||'Transferência para Mercado Pago',metadata:{...(t.metadata||{}),matched_mercado_pago_operation_id:opId||null}}).eq('id',t.id); if(error)throw error
      }
    }
    if(r.type==='contribution'||r.type==='withdrawal'){
      if(!pos)pos=await ensureCofrinhoPosition()
      const movementType=r.type
      const {data:existsMove,error:mErr}=await supabase.from('investment_movements').select('id').eq('position_id',pos.id).eq('movement_date',r.date).eq('movement_type',movementType).eq('amount',Math.abs(num(r.amount))).limit(1); if(mErr)throw mErr
      if(!existsMove?.length){ const {error}=await supabase.from('investment_movements').insert({user_id:user.id,position_id:pos.id,account_id:pos.account_id,movement_date:r.date,movement_type:movementType,amount:Math.abs(num(r.amount)),notes:r.description||null,metadata:{source:'mercado_pago_pdf',file_name:entry.file.name,operation_id:opId||null}}); if(error)throw error }
    }
  }
  if(pos){
    const invested=await refreshCofrinhoPrincipal(pos.id)
    const {data:mov,error:mErr}=await supabase.from('investment_movements').select('movement_type,amount').eq('position_id',pos.id); if(mErr)throw mErr
    const income=(mov||[]).reduce((sum,m)=>sum+(m.movement_type==='income'?num(m.amount):0),0)
    const current=Math.max(0,invested+income)
    const {error}=await supabase.from('investment_positions').update({invested_amount:invested,current_value:current}).eq('id',pos.id); if(error)throw error
    await saveAccountBalanceSnapshot(pos.account_id,current,new Date().toISOString().slice(0,10),'system',{position_id:pos.id})
  }
  if(Number.isFinite(entry.statement?.final_balance)){
    let snapshotDate=[...entry.rows.map((x)=>x.date).filter(Boolean)].sort().at(-1)
    const periodEnd=entry.statement?.period?.[1]
    if(periodEnd){ const [dd,mm,yyyy]=periodEnd.split('-'); snapshotDate=`${yyyy}-${mm}-${dd}` }
    if(snapshotDate) await saveAccountBalanceSnapshot(account.id,entry.statement.final_balance,snapshotDate,'statement',{file_name:entry.file.name,document_type:'mercado_pago_pdf'})
  }
}

async function saveFinancialDocumentEntry(entry) {
  syncDocumentRowsFromDom(entry)
  const user=state.session.user
  if (entry.detectedType==='third_party') {
    const r=entry.rows[0]; if(!r?.date||!r.amount) throw new Error('Revise data e valor antes de confirmar.')
    const selectedCatId=document.querySelector(`[data-doc-third-cat="${entry.id}"]`)?.value
    const cat=state.categories.find((c)=>c.id===selectedCatId) || state.categories.find((c)=>c.kind==='expense' && c.name==='Aluguel + condomínio') || state.categories.find((c)=>c.kind==='expense' && c.group_name==='Moradia')
    if(!cat) throw new Error('Categoria de despesa não encontrada.')
    const virtual=state.accounts.find((a)=>a.account_type==='virtual')
    if(virtual){ const {data:exists,error:qErr}=await supabase.from('transactions').select('id').eq('account_id',virtual.id).eq('transaction_date',r.date).eq('flow_type','expense').eq('amount',-Math.abs(r.amount)).limit(1); if(qErr)throw qErr; if(!exists?.length){ const {error}=await supabase.rpc('record_third_party_expense',{p_date:r.date,p_amount:r.amount,p_description:r.description||'Pagamento por terceiro',p_category_id:cat.id,p_notes:`Importado de ${entry.file.name}`}); if(error)throw error } }
    else { const {error}=await supabase.rpc('record_third_party_expense',{p_date:r.date,p_amount:r.amount,p_description:r.description||'Pagamento por terceiro',p_category_id:cat.id,p_notes:`Importado de ${entry.file.name}`}); if(error)throw error }
  } else if (entry.detectedType==='cofrinho') {
    const pos=await ensureCofrinhoPosition(); const account=state.accounts.find((a)=>a.id===pos.account_id)
    for (const r of entry.rows.filter((x)=>x.date&&x.amount)) {
      const {data:exists,error:qErr}=await supabase.from('investment_movements').select('id').eq('position_id',pos.id).eq('movement_date',r.date).eq('movement_type',r.type).eq('amount',r.amount).limit(1); if(qErr)throw qErr
      if(!exists?.length){ const {error}=await supabase.from('investment_movements').insert({user_id:user.id,position_id:pos.id,account_id:account.id,movement_date:r.date,movement_type:r.type,amount:r.amount,notes:r.description||null,metadata:{source:'cofrinho_print',file_name:entry.file.name}}); if(error)throw error }
    }
    const invested=await refreshCofrinhoPrincipal(pos.id)
    if(entry.balance!=null){ const snapshotDate=[...entry.rows.map((x)=>x.date).filter(Boolean)].sort().at(-1) || new Date().toISOString().slice(0,10); const {error}=await supabase.from('investment_positions').update({current_value:entry.balance,benchmark:entry.benchmark||pos.benchmark||null,invested_amount:invested}).eq('id',pos.id); if(error)throw error; const {error:sErr}=await supabase.from('investment_snapshots').upsert({user_id:user.id,position_id:pos.id,snapshot_date:snapshotDate,invested_principal:invested,market_value:entry.balance},{onConflict:'position_id,snapshot_date'}); if(sErr)throw sErr; await saveAccountBalanceSnapshot(account.id,entry.balance,snapshotDate,'document',{file_name:entry.file.name,document_type:'cofrinho'}) }
  } else if (entry.detectedType==='bank_pdf') {
    await saveMercadoPagoStatement(entry)
  } else if (entry.detectedType==='benefit') {
    const account=benefitAccount(); if(!account)throw new Error('Conta Cartão Alimentação não encontrada.')
    const expenseCat=state.categories.find((c)=>c.kind==='expense'&&c.name==='Mercado') || state.categories.find((c)=>c.kind==='expense'&&c.group_name==='Alimentação')
    const incomeCat=state.categories.find((c)=>c.kind==='income'&&c.name==='Benefício alimentação') || state.categories.find((c)=>c.kind==='income'&&c.group_name==='Benefícios') || state.categories.find((c)=>c.kind==='income')
    for(const r of entry.rows.filter((x)=>x.date&&x.amount)) {
      const credit=r.type==='benefit_credit'; const amount=credit?Math.abs(r.amount):-Math.abs(r.amount); const description=r.description|| (credit?'Crédito do benefício':'Compra com cartão alimentação')
      const {data:exists,error:qErr}=await supabase.from('transactions').select('id').eq('account_id',account.id).eq('transaction_date',r.date).eq('amount',amount).eq('description',description).limit(1); if(qErr)throw qErr
      if(!exists?.length){ const {error}=await supabase.from('transactions').insert({user_id:user.id,account_id:account.id,category_id:credit?incomeCat?.id:expenseCat?.id,transaction_date:r.date,description,amount,flow_type:credit?'income':'expense',is_internal_transfer:false,include_in_budget:!credit,transaction_source:'receipt',review_status:'needs_review',metadata:{source:'benefit_print',file_name:entry.file.name,ocr_import:true}}); if(error)throw error }
    }
  } else if (entry.detectedType!=='receipt') throw new Error('Escolha o tipo do documento antes de confirmar.')
  await uploadDocumentFile(entry)
}
async function confirmFinancialDocuments() {
  const doc=state.import?.document; if(!doc?.files?.length)return
  const ready=doc.files.filter((x)=>x.status==='parsed'); if(!ready.length){doc.message='Analise os documentos antes de confirmar.';renderImport();return}
  const btn=$('confirmDocumentBtn'); setBusy(btn,true,'Salvando lote')
  let saved=0,failed=0
  for(const entry of ready){
    try{ await saveFinancialDocumentEntry(entry); entry.status='saved'; entry.message='Salvo'; saved++ }
    catch(err){ entry.status='error'; entry.message=humanError(err); failed++ }
  }
  try{
    doc.message=failed?`${saved} documento(s) salvos; ${failed} precisam de correção.`:`${saved} documento(s) salvos com sucesso.`
    await loadData()
    if(!failed){ toast(`${saved} documento(s) processados com sucesso.`, 'success'); state.import=defaultImportState('document'); navigate(ready.some((x)=>x.detectedType==='cofrinho')?'investments':'overview') }
    else renderImport()
  } finally { setBusy($('confirmDocumentBtn'),false) }
}
function renderDocumentFileHeader(entry) {
  const status=entry.status==='parsed'?'✓':entry.status==='error'?'!':entry.status==='reading'?'…':'•'
  const cls=entry.status==='parsed'?'success':entry.status==='error'?'error':''
  const label=entry.detectedType?documentTypeLabel(entry.detectedType):'Aguardando análise'
  return `<div class="batch-file-card ${cls}"><div class="batch-file-status">${status}</div><div class="batch-file-main"><strong>${esc(entry.file.name)}</strong><span>${(entry.file.size/1024).toFixed(1)} KB · ${esc(label)}</span>${entry.message?`<div class="batch-file-message">${esc(entry.message)}</div>`:''}</div><div class="batch-file-actions"><button class="icon-button" data-doc-file-remove="${entry.id}" type="button" title="Remover">×</button></div></div>`
}
function renderDocumentDetail(entry,expenseCats) {
  if(entry.status!=='parsed')return ''
  const type=entry.detectedType
  const typeOptions=[['auto','Identificar automaticamente'],['bank_pdf','Mercado Pago · Extrato em PDF'],['cofrinho','Mercado Pago · Cofrinho'],['third_party','Pagamento por terceiro'],['benefit','Cartão alimentação'],['receipt','Nota fiscal / cupom']]
  return `<div class="document-batch-detail"><div class="document-batch-head"><div><small>CONFERÊNCIA</small><strong>${esc(entry.file.name)}</strong></div><select data-doc-file-type="${entry.id}">${typeOptions.map(([v,l])=>`<option value="${v}" ${(entry.hint==='auto'?type:entry.hint)===v || (v===type&&entry.hint==='auto')?'selected':''}>${l}</option>`).join('')}</select></div>
    ${type==='receipt'?'<div class="batch-empty-note">A nota será guardada de forma privada. Depois, abra a compra correspondente em <strong>Compras</strong> para vinculá-la e detalhar os itens.</div>':`<div class="document-rows">${entry.rows.map((r,i)=>documentRowHtml(r,i,type,entry.id)).join('')||'<div class="batch-empty-note">Nenhuma linha identificada. Adicione manualmente.</div>'}</div><button data-doc-add-row="${entry.id}" class="button small" type="button">＋ Adicionar linha</button>`}
    ${type==='third_party'?`<label class="field-label" style="margin-top:14px">Categoria da despesa<select data-doc-third-cat="${entry.id}">${expenseCats.map((c)=>`<option value="${c.id}" ${c.name==='Aluguel + condomínio'?'selected':''}>${esc(c.group_name)} · ${esc(c.name)}</option>`).join('')}</select></label>`:''}
    ${type==='cofrinho'&&entry.balance!=null?`<div class="document-balance"><span>Saldo identificado no Cofrinho</span><strong>${money.format(entry.balance)}</strong>${entry.benchmark?`<small>${esc(entry.benchmark)}</small>`:''}</div>`:''}
    ${type==='bank_pdf'&&entry.statement?`<div class="document-balance"><span>Extrato Mercado Pago identificado</span><strong>${entry.rows.length} movimentações</strong><small>${entry.statement.period?.length===2?`${esc(entry.statement.period[0])} a ${esc(entry.statement.period[1])}`:'Período identificado pelo PDF'} · saldo final ${Number.isFinite(entry.statement.final_balance)?money.format(entry.statement.final_balance):'—'}</small></div>`:''}
  </div>`
}
function renderDocumentImport(kindPicker) {
  const imp=state.import; imp.document ??= defaultDocumentState(); const doc=imp.document
  const expenseCats=state.categories.filter((c)=>c.kind==='expense'); const parsed=doc.files.filter((x)=>x.status==='parsed').length
  $('mainArea').innerHTML=`<div class="content-stack">${kindPicker}<section class="dashboard-grid import-grid"><div class="panel">${panelHead('Comprovantes e prints','Selecione vários PDFs, JPGs ou PNGs de uma vez. Cada documento é lido separadamente e uma falha não bloqueia os demais.')}
    <label class="field-label">Tipo padrão<select id="documentHint"><option value="auto" ${doc.hint==='auto'?'selected':''}>Identificar automaticamente</option><option value="bank_pdf" ${doc.hint==='bank_pdf'?'selected':''}>Mercado Pago · Extrato em PDF</option><option value="cofrinho" ${doc.hint==='cofrinho'?'selected':''}>Mercado Pago · Cofrinho</option><option value="third_party" ${doc.hint==='third_party'?'selected':''}>Pagamento por terceiro</option><option value="benefit" ${doc.hint==='benefit'?'selected':''}>Cartão alimentação</option><option value="receipt" ${doc.hint==='receipt'?'selected':''}>Nota fiscal / cupom</option></select></label>
    <label class="dropzone document-dropzone"><div class="drop-icon">▧</div><strong>${doc.files.length?'Adicionar mais documentos':'Escolher vários PDFs, JPGs ou PNGs'}</strong><span>${doc.files.length?`${doc.files.length} arquivo(s) no lote`:'Extratos Mercado Pago, comprovantes, prints do Cofrinho, cartão alimentação e notas fiscais'}</span><input id="documentFile" type="file" multiple accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"></label>
    <div class="batch-file-list">${doc.files.map(renderDocumentFileHeader).join('')}</div>
    <button id="analyzeDocumentBtn" class="button primary full" type="button" ${doc.files.length?'':'disabled'}>✦ Analisar ${doc.files.length||''} documento${doc.files.length===1?'':'s'}</button><div id="documentProgress" class="document-progress ${doc.progress?'':'hidden'}">${esc(doc.progress)}</div><div class="form-message ${doc.message?'':'hidden'}">${esc(doc.message)}</div>
    ${doc.files.map((x)=>renderDocumentDetail(x,expenseCats)).join('')}
    ${parsed?`<button id="confirmDocumentBtn" class="button primary full" type="button">✓ Confirmar ${parsed} documento${parsed===1?'':'s'}</button>`:''}</div>
    <div class="panel">${panelHead('O lote se organiza sozinho','Misture Cofrinho, aluguel, benefício e notas. O sistema identifica cada arquivo e você corrige só as exceções.')}<div class="check-list">${checkItem('Vários prints do Cofrinho','Períodos sobrepostos são seguros: aportes, resgates e rendimentos iguais são ignorados se já existirem.')}${checkItem('Vários comprovantes de aluguel','Cada comprovante mantém sua própria data e valor e entra como pagamento por terceiro.')}${checkItem('Cartão alimentação','Créditos e compras repetidos já registrados são ignorados na confirmação.')}${checkItem('Falha isolada','Se uma imagem estiver ilegível, os outros documentos continuam disponíveis para salvar.')}</div><div class="privacy-note"><strong>Leitura local</strong><span>Imagens são lidas no seu navegador para montar a prévia. Cada arquivo só é enviado ao seu espaço privado no Supabase depois da confirmação.</span></div></div></section></div>`
  bindImportKindPicker()
  $('documentHint').addEventListener('change',()=>{doc.hint=$('documentHint').value; doc.files.forEach((entry)=>{entry.hint=doc.hint; if(entry.text){reparseDocumentEntry(entry)}}); renderImport()})
  $('documentFile').addEventListener('change',(e)=>addDocumentFiles(e.target.files))
  $('analyzeDocumentBtn')?.addEventListener('click',analyzeFinancialDocuments)
  document.querySelectorAll('[data-doc-file-remove]').forEach((b)=>b.addEventListener('click',()=>removeDocumentFile(b.dataset.docFileRemove)))
  document.querySelectorAll('[data-doc-file-type]').forEach((s)=>s.addEventListener('change',()=>{const entry=doc.files.find((x)=>x.id===s.dataset.docFileType); if(!entry)return; syncDocumentRowsFromDom(entry); entry.hint=s.value; reparseDocumentEntry(entry); renderImport()}))
  document.querySelectorAll('[data-doc-add-row]').forEach((b)=>b.addEventListener('click',()=>{const entry=doc.files.find((x)=>x.id===b.dataset.docAddRow); if(!entry)return; syncDocumentRowsFromDom(entry); const type=entry.detectedType; entry.rows.push({date:`${state.month}-01`,type:type==='cofrinho'?'income':type==='benefit'?'expense':'third_party',description:'',amount:0}); renderImport()}))
  document.querySelectorAll('[data-doc-remove]').forEach((b)=>b.addEventListener('click',()=>{const [id,idx]=b.dataset.docRemove.split(':'); const entry=doc.files.find((x)=>x.id===id); if(!entry)return; syncDocumentRowsFromDom(entry); entry.rows.splice(Number(idx),1); renderImport()}))
  $('confirmDocumentBtn')?.addEventListener('click',confirmFinancialDocuments)
}

function importEntryStatus(entry) {
  if (entry.status === 'error') return { cls: 'error', icon: '!', label: 'Arquivo com erro' }
  if (entry.status === 'unsupported') return { cls: 'warning', icon: '?', label: 'Formato ainda não suportado' }
  if (entry.status === 'needs_source') return { cls: 'warning', icon: '?', label: 'Origem precisa ser confirmada' }
  if (entry.status === 'parsed') return { cls: 'success', icon: '✓', label: 'Analisado' }
  return { cls: 'success', icon: '✓', label: 'Origem identificada' }
}
function importFileCard(entry) {
  const st = importEntryStatus(entry)
  const account = state.accounts.find((a) => a.id === entry.accountId)
  const accounts = bankImportAccounts()
  const source = entry.detected?.label || (account ? sourceLabel(account) : 'Origem não identificada')
  const rows = entry.rows || []
  const fresh = rows.filter((r) => !r.duplicate).length
  const dup = rows.filter((r) => r.duplicate).length
  return `<article class="batch-file-card ${st.cls}">
    <div class="batch-file-status">${st.icon}</div>
    <div class="batch-file-main"><strong title="${esc(entry.file.name)}">${esc(entry.file.name)}</strong><span>${(entry.file.size / 1024).toFixed(1)} KB · ${esc(st.label)}</span>
      <div class="batch-source-line"><b>${esc(source)}</b>${entry.status === 'parsed' ? `<span>${fresh} novas · ${dup} duplicadas</span>` : ''}</div>
      ${entry.message ? `<small class="batch-file-message">${esc(entry.message)}</small>` : ''}
      ${entry.manualSource || entry.status === 'needs_source' ? `<label class="batch-source-select">Origem<select data-batch-account="${entry.id}"><option value="">Selecione</option>${accounts.map((a) => `<option value="${a.id}" ${a.id === entry.accountId ? 'selected' : ''}>${esc(sourceLabel(a))}</option>`).join('')}</select></label>` : ''}
    </div>
    <div class="batch-file-actions">${entry.detected && !entry.manualSource ? `<button class="text-button" data-correct-batch="${entry.id}" type="button">Corrigir</button>` : ''}<button class="icon-button" data-remove-batch="${entry.id}" type="button" title="Remover">×</button></div>
  </article>`
}
function renderImport() {
  state.import ??= defaultImportState('bank')
  const imp = state.import
  const kindPicker = renderImportKindPicker(imp)

  if (imp.kind === 'document') { renderDocumentImport(kindPicker); return }

  if (imp.kind === 'benefit') {
    const account = benefitAccount()
    $('mainArea').innerHTML = `<div class="content-stack">${kindPicker}<section class="dashboard-grid import-grid"><div class="panel">${panelHead('Cartão Alimentação', 'Aqui o benefício fica separado da sua renda em dinheiro, mas entra normalmente na análise de consumo.')}
      <div class="import-action-stack"><button id="benefitExpense" class="import-action-card" type="button"><span class="action-orb">−</span><div><strong>Registrar uma compra</strong><p>Use para compras pagas com o cartão alimentação.</p></div><b>→</b></button><button id="benefitIncome" class="import-action-card" type="button"><span class="action-orb positive">+</span><div><strong>Registrar crédito do benefício</strong><p>Ex.: crédito mensal “Benefício Base”.</p></div><b>→</b></button></div>
      ${account ? `<div class="detected-source neutral"><span class="detected-icon">✓</span><div><small>CONTA VINCULADA</small><strong>${esc(account.name)}</strong><span>O saldo do benefício não é somado à sua renda bancária.</span></div></div>` : '<div class="form-message">Não encontrei uma conta do tipo Benefício. Crie uma em Contas antes de registrar.</div>'}</div>
      <div class="panel">${panelHead('Por que fica separado?', 'O benefício financia consumo, mas não é dinheiro disponível na sua conta corrente.')}<div class="check-list">${checkItem('Sem inflar salário', 'O crédito do benefício aparece separado das entradas em dinheiro.')}${checkItem('Consumo completo', 'As compras ainda contam normalmente em Alimentação e nas demais categorias.')}${checkItem('Compra agrupada', 'Depois, uma compra pode juntar cartão alimentação + débito em um único total.')}${checkItem('Extrato estruturado', 'Quando tivermos um arquivo exportável desse cartão, adicionamos a leitura automática sem mudar esta tela.')}</div></div></section></div>`
    bindImportKindPicker()
    if ($('benefitExpense')) $('benefitExpense').addEventListener('click', () => openEntryModal({ mode: 'expense', accountId: account?.id || '' }))
    if ($('benefitIncome')) $('benefitIncome').addEventListener('click', () => openEntryModal({ mode: 'income', accountId: account?.id || '', description: 'Benefício Base' }))
    return
  }

  if (imp.kind === 'third_party') {
    $('mainArea').innerHTML = `<div class="content-stack">${kindPicker}<section class="dashboard-grid import-grid"><div class="panel">${panelHead('Pagamento por terceiro', 'Registre despesas que são suas, mas foram pagas diretamente antes do dinheiro passar pelas suas contas.')}
      <div class="third-party-hero"><div class="third-party-hero-icon">⌂</div><div><span class="eyebrow">VISÃO FINANCEIRA REAL</span><h3>O gasto aparece. Seu saldo bancário não muda.</h3><p>Ideal para aluguel, condomínio ou outra obrigação paga diretamente por uma terceira pessoa.</p></div></div><button id="thirdPartyEntry" class="button primary full" type="button">＋ Registrar pagamento por terceiro</button></div>
      <div class="panel">${panelHead('Como será registrado', 'Criamos um par financeiro que preserva a leitura econômica sem inventar movimento bancário.')}<div class="third-party-flow"><div><small>RECURSO DESTINADO</small><strong>＋ Receita via terceiro</strong></div><span>→</span><div><small>DESPESA REAL</small><strong>− Moradia / categoria escolhida</strong></div></div><div class="check-list">${checkItem('Impacto bancário zero', 'Inter e Mercado Pago permanecem com os saldos reais.')}${checkItem('Orçamento correto', 'A despesa entra nos gráficos, médias e orçamento do mês.')}${checkItem('Comprovante opcional', 'Podemos vincular o comprovante ao lançamento posteriormente.')}</div></div></section></div>`
    bindImportKindPicker()
    $('thirdPartyEntry').addEventListener('click', () => openEntryModal({ mode: 'third_party', description: 'Aluguel + condomínio' }))
    return
  }

  const steps = `<section class="import-steps">${step('1', 'Arquivos', imp.step)}<div class="step-line"></div>${step('2', 'Conferência', imp.step)}<div class="step-line"></div>${step('3', 'Concluído', imp.step)}</section>`
  if (imp.step === 1) {
    const count = imp.files.length
    const ready = imp.files.filter((x) => x.status === 'ready' || (x.accountId && x.status === 'needs_source')).length
    $('mainArea').innerHTML = `<div class="content-stack">${kindPicker}${steps}<section class="dashboard-grid import-grid"><div class="panel">${panelHead('Envie todos os extratos juntos', 'Selecione junho, julho, agosto ou arquivos com períodos sobrepostos. O sistema organiza e deduplica antes de gravar.')}
      <label class="dropzone batch-dropzone"><div class="drop-icon">⇧</div><strong>${count ? 'Adicionar mais arquivos' : 'Escolher vários arquivos'}</strong><span>OFX ou CSV · vários arquivos de uma vez</span><input id="importFiles" type="file" accept=".ofx,.csv,text/csv" multiple></label>
      ${count ? `<div class="batch-file-list">${imp.files.map(importFileCard).join('')}</div>` : '<div class="batch-empty-note">Você pode selecionar extratos de meses diferentes e também versões acumuladas. Duplicidades serão removidas automaticamente.</div>'}
      <button id="analyzeBatchBtn" class="button primary full" type="button" ${ready ? '' : 'disabled'}>✦ Analisar ${ready || ''} arquivo${ready === 1 ? '' : 's'}</button><div id="importMessage" class="form-message ${imp.message ? '' : 'hidden'}">${esc(imp.message)}</div></div>
      <div class="panel">${panelHead('O lote se organiza sozinho', 'Cada arquivo é tratado separadamente. Um formato desconhecido não bloqueia os demais.')}<div class="check-list">${checkItem('Origem automática', 'Identificamos Inter Conta e Inter Cartão pelo conteúdo de cada arquivo.')}${checkItem('Períodos sobrepostos', 'Uma transação repetida em dois extratos aparece apenas uma vez.')}${checkItem('Falha isolada', 'Se um arquivo não puder ser lido, os demais continuam normalmente.')}${checkItem('Uma confirmação', 'Ao final você aprova todas as novas transações do lote de uma vez.')}</div></div></section></div>`
    bindImportKindPicker()
    $('importFiles').addEventListener('change', (e) => addImportFiles(e.target.files))
    document.querySelectorAll('[data-remove-batch]').forEach((b) => b.addEventListener('click', () => removeImportFile(b.dataset.removeBatch)))
    document.querySelectorAll('[data-correct-batch]').forEach((b) => b.addEventListener('click', () => {
      const entry = imp.files.find((x) => x.id === b.dataset.correctBatch); if (entry) { entry.manualSource = true; entry.status = 'needs_source'; renderImport() }
    }))
    document.querySelectorAll('[data-batch-account]').forEach((s) => s.addEventListener('change', () => {
      const entry = imp.files.find((x) => x.id === s.dataset.batchAccount); if (entry) { entry.accountId = s.value; entry.status = s.value ? 'ready' : 'needs_source'; entry.message = ''; renderImport() }
    }))
    $('analyzeBatchBtn').addEventListener('click', analyzeBatchImport)
    return
  }

  if (imp.step === 2) {
    const fresh = imp.rows.filter((r) => !r.duplicate)
    const dup = imp.rows.filter((r) => r.duplicate)
    const review = fresh.filter(needsImportReview)
    const filtered = imp.rows.filter((r) => imp.filter === 'all' || (imp.filter === 'review' && !r.duplicate && needsImportReview(r)) || (imp.filter === 'duplicates' && r.duplicate))
    const unsupported = imp.files.filter((x) => ['unsupported', 'error', 'needs_source'].includes(x.status))
    $('mainArea').innerHTML = `<div class="content-stack">${kindPicker}${steps}<section class="panel"><div class="review-head"><div><span class="eyebrow">PRÉVIA DO LOTE</span><h2>${fresh.length} novas · ${dup.length} duplicadas</h2><p class="muted">${imp.files.length} arquivo(s) analisado(s). Duplicidades incluem histórico já salvo e sobreposição entre arquivos deste lote.</p></div><button id="changeFiles" class="button" type="button">Voltar aos arquivos</button></div>
      <div class="review-summary">${summaryChip('Arquivos', imp.files.length)}${summaryChip('Novas', fresh.length)}${summaryChip('Duplicadas', dup.length)}${summaryChip('Para revisar', review.length)}</div>
      ${unsupported.length ? `<div class="batch-warning"><strong>${unsupported.length} arquivo(s) ficaram fora da importação.</strong><span>${unsupported.map((x) => esc(x.file.name)).join(' · ')}</span></div>` : ''}
      <div class="batch-mini-summary">${imp.files.map((x) => `<div><span>${esc(x.file.name)}</span><b>${esc(x.detected?.label || sourceLabel(state.accounts.find((a) => a.id === x.accountId)))}</b><small>${x.status === 'parsed' ? `${x.rows.filter((r) => !r.duplicate).length} novas · ${x.rows.filter((r) => r.duplicate).length} duplicadas` : esc(x.message || 'não analisado')}</small></div>`).join('')}</div>
      <div class="review-filter"><button class="filter-pill ${imp.filter === 'all' ? 'active' : ''}" data-review-filter="all" type="button">Todas</button><button class="filter-pill ${imp.filter === 'review' ? 'active' : ''}" data-review-filter="review" type="button">Só para revisar</button><button class="filter-pill ${imp.filter === 'duplicates' ? 'active' : ''}" data-review-filter="duplicates" type="button">Duplicadas</button></div><div class="review-table">${filtered.slice(0, 350).map(reviewRow).join('')}</div><div class="review-actions"><span>${review.length ? `${review.length} lançamento(s) podem ser revisados agora ou depois.` : 'Todas as novas transações têm categoria sugerida.'}</span><button id="confirmBatchImport" class="button primary" type="button" ${fresh.length ? '' : 'disabled'}>✓ Importar ${fresh.length} novas</button></div><div id="importMessage" class="form-message ${imp.message ? '' : 'hidden'}">${esc(imp.message)}</div></section></div>`
    bindImportKindPicker()
    $('changeFiles').addEventListener('click', () => {
      imp.step = 1; imp.message = ''; imp.rows = [];
      imp.files.forEach((entry) => { entry.rows = []; entry.status = entry.accountId ? 'ready' : 'needs_source'; entry.message = ''; });
      renderImport()
    })
    document.querySelectorAll('[data-review-filter]').forEach((b) => b.addEventListener('click', () => { imp.filter = b.dataset.reviewFilter; renderImport() }))
    document.querySelectorAll('[data-import-cat]').forEach((s) => s.addEventListener('change', () => {
      const row = imp.rows.find((r) => r._key === s.dataset.importCat)
      if (!row) return
      if (s.value === '__custom__') { openImportCustomCategoryModal(row._key); return }
      row.category_id = s.value || null; row.userEdited = true; renderImport()
    }))
    $('confirmBatchImport').addEventListener('click', confirmBatchImport)
    return
  }

  const result = imp.result || { imported: 0, duplicates: 0, filesImported: 0, filesSkipped: 0, errors: [] }
  $('mainArea').innerHTML = `<div class="content-stack">${kindPicker}${steps}<section class="panel success-panel"><div class="success-icon">✓</div><h2>Lote processado.</h2><p>${result.imported} nova(s) transação(ões) adicionada(s). ${result.duplicates} duplicada(s) foram ignoradas.</p><div class="review-summary compact">${summaryChip('Arquivos importados', result.filesImported)}${summaryChip('Arquivos sem novidade', result.filesSkipped)}${summaryChip('Transações novas', result.imported)}</div>${result.errors?.length ? `<div class="batch-warning"><strong>Alguns arquivos precisam de atenção</strong><span>${result.errors.map((x) => esc(x)).join(' · ')}</span></div>` : ''}<div class="section-actions" style="justify-content:center"><button id="goTransactions" class="button" type="button">Revisar transações</button><button id="importAgain" class="button primary" type="button">Importar outro lote</button></div></section></div>`
  bindImportKindPicker()
  $('goTransactions').addEventListener('click', () => navigate('transactions'))
  $('importAgain').addEventListener('click', () => { state.import = defaultImportState('bank'); renderImport() })
}
function step(n, label, current) { const done = current > Number(n), active = current === Number(n); return `<div class="step ${done ? 'done' : ''} ${active ? 'active' : ''}"><span>${done ? '✓' : n}</span><strong>${esc(label)}</strong></div>` }
function checkItem(title, text) { return `<div class="check-item"><div>✓</div><p><strong>${esc(title)}</strong><span>${esc(text)}</span></p></div>` }
function summaryChip(label, value) { return `<div class="summary-chip"><span>${esc(label)}</span><strong>${value}</strong></div>` }
function importCategoryName(r) { return categoryById(r.category_id)?.name || '' }
function needsImportReview(r) { return !r.category_id || ['Outras despesas','Outras receitas'].includes(importCategoryName(r)) }
function customRulePatternForRow(r) { return String(r.merchant || r.description || '').trim().slice(0, 120) }

function reviewRow(r) {
  const cats = state.categories.filter((c) => r.flow_type === 'expense' ? c.kind === 'expense' : ['income', 'yield'].includes(r.flow_type) ? c.kind === 'income' : c.kind === 'transfer')
  const entry = state.import?.files?.find((x) => x.id === r.fileId)
  const account = state.accounts.find((a) => a.id === r.accountId)
  return `<div class="review-row ${r.duplicate ? 'duplicate' : ''}"><div class="review-main"><strong>${esc(r.description)}</strong><span>${esc(dateFmt.format(parseDate(r.transaction_date)))} · ${esc(sourceLabel(account))} · ${r.duplicate ? 'já existe' : needsImportReview(r) ? 'precisa revisar' : 'categorizada'}</span><small>${esc(entry?.file.name || '')}</small></div><select data-import-cat="${r._key}" ${r.duplicate ? 'disabled' : ''}><option value="">Sem categoria</option>${cats.map((c) => `<option value="${c.id}" ${c.id === r.category_id ? 'selected' : ''}>${esc(c.group_name)} · ${esc(c.name)}</option>`).join('')}<option value="__custom__">＋ Outro / criar categoria…</option></select><span class="flow-chip">${r.is_internal_transfer ? 'Transferência' : esc(r.flow_type)}</span><span class="amount">${money.format(num(r.amount))}</span></div>`
}
function openImportCustomCategoryModal(rowKey) {
  const r = state.import?.rows?.find((x) => x._key === rowKey)
  if (!r) return
  const modal = $('modalHost')
  const kind = r.flow_type === 'income' || r.flow_type === 'yield' ? 'income' : r.flow_type === 'transfer' ? 'transfer' : r.flow_type === 'investment' ? 'investment' : 'expense'
  const groups = [...new Set(state.categories.filter((c) => c.kind === kind).map((c) => c.group_name))]
  const pattern = customRulePatternForRow(r)
  const entry = state.import.files.find((x) => x.id === r.fileId)
  const acc = accountById(r.accountId)
  modal.innerHTML = `<div class="modal-backdrop"><form id="customImportForm" class="modal"><div class="modal-head"><div><span class="eyebrow">ENSINAR CATEGORIA</span><h2>${esc(r.description)}</h2><div class="modal-sub">Você define uma vez; o sistema reaproveita depois.</div></div><button id="closeModal" class="icon-button" type="button">×</button></div><div class="form-grid"><label class="field-label">Grupo<select id="customImportGroup">${groups.map((g) => `<option value="${esc(g)}">${esc(g)}</option>`).join('')}<option value="Outros">Outros</option></select></label><label class="field-label">Nome da categoria<input id="customImportName" placeholder="Ex.: Mercado do condomínio" required></label></div><div class="learning-preview"><strong>Será aplicado automaticamente</strong><span>Todos os lançamentos deste lote com “${esc(pattern)}” receberão a nova categoria. A regra também valerá para os próximos extratos.</span></div><div id="customImportMessage" class="form-message hidden"></div><div class="modal-actions"><span class="muted">Origem: ${esc(entry?.detected?.label || sourceLabel(acc))}</span><div class="modal-actions-right"><button id="cancelModal" class="button" type="button">Cancelar</button><button class="button primary" type="submit">✓ Criar e aplicar</button></div></div></form></div>`
  const close = () => { modal.innerHTML = '' }
  $('closeModal').addEventListener('click', close); $('cancelModal').addEventListener('click', close)
  $('customImportForm').addEventListener('submit', async (e) => {
    e.preventDefault()
    const btn = e.submitter
    setBusy(btn, true, 'Aprendendo')
    try {
      const name = $('customImportName').value.trim(); const group = $('customImportGroup').value || 'Outros'
      if (!name) throw new Error('Escreva o nome da categoria.')
      const matchField = r.merchant ? 'merchant' : 'description'
      const { data, error } = await supabase.rpc('create_category_rule_and_reclassify', {
        p_group_name: group, p_category_name: name, p_kind: kind, p_institution: acc?.institution || '',
        p_match_field: matchField, p_pattern: pattern, p_flow_type: r.flow_type, p_set_internal_transfer: !!r.is_internal_transfer
      })
      if (error) throw error
      const categoryId = data?.category_id
      if (!categoryId) throw new Error('Não foi possível criar a categoria.')
      let cat = state.categories.find((c) => c.id === categoryId)
      if (!cat) { cat = { id: categoryId, user_id: state.session.user.id, name, group_name: group, kind, active: true }; state.categories.push(cat) }
      state.rules.push({ id: data?.rule_id || `local-${Date.now()}`, user_id: state.session.user.id, institution: acc?.institution || null, match_field: matchField, pattern, category_id: categoryId, active: true, priority: 25 })
      let applied = 0
      state.import.rows.forEach((row) => {
        const rowPattern = customRulePatternForRow(row)
        const rowAcc = accountById(row.accountId)
        if (!row.duplicate && rowPattern.toLowerCase() === pattern.toLowerCase() && (!acc?.institution || rowAcc?.institution === acc.institution)) {
          row.category_id = categoryId; row.userEdited = true; applied++
        }
      })
      close(); toast(`Categoria criada e aplicada a ${applied} lançamento(s) do lote.`, 'success'); renderImport()
    } catch (err) { showInfo('customImportMessage', humanError(err)); setBusy(btn, false) }
  })
}

function inferProfile(account, file) {
  const ext = file.name.toLowerCase().split('.').pop()
  if (account?.institution === 'inter' && account.account_type === 'credit_card') return 'inter_card_csv'
  if (account?.institution === 'inter' && account.account_type === 'checking' && ext === 'ofx') return 'inter_ofx'
  if (account?.institution === 'inter' && account.account_type === 'checking') return 'inter_checking_csv'
  return ''
}
async function parseImportEntry(entry) {
  const account = state.accounts.find((a) => a.id === entry.accountId)
  if (!account) throw new Error('Origem não definida')
  const profile = entry.manualSource ? inferProfile(account, entry.file) : (entry.detected?.profile || inferProfile(account, entry.file))
  entry.profile = profile
  if (!profile) {
    entry.status = 'unsupported'
    entry.message = account.institution === 'mercado_pago' ? 'Formato do Mercado Pago ainda não mapeado.' : 'Formato ainda não habilitado para essa origem.'
    return []
  }
  const { data, error } = await supabase.functions.invoke('parse-finance-import', { body: { profile, text: entry.fileText } })
  if (error) throw error
  return data?.rows || []
}
async function analyzeBatchImport() {
  const imp = state.import
  const candidates = imp.files.filter((x) => x.status !== 'error' && x.accountId)
  if (!candidates.length) { imp.message = 'Adicione pelo menos um arquivo com origem identificada.'; renderImport(); return }
  const btn = $('analyzeBatchBtn'); setBusy(btn, true, 'Analisando lote')
  imp.message = ''
  try {
    const parsedEntries = []
    for (const entry of candidates) {
      entry.message = ''
      try {
        const rows = await parseImportEntry(entry)
        if (entry.status === 'unsupported') continue
        entry._parsedRaw = rows
        parsedEntries.push(entry)
      } catch (err) {
        entry.status = 'error'
        entry.message = humanError(err)
      }
    }
    const allRaw = parsedEntries.flatMap((e) => e._parsedRaw || [])
    const fps = [...new Set(allRaw.map((r) => r.fingerprint).filter(Boolean))]
    const existing = []
    for (let i = 0; i < fps.length; i += 100) {
      const chunk = fps.slice(i, i + 100)
      const { data: found, error } = await supabase.from('transactions').select('source_fingerprint').in('source_fingerprint', chunk)
      if (error) throw error
      existing.push(...(found || []).map((x) => x.source_fingerprint))
    }
    const alreadySaved = new Set(existing)
    const seenInBatch = new Set()
    const catMap = new Map(state.categories.map((c) => [c.name, c.id]))
    const findRuleCategory = (r, entry) => {
      const acc = state.accounts.find((a) => a.id === entry.accountId)
      const rule = state.rules.find((rule) => {
        if (rule.institution && rule.institution !== acc?.institution) return false
        const value = rule.match_field === 'merchant' ? r.merchant : rule.match_field === 'counterparty' ? r.counterparty : r.description
        return value && String(value).trim().toLowerCase() === String(rule.pattern).trim().toLowerCase()
      })
      return rule?.category_id || null
    }
    imp.rows = []
    for (const entry of parsedEntries) {
      entry.rows = (entry._parsedRaw || []).map((r, i) => {
        const intraBatchDuplicate = seenInBatch.has(r.fingerprint)
        const duplicate = alreadySaved.has(r.fingerprint) || intraBatchDuplicate
        if (!duplicate) seenInBatch.add(r.fingerprint)
        return { ...r, fileId: entry.id, accountId: entry.accountId, _key: `${entry.id}-${i}-${r.fingerprint.slice(0, 8)}`, duplicate, duplicateReason: alreadySaved.has(r.fingerprint) ? 'existing' : intraBatchDuplicate ? 'batch' : null, category_id: findRuleCategory(r, entry) || (r.category_hint ? catMap.get(r.category_hint) || null : null), userEdited: false }
      })
      entry.status = 'parsed'
      delete entry._parsedRaw
      imp.rows.push(...entry.rows)
    }
    imp.step = 2
    imp.filter = 'all'
    if (!imp.rows.length) imp.message = 'Nenhuma transação pôde ser analisada neste lote.'
    renderImport()
  } catch (err) {
    imp.message = humanError(err)
    renderImport()
  } finally { setBusy(btn, false) }
}
async function sha256(text) { const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)); return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('') }
function importedClosingBalance(rows=[]) {
  const candidates=rows.map((r,i)=>({i,date:r.transaction_date,balance:parseMoneyInput(r.raw_data?.saldo ?? r.raw_data?.balance ?? '')})).filter((x)=>x.date&&Number.isFinite(x.balance))
  if(!candidates.length)return null
  const maxDate=candidates.reduce((m,x)=>x.date>m?x.date:m,candidates[0].date)
  const same=candidates.filter((x)=>x.date===maxDate)
  return same[same.length-1] || null
}
async function saveAccountBalanceSnapshot(accountId,balance,date,source='statement',metadata={}) {
  if(!accountId||!date||!Number.isFinite(num(balance)))return
  const {error}=await supabase.from('account_balance_snapshots').upsert({user_id:state.session.user.id,account_id:accountId,balance:num(balance),balance_date:date,source,is_confirmed:true,metadata},{onConflict:'account_id,balance_date,source'})
  if(error)throw error
}
async function confirmBatchImport() {
  const imp = state.import
  const btn = $('confirmBatchImport')
  const fresh = imp.rows.filter((r) => !r.duplicate)
  if (!fresh.length) return
  setBusy(btn, true, 'Importando lote')
  const result = { imported: 0, duplicates: imp.rows.filter((r) => r.duplicate).length, filesImported: 0, filesSkipped: 0, errors: [] }
  try {
    const user = state.session.user
    for (const entry of imp.files.filter((x) => x.status === 'parsed')) {
      const account = state.accounts.find((a) => a.id === entry.accountId)
      const fileRows = imp.rows.filter((r) => r.fileId === entry.id && !r.duplicate)
      if (!account || !fileRows.length) { result.filesSkipped++; continue }
      try {
        const hash = await sha256(entry.fileText)
        const { data: batch, error: bErr } = await supabase.from('import_batches').insert({
          user_id: user.id, account_id: account.id, file_name: entry.file.name, file_hash: hash, institution: account.institution,
          source_format: entry.file.name.toLowerCase().endsWith('.ofx') ? 'ofx' : 'csv', status: 'confirmed', row_count: entry.rows.length,
          duplicate_count: entry.rows.filter((r) => r.duplicate).length, review_count: fileRows.filter(needsImportReview).length,
          confirmed_at: new Date().toISOString(), metadata: { detected_source: entry.detected?.label || null, automatic_detection: !entry.manualSource, batch_import: true }
        }).select('id').single()
        if (bErr) {
          if (bErr.code === '23505') { result.filesSkipped++; continue }
          throw bErr
        }
        const payload = fileRows.map((r) => ({
          user_id: user.id, account_id: account.id, category_id: r.category_id || null, import_batch_id: batch.id,
          transaction_date: r.transaction_date, description: r.description, display_description: null, merchant: r.merchant, amount: r.amount,
          flow_type: r.flow_type, is_internal_transfer: r.is_internal_transfer, include_in_budget: r.include_in_budget,
          transaction_source: 'import', source_record_id: r.source_record_id, source_fingerprint: r.fingerprint,
          review_status: needsImportReview(r) && !r.userEdited ? 'needs_review' : (r.userEdited ? 'reviewed' : 'auto'), tags: [], metadata: r.raw_data
        }))
        const { error } = await supabase.from('transactions').insert(payload)
        if (error) throw error
        if (account.institution === 'inter' && account.account_type === 'checking') {
          const closing=importedClosingBalance(fileRows)
          if(closing) await saveAccountBalanceSnapshot(account.id,closing.balance,closing.date,'statement',{file_name:entry.file.name,detected_source:entry.detected?.label||null})
        }
        result.imported += payload.length
        result.filesImported++
      } catch (err) {
        result.errors.push(`${entry.file.name}: ${humanError(err)}`)
      }
    }
    imp.result = result
    imp.step = 3
    await loadData()
    state.view = 'import'
    renderImport()
  } catch (err) {
    imp.message = humanError(err)
    renderImport()
  } finally { setBusy(btn, false) }
}


function assetTypeLabel(type) {
  return ({ cash_reserve: 'Reserva', fixed_income: 'Renda fixa', fund: 'Fundos', stock: 'Ações', reit: 'FIIs', crypto: 'Cripto', pension: 'Previdência', other: 'Outros' })[type] || type
}
function movementTypeLabel(type) {
  return ({ contribution: 'Aporte', withdrawal: 'Resgate', income: 'Rendimento', fee: 'Taxa', valuation_adjustment: 'Ajuste de valor', transfer_in: 'Transferência de entrada', transfer_out: 'Transferência de saída' })[type] || type
}
function investmentTotals() {
  const current = state.investmentPositions.reduce((s, p) => s + num(p.current_value), 0)
  const principal = state.investmentPositions.reduce((s, p) => s + num(p.invested_amount), 0)
  const result = current - principal
  const pct = principal > 0 ? (result / principal) * 100 : 0
  const monthContribution = state.investmentMovements.filter((m) => m.movement_type === 'contribution').reduce((s, m) => s + num(m.amount), 0)
  const monthWithdrawal = state.investmentMovements.filter((m) => m.movement_type === 'withdrawal').reduce((s, m) => s + num(m.amount), 0)
  const monthIncome = state.investmentMovements.filter((m) => m.movement_type === 'income').reduce((s, m) => s + num(m.amount), 0)
  return { current, principal, result, pct, monthContribution, monthWithdrawal, monthIncome }
}
function renderInvestments() {
  const t = investmentTotals()
  const byType = new Map()
  state.investmentPositions.forEach((p) => byType.set(p.asset_type, (byType.get(p.asset_type) || 0) + num(p.current_value)))
  const typeRows = [...byType.entries()].sort((a, b) => b[1] - a[1])
  const maxType = Math.max(1, ...typeRows.map((x) => x[1]))
  const goalRows = state.investmentGoals.map((g) => {
    const value = state.investmentPositions.filter((p) => p.goal_id === g.id).reduce((s, p) => s + num(p.current_value), 0)
    const target = num(g.target_amount)
    return { ...g, value, pct: target > 0 ? Math.min(100, value / target * 100) : 0 }
  })
  const positions = state.investmentPositions
  const invFilter = state.investmentMovementFilter || 'all'
  const displayedInvestmentMoves = invFilter === 'all' ? state.investmentMovements : state.investmentMovements.filter((m) => m.movement_type === invFilter)
  const monthName = monthFmt.format(parseDate(`${state.month}-01`))
  $('mainArea').innerHTML = `<div class="content-stack investment-view">
    <section class="section-header investment-hero-head"><div><span class="muted">Patrimônio e crescimento</span><h2>Investimentos</h2><p>Aportes não são gastos. Aqui você acompanha o que virou patrimônio e quanto esse patrimônio está rendendo.</p></div><div class="section-actions"><button id="investmentIncomeBtn" class="button" type="button">＋ Rendimento</button><button id="investmentWithdrawalBtn" class="button" type="button">↘ Resgate</button><button id="investmentContributionBtn" class="button primary" type="button">＋ Registrar aporte</button></div></section>
    <section class="investment-kpi-grid">
      <button type="button" class="investment-kpi investment-kpi-clickable featured" data-invest-drill="positions"><span class="kpi-label">Patrimônio investido</span><strong>${money.format(t.current)}</strong><span class="kpi-foot">Ver posições →</span></button>
      <button type="button" class="investment-kpi investment-kpi-clickable" data-invest-drill="contribution"><span class="kpi-label">Aportes em ${esc(monthName)}</span><strong>${money.format(t.monthContribution)}</strong><span class="kpi-foot">Resgates: ${money.format(t.monthWithdrawal)} · ver aportes →</span></button>
      <button type="button" class="investment-kpi investment-kpi-clickable" data-invest-drill="income"><span class="kpi-label">Rendimentos no mês</span><strong>${money.format(t.monthIncome)}</strong><span class="kpi-foot">Ver rendimentos →</span></button>
      <button type="button" class="investment-kpi investment-kpi-clickable ${t.result >= 0 ? 'positive' : 'negative'}" data-invest-drill="positions"><span class="kpi-label">Resultado acumulado</span><strong>${money.format(t.result)}</strong><span class="kpi-foot">${t.pct.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}% · ver posições →</span></button>
    </section>
    <section class="investment-layout">
      <div class="panel investment-portfolio-panel"><div class="panel-head"><div><span class="eyebrow">CARTEIRA</span><h3>Posições</h3><p>Atualize o valor periodicamente para acompanhar a evolução patrimonial.</p></div><button id="newPositionBtn" class="button small" type="button">＋ Nova posição</button></div>
        ${positions.length ? `<div class="investment-position-list">${positions.map((p) => {
          const value = num(p.current_value), principal = num(p.invested_amount), r = value - principal, rp = principal > 0 ? r/principal*100 : 0
          return `<button type="button" class="investment-position-row" data-position="${p.id}"><div class="position-icon">${assetTypeLabel(p.asset_type).slice(0,1)}</div><div class="position-main"><strong>${esc(p.name)}</strong><span>${esc(p.accounts?.name || accountById(p.account_id)?.name || 'Investimentos')} · ${esc(assetTypeLabel(p.asset_type))}${p.benchmark ? ` · ${esc(p.benchmark)}` : ''}</span></div><div class="position-numbers"><strong>${money.format(value)}</strong><span class="${r >= 0 ? 'positive-text' : 'negative-text'}">${r >= 0 ? '+' : ''}${money.format(r)} · ${rp.toLocaleString('pt-BR',{maximumFractionDigits:2})}%</span></div></button>`
        }).join('')}</div>` : `<div class="empty-state compact"><strong>Nenhuma posição cadastrada</strong><span>Cadastre uma reserva, CDB, fundo, ação ou outro investimento para começar a acompanhar o patrimônio.</span><button id="emptyNewPosition" class="button primary" type="button">Criar primeira posição</button></div>`}
      </div>
      <div class="panel"><div class="panel-head"><div><span class="eyebrow">ALOCAÇÃO</span><h3>Distribuição</h3><p>Quanto do seu patrimônio está em cada tipo de ativo.</p></div></div>${typeRows.length ? `<div class="allocation-list">${typeRows.map(([type, value]) => `<div class="allocation-row"><div><span>${esc(assetTypeLabel(type))}</span><strong>${money.format(value)}</strong></div><div class="progress-track"><span style="width:${Math.max(4,value/maxType*100)}%"></span></div></div>`).join('')}</div>` : '<div class="empty-state compact"><span>A distribuição aparece quando você cadastrar posições.</span></div>'}</div>
    </section>
    <section class="investment-layout goals-layout">
      <div class="panel"><div class="panel-head"><div><span class="eyebrow">OBJETIVOS</span><h3>Metas patrimoniais</h3><p>Associe posições a objetivos como reserva de emergência, viagem ou aposentadoria.</p></div><button id="newGoalBtn" class="button small" type="button">＋ Nova meta</button></div>${goalRows.length ? `<div class="goal-list">${goalRows.map((g) => `<button type="button" class="goal-card" data-goal="${g.id}"><div class="goal-top"><div><strong>${esc(g.name)}</strong><span>${g.target_date ? `Até ${fullDateFmt.format(parseDate(g.target_date))}` : 'Sem prazo definido'}</span></div><strong>${g.pct.toLocaleString('pt-BR',{maximumFractionDigits:0})}%</strong></div><div class="goal-values"><span>${money.format(g.value)}</span><span>Meta ${money.format(num(g.target_amount))}</span></div><div class="progress-track goal-progress"><span style="width:${g.pct}%"></span></div></button>`).join('')}</div>` : '<div class="empty-state compact"><span>Crie uma meta para saber se os seus aportes estão levando você ao objetivo desejado.</span></div>'}</div>
      <div class="panel" id="investmentMovementsPanel"><div class="panel-head"><div><span class="eyebrow">MOVIMENTAÇÕES</span><h3>${esc(monthName)}</h3><p>${invFilter === 'all' ? 'Aportes, resgates e rendimentos registrados no mês.' : `Filtro: ${esc(movementTypeLabel(invFilter))}`}</p></div>${invFilter !== 'all' ? '<button id="clearInvestmentFilter" class="button small" type="button">Ver todas</button>' : ''}</div>${displayedInvestmentMoves.length ? `<div class="investment-move-list">${displayedInvestmentMoves.slice(0,10).map((m) => `<div class="investment-move-row"><div><strong>${esc(m.investment_positions?.name || m.accounts?.name || 'Investimento')}</strong><span>${esc(movementTypeLabel(m.movement_type))} · ${dateFmt.format(parseDate(m.movement_date))}</span></div><strong class="${m.movement_type === 'withdrawal' || m.movement_type === 'fee' ? 'negative-text' : ''}">${m.movement_type === 'withdrawal' || m.movement_type === 'fee' ? '− ' : '+ '}${money.format(num(m.amount))}</strong></div>`).join('')}</div>` : '<div class="empty-state compact"><span>Nenhuma movimentação de investimento neste mês.</span></div>'}</div>
    </section>
  </div>`
  $('investmentContributionBtn')?.addEventListener('click', openInvestmentContributionModal)
  $('investmentWithdrawalBtn')?.addEventListener('click', openInvestmentWithdrawalModal)
  $('investmentIncomeBtn')?.addEventListener('click', openInvestmentIncomeModal)
  $('newPositionBtn')?.addEventListener('click', () => openInvestmentPositionModal())
  $('emptyNewPosition')?.addEventListener('click', () => openInvestmentPositionModal())
  $('newGoalBtn')?.addEventListener('click', () => openInvestmentGoalModal())
  document.querySelectorAll('[data-position]').forEach((b) => b.addEventListener('click', () => openInvestmentPositionModal(b.dataset.position)))
  document.querySelectorAll('[data-goal]').forEach((b) => b.addEventListener('click', () => openInvestmentGoalModal(b.dataset.goal)))
  document.querySelectorAll('[data-invest-drill]').forEach((b) => b.addEventListener('click', () => {
    const kind = b.dataset.investDrill
    if (kind === 'positions') document.querySelector('.investment-portfolio-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    else { state.investmentMovementFilter = kind; renderInvestments(); setTimeout(() => $('investmentMovementsPanel')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0) }
  }))
  $('clearInvestmentFilter')?.addEventListener('click', () => { state.investmentMovementFilter = 'all'; renderInvestments() })
}
function investmentAccountOptions(selected='') {
  const accounts = state.accounts.filter((a) => ['investment','savings'].includes(a.account_type))
  return accounts.map((a) => `<option value="${a.id}" ${a.id===selected?'selected':''}>${esc(a.name)}</option>`).join('')
}
function sourceAccountOptions(selected='') {
  return state.accounts.filter((a) => !['credit_card','benefit','virtual'].includes(a.account_type)).map((a) => `<option value="${a.id}" ${a.id===selected?'selected':''}>${esc(a.name)}</option>`).join('')
}
function goalOptions(selected='') {
  return `<option value="">Sem meta vinculada</option>${state.investmentGoals.map((g)=>`<option value="${g.id}" ${g.id===selected?'selected':''}>${esc(g.name)}</option>`).join('')}`
}
function openInvestmentPositionModal(id=null) {
  const p = id ? state.investmentPositions.find((x)=>x.id===id) : null
  const autoCalculated=Boolean(p?.metadata?.auto_calculate_from_movements)
  const modal = $('modalHost')
  modal.innerHTML = `<div class="modal-backdrop"><form id="investmentPositionForm" class="modal"><div class="modal-head"><div><span class="eyebrow">${p?'EDITAR POSIÇÃO':'NOVA POSIÇÃO'}</span><h2>${p?esc(p.name):'Cadastrar investimento'}</h2><div class="modal-sub">${autoCalculated?'Principal e valor atual são calculados automaticamente a partir dos aportes, resgates e rendimentos.':'O principal investido e o valor atual ficam separados para calcular o resultado real.'}</div></div><button id="closeModal" class="icon-button" type="button">×</button></div><div class="form-grid"><label class="field-label full-span">Nome<input id="invName" value="${esc(p?.name||'')}" placeholder="Ex.: CDB liquidez diária" required></label><label class="field-label">Conta / instituição<select id="invAccount">${investmentAccountOptions(p?.account_id||'')}</select></label><label class="field-label">Tipo<select id="invType"><option value="cash_reserve">Reserva</option><option value="fixed_income">Renda fixa</option><option value="fund">Fundo</option><option value="stock">Ação</option><option value="reit">FII</option><option value="crypto">Cripto</option><option value="pension">Previdência</option><option value="other">Outro</option></select></label><label class="field-label">Principal investido<input id="invPrincipal" inputmode="decimal" value="${p?num(p.invested_amount).toLocaleString('pt-BR',{minimumFractionDigits:2}):''}" placeholder="0,00" ${autoCalculated?'readonly':''}></label><label class="field-label">Valor atual<input id="invCurrent" inputmode="decimal" value="${p?num(p.current_value).toLocaleString('pt-BR',{minimumFractionDigits:2}):''}" placeholder="0,00" ${autoCalculated?'readonly':''}></label><label class="field-label">Benchmark<input id="invBenchmark" value="${esc(p?.benchmark||'')}" placeholder="Ex.: CDI, IPCA + 6%"></label><label class="field-label">Liquidez<input id="invLiquidity" value="${esc(p?.liquidity_label||'')}" placeholder="Ex.: D+0"></label><label class="field-label">Vencimento<input id="invMaturity" type="date" value="${esc(p?.maturity_date||'')}"></label><label class="field-label">Meta<select id="invGoal">${goalOptions(p?.goal_id||'')}</select></label></div><div id="invPositionMessage" class="form-message hidden"></div><div class="modal-actions"><span>${p&&!autoCalculated?'<button id="updateValuation" class="text-button" type="button">Atualizar valor e histórico</button>':autoCalculated?'<span class="muted">Calculado pelas movimentações</span>':''}</span><div class="modal-actions-right"><button id="cancelModal" class="button" type="button">Cancelar</button><button id="saveInvPosition" class="button primary" type="submit">✓ Salvar</button></div></div></form></div>`
  $('invType').value=p?.asset_type||'fixed_income'
  const close=()=>{modal.innerHTML=''}
  $('closeModal').addEventListener('click',close); $('cancelModal').addEventListener('click',close)
  $('updateValuation')?.addEventListener('click',()=>{close();openInvestmentValuationModal(p.id)})
  $('investmentPositionForm').addEventListener('submit',async(e)=>{e.preventDefault();const btn=$('saveInvPosition');setBusy(btn,true,'Salvando');try{const principal=parseMoneyInput($('invPrincipal').value||'0');const current=parseMoneyInput($('invCurrent').value||'0');if(!Number.isFinite(principal)||principal<0||!Number.isFinite(current)||current<0)throw new Error('Informe valores válidos.');const payload={name:$('invName').value.trim(),account_id:$('invAccount').value,asset_type:$('invType').value,invested_amount:principal,current_value:current,benchmark:$('invBenchmark').value.trim()||null,liquidity_label:$('invLiquidity').value.trim()||null,maturity_date:$('invMaturity').value||null,goal_id:$('invGoal').value||null};if(!payload.name||!payload.account_id)throw new Error('Informe nome e conta do investimento.');let error;if(p)({error}=await supabase.from('investment_positions').update(payload).eq('id',p.id));else({error}=await supabase.from('investment_positions').insert({...payload,user_id:state.session.user.id,active:true}));if(error)throw error;close();toast(p?'Posição atualizada.':'Posição criada.','success');await loadData()}catch(err){showInfo('invPositionMessage',humanError(err));setBusy(btn,false)}})
}
function openInvestmentGoalModal(id=null) {
  const g=id?state.investmentGoals.find((x)=>x.id===id):null
  const modal=$('modalHost')
  modal.innerHTML=`<div class="modal-backdrop"><form id="investmentGoalForm" class="modal"><div class="modal-head"><div><span class="eyebrow">${g?'EDITAR META':'NOVA META'}</span><h2>${g?esc(g.name):'Criar objetivo patrimonial'}</h2></div><button id="closeModal" class="icon-button" type="button">×</button></div><div class="form-grid"><label class="field-label full-span">Nome da meta<input id="goalName" value="${esc(g?.name||'')}" placeholder="Ex.: Reserva de emergência" required></label><label class="field-label">Valor alvo<input id="goalAmount" inputmode="decimal" value="${g?num(g.target_amount).toLocaleString('pt-BR',{minimumFractionDigits:2}):''}" placeholder="0,00" required></label><label class="field-label">Prazo<input id="goalDate" type="date" value="${esc(g?.target_date||'')}"></label><label class="field-label full-span">Observação<textarea id="goalNotes" placeholder="Opcional">${esc(g?.notes||'')}</textarea></label></div><div id="goalMessage" class="form-message hidden"></div><div class="modal-actions"><span></span><div class="modal-actions-right"><button id="cancelModal" class="button" type="button">Cancelar</button><button id="saveGoal" class="button primary" type="submit">✓ Salvar meta</button></div></div></form></div>`
  const close=()=>{modal.innerHTML=''};$('closeModal').addEventListener('click',close);$('cancelModal').addEventListener('click',close)
  $('investmentGoalForm').addEventListener('submit',async(e)=>{e.preventDefault();const btn=$('saveGoal');setBusy(btn,true,'Salvando');try{const amount=parseMoneyInput($('goalAmount').value);if(!Number.isFinite(amount)||amount<=0)throw new Error('Informe um valor alvo válido.');const payload={name:$('goalName').value.trim(),target_amount:amount,target_date:$('goalDate').value||null,notes:$('goalNotes').value.trim()||null};if(!payload.name)throw new Error('Informe o nome da meta.');let error;if(g)({error}=await supabase.from('investment_goals').update(payload).eq('id',g.id));else({error}=await supabase.from('investment_goals').insert({...payload,user_id:state.session.user.id,active:true}));if(error)throw error;close();toast('Meta salva.','success');await loadData()}catch(err){showInfo('goalMessage',humanError(err));setBusy(btn,false)}})
}
function openInvestmentContributionModal() {
  const modal=$('modalHost')
  const positions=state.investmentPositions
  modal.innerHTML=`<div class="modal-backdrop"><form id="investmentContributionForm" class="modal"><div class="modal-head"><div><span class="eyebrow">APORTE</span><h2>Transformar dinheiro em patrimônio</h2><div class="modal-sub">A saída da conta bancária não será tratada como gasto.</div></div><button id="closeModal" class="icon-button" type="button">×</button></div><div class="form-grid"><label class="field-label">Data<input id="contributionDate" type="date" value="${new Date().toISOString().slice(0,10)}"></label><label class="field-label">Valor<input id="contributionAmount" inputmode="decimal" placeholder="0,00"></label><label class="field-label">Sai de<select id="contributionSource">${sourceAccountOptions()}</select></label><label class="field-label">Vai para<select id="contributionDestination">${investmentAccountOptions()}</select></label><label class="field-label full-span">Posição<select id="contributionPosition"><option value="">Aporte sem posição específica</option>${positions.map((p)=>`<option value="${p.id}" data-account="${p.account_id}">${esc(p.name)}</option>`).join('')}</select></label><label class="field-label full-span">Observação<textarea id="contributionNotes" placeholder="Opcional"></textarea></label></div><div id="contributionMessage" class="form-message hidden"></div><div class="modal-actions"><span class="muted">O patrimônio total não muda no momento do aporte.</span><div class="modal-actions-right"><button id="cancelModal" class="button" type="button">Cancelar</button><button id="saveContribution" class="button primary" type="submit">✓ Registrar aporte</button></div></div></form></div>`
  const close=()=>{modal.innerHTML=''};$('closeModal').addEventListener('click',close);$('cancelModal').addEventListener('click',close)
  $('contributionPosition').addEventListener('change',()=>{const opt=$('contributionPosition').selectedOptions[0];if(opt?.dataset.account)$('contributionDestination').value=opt.dataset.account})
  $('investmentContributionForm').addEventListener('submit',async(e)=>{e.preventDefault();const btn=$('saveContribution');setBusy(btn,true,'Registrando');try{const amount=parseMoneyInput($('contributionAmount').value);if(!Number.isFinite(amount)||amount<=0)throw new Error('Informe um valor válido.');const {error}=await supabase.rpc('record_investment_contribution',{p_date:$('contributionDate').value,p_amount:amount,p_source_account_id:$('contributionSource').value,p_investment_account_id:$('contributionDestination').value,p_position_id:$('contributionPosition').value||null,p_notes:$('contributionNotes').value.trim()||null});if(error)throw error;close();toast('Aporte registrado sem virar despesa.','success');await loadData()}catch(err){showInfo('contributionMessage',humanError(err));setBusy(btn,false)}})
}
function openInvestmentWithdrawalModal() {
  if(!state.investmentPositions.length){toast('Cadastre uma posição antes de registrar resgate.');openInvestmentPositionModal();return}
  const modal=$('modalHost')
  const first=state.investmentPositions[0]
  modal.innerHTML=`<div class="modal-backdrop"><form id="investmentWithdrawalForm" class="modal"><div class="modal-head"><div><span class="eyebrow">RESGATE</span><h2>Trazer investimento de volta para a conta</h2><div class="modal-sub">O valor recebido na conta é transferência de patrimônio, não uma nova receita.</div></div><button id="closeModal" class="icon-button" type="button">×</button></div><div class="form-grid"><label class="field-label">Data<input id="withdrawalDate" type="date" value="${new Date().toISOString().slice(0,10)}"></label><label class="field-label">Valor<input id="withdrawalAmount" inputmode="decimal" placeholder="0,00"></label><label class="field-label full-span">Posição<select id="withdrawalPosition">${state.investmentPositions.map((p)=>`<option value="${p.id}" data-account="${p.account_id}">${esc(p.name)} · ${money.format(num(p.current_value))}</option>`).join('')}</select></label><label class="field-label">Sai de<select id="withdrawalSource">${investmentAccountOptions(first?.account_id||'')}</select></label><label class="field-label">Vai para<select id="withdrawalDestination">${sourceAccountOptions()}</select></label><label class="field-label full-span">Observação<textarea id="withdrawalNotes" placeholder="Opcional"></textarea></label></div><div id="withdrawalMessage" class="form-message hidden"></div><div class="modal-actions"><span class="muted">O resgate reduz a posição e aumenta a conta de destino.</span><div class="modal-actions-right"><button id="cancelModal" class="button" type="button">Cancelar</button><button id="saveWithdrawal" class="button primary" type="submit">✓ Registrar resgate</button></div></div></form></div>`
  const close=()=>{modal.innerHTML=''};$('closeModal').addEventListener('click',close);$('cancelModal').addEventListener('click',close)
  $('withdrawalPosition').addEventListener('change',()=>{const opt=$('withdrawalPosition').selectedOptions[0];if(opt?.dataset.account)$('withdrawalSource').value=opt.dataset.account})
  $('investmentWithdrawalForm').addEventListener('submit',async(e)=>{e.preventDefault();const btn=$('saveWithdrawal');setBusy(btn,true,'Registrando');try{const amount=parseMoneyInput($('withdrawalAmount').value);if(!Number.isFinite(amount)||amount<=0)throw new Error('Informe um valor válido.');const pos=state.investmentPositions.find((p)=>p.id===$('withdrawalPosition').value);if(amount>num(pos.current_value))throw new Error('O resgate não pode ser maior que o valor atual da posição.');const {error}=await supabase.rpc('record_investment_withdrawal',{p_date:$('withdrawalDate').value,p_amount:amount,p_investment_account_id:$('withdrawalSource').value,p_destination_account_id:$('withdrawalDestination').value,p_position_id:pos.id,p_notes:$('withdrawalNotes').value.trim()||null});if(error)throw error;close();toast('Resgate registrado como transferência de patrimônio.','success');await loadData()}catch(err){showInfo('withdrawalMessage',humanError(err));setBusy(btn,false)}})
}

function openInvestmentIncomeModal() {
  if(!state.investmentPositions.length){toast('Cadastre uma posição antes de registrar rendimento.');openInvestmentPositionModal();return}
  const modal=$('modalHost')
  modal.innerHTML=`<div class="modal-backdrop"><form id="investmentIncomeForm" class="modal"><div class="modal-head"><div><span class="eyebrow">RENDIMENTO</span><h2>Registrar ganho do investimento</h2><div class="modal-sub">Use para rendimentos que ficaram aplicados. Se o valor caiu na conta bancária, registre também a entrada na conta.</div></div><button id="closeModal" class="icon-button" type="button">×</button></div><div class="form-grid"><label class="field-label">Data<input id="incomeDate" type="date" value="${new Date().toISOString().slice(0,10)}"></label><label class="field-label">Valor<input id="incomeAmount" inputmode="decimal" placeholder="0,00"></label><label class="field-label full-span">Posição<select id="incomePosition">${state.investmentPositions.map((p)=>`<option value="${p.id}" data-account="${p.account_id}">${esc(p.name)}</option>`).join('')}</select></label><label class="field-label full-span">Observação<textarea id="incomeNotes" placeholder="Opcional"></textarea></label></div><div id="incomeMessage" class="form-message hidden"></div><div class="modal-actions"><span></span><div class="modal-actions-right"><button id="cancelModal" class="button" type="button">Cancelar</button><button id="saveIncome" class="button primary" type="submit">✓ Registrar rendimento</button></div></div></form></div>`
  const close=()=>{modal.innerHTML=''};$('closeModal').addEventListener('click',close);$('cancelModal').addEventListener('click',close)
  $('investmentIncomeForm').addEventListener('submit',async(e)=>{e.preventDefault();const btn=$('saveIncome');setBusy(btn,true,'Registrando');try{const amount=parseMoneyInput($('incomeAmount').value);if(!Number.isFinite(amount)||amount<=0)throw new Error('Informe um valor válido.');const pos=state.investmentPositions.find((p)=>p.id===$('incomePosition').value);const {error}=await supabase.rpc('record_investment_income',{p_date:$('incomeDate').value,p_amount:amount,p_account_id:pos.account_id,p_position_id:pos.id,p_notes:$('incomeNotes').value.trim()||null});if(error)throw error;close();toast('Rendimento registrado.','success');await loadData()}catch(err){showInfo('incomeMessage',humanError(err));setBusy(btn,false)}})
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
  if (['jarvis','home','agenda','tasks','notes','projects'].includes(state.view)) renderMain()
  try {
    const [messages, annotations, notes, tasks, projects, actions, connections] = await Promise.all([
      supabase.from('jarvis_messages').select('*').order('created_at', { ascending: false }).limit(80),
      supabase.from('financial_annotations').select('*', { count: 'exact' }).order('created_at', { ascending: false }).limit(100),
      supabase.from('jarvis_notes').select('*', { count: 'exact' }).order('created_at', { ascending: false }).limit(100),
      supabase.from('jarvis_tasks').select('*', { count: 'exact' }).order('created_at', { ascending: false }).limit(100),
      supabase.from('jarvis_projects').select('*', { count: 'exact' }).order('created_at', { ascending: false }).limit(100),
      supabase.from('jarvis_actions').select('*', { count: 'exact' }).order('created_at', { ascending: false }).limit(100),
      supabase.from('jarvis_connections').select('*').order('updated_at', { ascending: false }).limit(12)
    ])
    const err = messages.error || annotations.error || notes.error || tasks.error || projects.error || actions.error || connections.error
    if (err) throw err
    state.jarvis.messages = (messages.data || []).reverse()
    state.jarvis.annotations = dedupeJarvisAnnotations(annotations.data || [])
    state.jarvis.notes = notes.data || []
    state.jarvis.tasks = tasks.data || []
    state.jarvis.projects = projects.data || []
    state.jarvis.actions = dedupeJarvisActions(actions.data || [])
    state.jarvis.counts = { annotations: annotations.count ?? state.jarvis.annotations.length, notes: notes.count ?? state.jarvis.notes.length, tasks: tasks.count ?? state.jarvis.tasks.length, projects: projects.count ?? state.jarvis.projects.length, actions: actions.count ?? state.jarvis.actions.length }
    state.jarvis.connections = connections.data || []
    state.jarvis.error = null
    state.jarvis.loaded = true
  } catch (err) {
    state.jarvis.error = humanError(err)
    state.jarvis.loaded = true
    toast(state.jarvis.error, 'error')
  } finally {
    state.jarvis.loading = false
    if (['jarvis','home','agenda','tasks','notes','projects'].includes(state.view)) renderMain()
  }
}

function jarvisIntentLabel(intent) {
  return ({ financial: 'Financeiro', note: 'Nota', reminder: 'Lembrete', calendar: 'Agenda', project: 'Projeto', query: 'Consulta', conversation: 'Conversa', unknown: 'Indefinido' })[intent] || 'Mensagem'
}

function jarvisCreatedSummary() {
  const pending = state.jarvis.annotations.filter((x) => x.reconciliation_status === 'pending').length
  const tasks = state.jarvis.tasks.filter((x) => x.status === 'pending').length
  const actions = state.jarvis.actions.filter((x) => x.status === 'proposed').length
  return [
    ['Contextos financeiros', pending, 'Aguardando conciliação com extratos'],
    ['Notas e ideias', state.jarvis.notes.length, 'Memória estruturada do Jarvis'],
    ['Lembretes', tasks, 'Pendentes'],
    ['Ações para confirmar', actions, 'Agenda e ações externas']
  ]
}

function jarvisGoogleConnection() {
  return state.jarvis.connections.find((x) => x.provider === 'google_calendar' && x.status === 'connected') || null
}

function formatJarvisEvent(payload = {}) {
  const start = payload.starts_at ? new Date(payload.starts_at) : null
  const end = payload.ends_at ? new Date(payload.ends_at) : null
  const date = start ? new Intl.DateTimeFormat('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' }).format(start) : 'Data pendente'
  const time = start ? new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(start) : '--:--'
  const endTime = end ? new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(end) : null
  return `${date} · ${time}${endTime ? `–${endTime}` : ''}`
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

async function executeJarvisCalendarAction(actionId) {
  const btn = document.querySelector(`[data-jarvis-calendar-action="${actionId}"]`)
  setBusy(btn, true, 'Agendando')
  try {
    const { data, error } = await supabase.functions.invoke('jarvis-calendar', { body: { action_id: actionId } })
    if (error) throw error
    if (data?.error) throw new Error(data.error)
    toast('Evento criado no Google Calendar.', 'success')
    await Promise.all([loadJarvisData(true), loadCalendarData(true)])
  } catch (err) {
    toast(humanError(err), 'error')
    setBusy(btn, false)
  }
}

async function testJarvisWhatsApp() {
  const btn = $('jarvisWhatsAppTest')
  const numberInput = $('jarvisWhatsAppNumber')
  const resultBox = $('jarvisWhatsAppResult')
  const to = String(numberInput?.value || '').replace(/\D/g, '')
  if (!to) {
    if (resultBox) { resultBox.className = 'form-message error'; resultBox.textContent = 'Digite o numero com DDI e DDD. Ex.: 5521999999999.' }
    numberInput?.focus()
    return
  }
  localStorage.setItem('jarvis_whatsapp_test_number', to)
  if (resultBox) { resultBox.className = 'form-message hidden'; resultBox.textContent = '' }
  setBusy(btn, true, 'Enviando')
  try {
    const { data, error } = await supabase.functions.invoke('jarvis-whatsapp-send', {
      body: { to, use_template: true }
    })
    if (error) {
      let details = null
      try { details = await error.context?.json?.() } catch (_) {}
      if (details) throw new Error([details.error, details.error_code ? `codigo ${details.error_code}` : '', details.error_subcode ? `subcodigo ${details.error_subcode}` : ''].filter(Boolean).join(' · '))
      throw error
    }
    if (data?.error || data?.ok === false) throw new Error([data?.error || 'Falha no envio', data?.error_code ? `codigo ${data.error_code}` : '', data?.error_subcode ? `subcodigo ${data.error_subcode}` : ''].filter(Boolean).join(' · '))
    const messageId = data?.result?.messages?.[0]?.id || null
    if (resultBox) {
      resultBox.className = 'form-message success'
      resultBox.textContent = messageId ? `Meta aceitou o envio. Message ID: ${messageId}` : 'Meta aceitou o envio do teste.'
    }
    toast('Teste enviado diretamente pela WhatsApp Cloud API.', 'success')
  } catch (err) {
    const msg = humanError(err)
    if (resultBox) { resultBox.className = 'form-message error'; resultBox.textContent = msg }
    toast(msg, 'error')
  } finally {
    setBusy(btn, false)
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
  return project?.name || project?.title || project?.project_name || 'Projeto sem nome'
}

function jarvisTaskTime(task) {
  return task?.remind_at || task?.due_at || null
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

function normalizeJarvisText(value = '') {
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

function shouldUseCalendarRead(message = '') {
  const text = normalizeJarvisText(message)
  const writeIntent = /\b(agende|agendar|marque|marcar|crie|criar|adicione|adicionar|cancele|cancelar|remarque|remarcar|mude|mudar|altere|alterar|apague|apagar|remova|remover)\b/.test(text)
    || /^(jarvis[,:]?\s+)?agenda\s+(uma|um|a|o|reuniao|evento|consulta|compromisso)\b/.test(text)
  if (writeIntent) return false
  return /\b(calendario|compromisso|compromissos|reuniao|reunioes|evento|eventos|agenda)\b/.test(text)
    || /\bo que (eu )?tenho (hoje|amanha)\b/.test(text)
    || /\btenho (algo|algum compromisso|alguma reuniao) (hoje|amanha)\b/.test(text)
}

async function invokeJarvisEngine(message, source = 'panel_jarvis') {
  const functionName = shouldUseCalendarRead(message) ? 'jarvis-calendar-query' : 'jarvis-core'
  return supabase.functions.invoke(functionName, { body: { message, channel: 'web', source } })
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
  if (state.jarvis.loaded && !state.calendar.loaded && !state.calendar.loading) loadCalendarData()
  const name = personalDisplayName()
  const now = new Date()
  const localHour = Number(new Intl.DateTimeFormat('en-US',{timeZone:JARVIS_TIMEZONE,hour:'2-digit',hourCycle:'h23'}).format(now))
  const greeting = localHour < 12 ? 'Bom dia' : localHour < 18 ? 'Boa tarde' : 'Boa noite'
  const pendingTasks = state.jarvis.tasks.filter((x) => x.status === 'pending').sort((a,b) => new Date(jarvisTaskTime(a) || '2999-01-01') - new Date(jarvisTaskTime(b) || '2999-01-01'))
  const todayTasks = pendingTasks.filter((x) => isSameLocalDay(jarvisTaskTime(x)))
  const overdueTasks = pendingTasks.filter((x) => jarvisTaskTime(x) && new Date(jarvisTaskTime(x)) < now && !isSameLocalDay(jarvisTaskTime(x)))
  const proposedActions = state.jarvis.actions.filter((x) => x.action_type === 'calendar_create' && x.status === 'proposed')
  const calendarGroups = groupCalendarEvents(state.calendar.events)
  const todayEvents = calendarGroups.today
  const latestNotes = state.jarvis.notes.slice(0,3)
  const allActiveProjects = state.jarvis.projects.filter((x) => !['completed','archived','cancelled'].includes(String(x.status || '').toLowerCase()))
  const activeProjects = allActiveProjects.slice(0,3)
  const tx = visibleTransactions()
  const totals = calcTotals(tx)
  const reviewCount = state.transactions.filter((t) => t.review_status === 'needs_review').length
  const cashBalance = state.accounts.filter((a) => !['credit_card','virtual'].includes(a.account_type)).reduce((sum,a) => sum + (accountBalanceLabel(a).value || 0), 0)
  const google = jarvisGoogleConnection()
  const pendingAnnotations = state.jarvis.annotations.filter((x) => x.reconciliation_status === 'pending').length
  const attention = []
  if (proposedActions.length) attention.push(`${proposedActions.length} ação${proposedActions.length > 1 ? 'ões' : ''} aguardando confirmação`)
  if (overdueTasks.length) attention.push(`${overdueTasks.length} tarefa${overdueTasks.length > 1 ? 's' : ''} atrasada${overdueTasks.length > 1 ? 's' : ''}`)
  if (todayTasks.length) attention.push(`${todayTasks.length} lembrete${todayTasks.length > 1 ? 's' : ''} para hoje`)
  if (reviewCount) attention.push(`${reviewCount} transaç${reviewCount > 1 ? 'ões' : 'ão'} financeira${reviewCount > 1 ? 's' : ''} para revisar`)
  if (pendingAnnotations) attention.push(`${pendingAnnotations} contexto${pendingAnnotations > 1 ? 's' : ''} do Jarvis para conciliar`)
  if (state.calendar.error) attention.push('Google Calendar precisa de atenção')
  if (!attention.length) attention.push('Nenhuma pendência crítica detectada agora')
  const focusParts = []
  if (todayEvents.length) focusParts.push(`${todayEvents.length} compromisso${todayEvents.length > 1 ? 's' : ''} hoje`)
  if (todayTasks.length) focusParts.push(`${todayTasks.length} lembrete${todayTasks.length > 1 ? 's' : ''}`)
  if (proposedActions.length) focusParts.push(`${proposedActions.length} confirmação${proposedActions.length > 1 ? 'ões' : ''} pendente${proposedActions.length > 1 ? 's' : ''}`)
  if (reviewCount) focusParts.push(`${reviewCount} lançamento${reviewCount > 1 ? 's' : ''} para revisar`)
  const focusSummary = focusParts.length ? `Hoje merece atenção em ${focusParts.join(', ')}.` : 'Seu ambiente está em ordem. Nenhuma pendência importante detectada agora.'
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
        <div class="attention-list">${attention.slice(0,4).map((x,i) => `<div><span>${i+1}</span><p>${esc(x)}</p></div>`).join('')}</div>
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
        <div class="integration-tile future"><span class="integration-logo">D</span><div><strong>Google Drive</strong><small>Próxima integração</small></div><i>＋</i></div>
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
      await Promise.all([loadData(), loadJarvisData(true), loadCalendarData(true)])
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
        <section class="panel"><div class="panel-head"><div><h2>Aguardando confirmação</h2><p>Propostas do Jarvis não são eventos reais até você confirmar.</p></div></div><div class="pending-action-list">${pending.length ? pending.map((a) => `<article><div><strong>${esc(a.payload?.title || 'Evento')}</strong><span>${esc(formatJarvisEvent(a.payload))}</span><small>Jarvis · aguardando confirmação</small>${a.error_message ? `<small>${esc(a.error_message)}</small>` : ''}</div><button class="button primary small" data-jarvis-calendar-action="${esc(a.id)}" type="button" ${google ? '' : 'disabled'}>Confirmar</button></article>`).join('') : '<div class="personal-empty compact"><span>Nenhuma ação pendente.</span></div>'}</div></section>
      </aside>
    </section>
  </div>`
  $('agendaAskJarvis')?.addEventListener('click', () => navigate('jarvis'))
  $('agendaGoogleConnect')?.addEventListener('click', connectJarvisGoogleCalendar)
  $('agendaCalendarRetry')?.addEventListener('click', () => loadCalendarData(true))
  document.querySelectorAll('[data-jarvis-calendar-action]').forEach((b) => b.addEventListener('click', () => executeJarvisCalendarAction(b.dataset.jarvisCalendarAction)))
}

function renderTasks() {
  if (!state.jarvis.loaded && !state.jarvis.loading) { loadJarvisData(); $('mainArea').innerHTML = personalLoading(); return }
  const pending = state.jarvis.tasks.filter((x) => x.status === 'pending').sort((a,b) => new Date(jarvisTaskTime(a) || '2999-01-01') - new Date(jarvisTaskTime(b) || '2999-01-01'))
  const done = state.jarvis.tasks.filter((x) => x.status !== 'pending')
  $('mainArea').innerHTML = `<div class="content-stack personal-section">
    <section class="section-intro"><div><span class="eyebrow">TAREFAS</span><h2>O que precisa acontecer.</h2><p>Lembretes e pendências entendidos em linguagem natural pelo Jarvis.</p></div></section>
    <section class="panel quick-capture"><div><span class="eyebrow">CAPTURA RÁPIDA</span><h3>Crie uma tarefa falando normalmente.</h3></div><form id="taskQuickForm"><input id="taskQuickInput" type="text" placeholder="Ex.: me lembra amanhã às 9h de mandar o contrato"><button id="taskQuickBtn" class="button primary" type="submit">Adicionar</button></form></section>
    <section class="personal-two-col wide-main"><div class="panel"><div class="panel-head"><div><h2>Pendentes</h2><p>${pending.length} tarefa${pending.length === 1 ? '' : 's'} em aberto.</p></div></div><div class="task-list">${pending.length ? pending.map((t) => `<article><span class="task-check">○</span><div><strong>${esc(t.title)}</strong><span>${esc(t.description || 'Sem descrição adicional')}</span><small>${jarvisTaskTime(t) ? esc(jarvisDateTime(jarvisTaskTime(t))) : 'Sem horário definido'} · prioridade ${esc(t.priority || 3)}</small></div><span class="status-pill">${isSameLocalDay(jarvisTaskTime(t)) ? 'Hoje' : 'Pendente'}</span></article>`).join('') : '<div class="personal-empty"><strong>Nada pendente.</strong><span>Você pode criar lembretes aqui ou pelo WhatsApp quando a integração estiver pronta.</span></div>'}</div></div><aside class="panel"><div class="panel-head"><div><h2>Concluídas / encerradas</h2><p>Histórico recente.</p></div></div><div class="simple-history">${done.length ? done.slice(0,8).map((t) => `<div><span>✓</span><p><strong>${esc(t.title)}</strong><small>${esc(t.status || 'concluída')}</small></p></div>`).join('') : '<div class="personal-empty compact"><span>Ainda não há histórico.</span></div>'}</div></aside></section>
  </div>`
  $('taskQuickForm')?.addEventListener('submit', async (e) => { e.preventDefault(); const input=$('taskQuickInput'); const raw=input.value.trim(); if(!raw) return; const msg=/\b(lembra|lembrete|tarefa)\b/i.test(raw)?`Jarvis, ${raw}`:`Jarvis, me lembra de ${raw}`; if(await sendJarvisQuick(msg,$('taskQuickBtn'))) input.value='' })
}

function renderNotes() {
  if (!state.jarvis.loaded && !state.jarvis.loading) { loadJarvisData(); $('mainArea').innerHTML = personalLoading(); return }
  const notes = state.jarvis.notes
  $('mainArea').innerHTML = `<div class="content-stack personal-section">
    <section class="section-intro"><div><span class="eyebrow">NOTAS & IDEIAS</span><h2>Memória que você consegue encontrar.</h2><p>Ideias, referências e anotações capturadas pelo Jarvis, sem virar uma pilha de mensagens perdidas.</p></div></section>
    <section class="panel quick-capture"><div><span class="eyebrow">CAPTURA RÁPIDA</span><h3>O que você quer guardar?</h3></div><form id="noteQuickForm"><input id="noteQuickInput" type="text" placeholder="Ex.: ideia de vídeo sobre fluxo de caixa"><button id="noteQuickBtn" class="button primary" type="submit">Guardar</button></form></section>
    <section class="notes-grid">${notes.length ? notes.map((n) => `<article class="note-card"><div class="note-type">${esc(n.note_type || 'nota')}</div><h3>${esc(n.title || 'Nota')}</h3><p>${esc(n.content || '')}</p><footer><span>${esc(jarvisDateTime(n.created_at,{hour:undefined,minute:undefined}))}</span>${Array.isArray(n.tags) && n.tags.length ? `<small>${n.tags.slice(0,3).map(esc).join(' · ')}</small>` : ''}</footer></article>`).join('') : '<div class="personal-empty panel"><strong>Nenhuma nota ainda.</strong><span>Comece registrando uma ideia acima.</span></div>'}</section>
  </div>`
  $('noteQuickForm')?.addEventListener('submit', async (e) => { e.preventDefault(); const input=$('noteQuickInput'); const raw=input.value.trim(); if(!raw)return; if(await sendJarvisQuick(`Jarvis, anota: ${raw}`,$('noteQuickBtn'))) input.value='' })
}

function renderProjects() {
  if (!state.jarvis.loaded && !state.jarvis.loading) { loadJarvisData(); $('mainArea').innerHTML = personalLoading(); return }
  const projects = state.jarvis.projects
  $('mainArea').innerHTML = `<div class="content-stack personal-section">
    <section class="section-intro"><div><span class="eyebrow">PROJETOS</span><h2>Planos que ganham contexto.</h2><p>Viagens, trabalho, objetivos e iniciativas podem concentrar tarefas, notas, agenda, arquivos e finanças.</p></div></section>
    <section class="panel quick-capture"><div><span class="eyebrow">NOVO PROJETO</span><h3>Comece pela intenção.</h3></div><form id="projectQuickForm"><input id="projectQuickInput" type="text" placeholder="Ex.: criar um projeto para a viagem a Buenos Aires"><button id="projectQuickBtn" class="button primary" type="submit">Criar com Jarvis</button></form></section>
    <section class="projects-grid">${projects.length ? projects.map((p) => `<article class="project-card"><div class="project-mark">◇</div><div><span class="eyebrow">${esc(String(p.status || 'ATIVO').toUpperCase())}</span><h3>${esc(jarvisProjectName(p))}</h3><p>${esc(p.description || p.objective || 'Projeto organizado pelo Jarvis.')}</p><footer><span>Criado ${esc(jarvisDateTime(p.created_at,{hour:undefined,minute:undefined}))}</span></footer></div></article>`).join('') : '<div class="personal-empty panel"><strong>Nenhum projeto estruturado ainda.</strong><span>Crie uma viagem, objetivo ou iniciativa acima.</span></div>'}</section>
    <section class="project-vision panel"><div><span class="eyebrow">VISÃO 360º</span><h3>Um projeto não será só uma pasta.</h3><p>Na evolução do Jarvis, cada projeto poderá reunir compromissos, tarefas, notas, arquivos do Drive, lugares do Maps e contexto financeiro em uma única linha do tempo.</p></div><div class="project-vision-flow"><span>Agenda</span><b>+</b><span>Tarefas</span><b>+</b><span>Drive</span><b>+</b><span>Lugares</span><b>+</b><span>Finanças</span></div></section>
  </div>`
  $('projectQuickForm')?.addEventListener('submit', async (e) => { e.preventDefault(); const input=$('projectQuickInput'); const raw=input.value.trim(); if(!raw)return; if(await sendJarvisQuick(`Jarvis, crie um projeto para ${raw}`,$('projectQuickBtn'))) input.value='' })
}

function renderJarvis() {
  if (!state.jarvis.loaded && !state.jarvis.loading) {
    $('mainArea').innerHTML = `<div class="content-stack">${personalLoading()}<div class="skeleton-block h340"></div></div>`
    loadJarvisData()
    return
  }
  const messages = state.jarvis.messages
  const hasOpenAI = state.jarvis.engine === 'openai' || messages.some((m) => m.raw_data?.engine === 'openai')
  const cards = jarvisCreatedSummary()
  const google = jarvisGoogleConnection()
  const calendarActions = state.jarvis.actions.filter((x) => x.action_type === 'calendar_create' && ['proposed','failed'].includes(x.status))
  const pendingActions = state.jarvis.actions.filter((x) => x.status === 'proposed').length
  const loadError = state.jarvis.error ? `<div class="error-banner jarvis-load-error" role="alert"><span>${esc(state.jarvis.error)}</span><button id="jarvisRetryLoad" type="button">Tentar novamente</button></div>` : ''
  $('mainArea').innerHTML = `<div class="content-stack jarvis-view jarvis-v3-view">
    ${loadError}
    <section class="jarvis-hero jarvis-v3-hero jarvis-hero-with-face">
      <div class="jarvis-hero-copy"><span class="eyebrow">SEU ASSISTENTE PESSOAL</span><h2>Converse. O Jarvis organiza o resto.</h2><p>Uma única conversa para consultar seu ambiente, registrar contexto, preparar ações e conectar agenda, finanças, projetos e, em breve, WhatsApp, Drive e lugares.</p><div class="jarvis-statuses"><span class="jarvis-status ${hasOpenAI ? 'online' : 'local'}"><i></i>${hasOpenAI ? 'IA conectada' : 'IA disponível'}</span><span class="jarvis-status ${google ? 'online' : 'waiting'}"><i></i>Calendar ${google ? 'conectado' : 'pendente'}</span><span class="jarvis-status waiting"><i></i>WhatsApp em produção</span></div></div>
      ${jarvisPresenceMarkup(pendingActions ? 'attention' : 'idle', 'hero')}
    </section>
    <section class="jarvis-layout jarvis-v3-layout">
      <div class="panel jarvis-chat-panel">
        <div class="panel-head"><div><h2>Conversa</h2><p>Pergunte sobre seu painel ou peça uma ação. O mesmo cérebro será usado no WhatsApp.</p></div><button id="jarvisRefresh" class="button small" type="button">Atualizar</button></div>
        <div id="jarvisChat" class="jarvis-chat" aria-live="polite">
          ${messages.length ? messages.map((m) => `<div class="jarvis-message ${m.direction === 'inbound' ? 'user' : 'assistant'}"><div class="jarvis-bubble"><span>${esc(m.body || m.transcript || '')}</span>${m.direction === 'outbound' ? `<small>${esc(jarvisIntentLabel(m.intent))}</small>` : ''}</div></div>`).join('') : `<div class="jarvis-empty"><strong>Comece por qualquer assunto.</strong><span>Ex.: “O que tenho amanhã?”, “Quanto gastei este mês?” ou “Anota essa ideia...”.</span></div>`}
        </div>
        <div class="jarvis-quick-prompts">
          <button type="button" data-jarvis-prompt="Jarvis, o que eu tenho pendente hoje?">Meu dia</button>
          <button type="button" data-jarvis-prompt="Jarvis, quanto eu gastei este mês e o que merece atenção?">Finanças</button>
          <button type="button" data-jarvis-prompt="Jarvis, me mostra minhas últimas ideias e notas.">Notas</button>
          <button type="button" data-jarvis-prompt="Jarvis, quais projetos estão ativos?">Projetos</button>
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
          ${calendarActions.length ? `<div class="jarvis-calendar-actions">${calendarActions.map((a) => `<article><div><strong>${esc(a.payload?.title || 'Evento')}</strong><span>${esc(formatJarvisEvent(a.payload))}</span>${a.error_message ? `<small>${esc(a.error_message)}</small>` : ''}</div><button class="button primary small" type="button" data-jarvis-calendar-action="${esc(a.id)}" ${google ? '' : 'disabled'}>Confirmar</button></article>`).join('')}</div>` : '<div class="personal-empty compact"><span>Nenhuma ação externa pendente agora.</span></div>'}
        </section>
        <section class="panel jarvis-integrations-compact">
          <div class="panel-head"><div><h2>Integrações</h2><p>Um assistente, vários canais e serviços.</p></div></div>
          <div class="compact-integration ${google ? 'connected' : ''}"><span>31</span><div><strong>Google Calendar</strong><small>${google ? esc(google.display_name || 'Conectado') : 'Não conectado'}</small></div>${google ? '<b>✓</b>' : '<button id="jarvisGoogleConnect" class="button small" type="button">Conectar</button>'}</div>
          <div class="compact-integration configuring"><span>WA</span><div><strong>WhatsApp</strong><small>Número dedicado aguardando ativação</small></div><b>…</b></div>
          <div class="compact-integration future"><span>D</span><div><strong>Google Drive</strong><small>Próxima integração</small></div><b>＋</b></div>
        </section>
        <section class="panel"><div class="panel-head"><div><h2>Memória estruturada</h2><p>O que já existe por trás da conversa.</p></div></div><div class="jarvis-metric-list">${cards.map(([label,value,sub]) => `<div><span>${esc(label)}</span><strong>${value}</strong><small>${esc(sub)}</small></div>`).join('')}</div></section>
        <section class="panel jarvis-rules"><span class="eyebrow">COMO O JARVIS AGE</span><h3>Conversa primeiro. Ação com contexto.</h3><p>Notas, ideias e contexto financeiro podem ser registrados diretamente. Ações externas sensíveis continuam pedindo confirmação.</p><div><span>Painel</span><b>Central visual</b></div><div><span>WhatsApp</span><b>Canal móvel</b></div><div><span>Dados</span><b>Mesmo núcleo</b></div></section>
      </aside>
    </section>
  </div>`
  $('jarvisRetryLoad')?.addEventListener('click', () => { state.jarvis.loaded = false; state.jarvis.error = null; loadJarvisData(true) })
  $('jarvisRefresh')?.addEventListener('click', () => loadJarvisData(true))
  $('jarvisGoogleConnect')?.addEventListener('click', connectJarvisGoogleCalendar)
  document.querySelectorAll('[data-jarvis-calendar-action]').forEach((b) => b.addEventListener('click', () => executeJarvisCalendarAction(b.dataset.jarvisCalendarAction)))
  document.querySelectorAll('[data-jarvis-prompt]').forEach((b) => b.addEventListener('click', () => { $('jarvisInput').value = b.dataset.jarvisPrompt; $('jarvisInput').focus() }))
  $('jarvisForm')?.addEventListener('submit', sendJarvisMessage)
  $('jarvisInput')?.addEventListener('focus', () => setJarvisVisualState('listening'))
  $('jarvisInput')?.addEventListener('input', () => setJarvisVisualState('listening'))
  $('jarvisInput')?.addEventListener('blur', () => { if (!$('jarvisInput')?.value.trim()) setJarvisVisualState(pendingActions ? 'attention' : 'idle') })
  requestAnimationFrame(() => { const chat = $('jarvisChat'); if (chat) chat.scrollTop = chat.scrollHeight; setJarvisVisualState(pendingActions ? 'attention' : 'idle') })
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
