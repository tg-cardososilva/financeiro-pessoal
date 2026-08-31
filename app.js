import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4/+esm'

const SUPABASE_URL = 'https://qhpkraqrcvhhtbqjhkmm.supabase.co'
const SUPABASE_KEY = 'sb_publishable_OXgobfJOCgDy4OP2n_zKgg_tOvEa28F'
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
})

const $ = (id) => document.getElementById(id)
const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const monthFmt = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' })
const dateFmt = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' })
const fullDateFmt = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })

const state = {
  session: null,
  view: 'overview',
  realView: true,
  month: monthKey(new Date()),
  accounts: [],
  categories: [],
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
  dismissedSuggestions: new Set()
}

function esc(v = '') {
  return String(v).replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]))
}
function monthKey(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` }
function parseDate(s) { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, m - 1, d) }
function setHidden(el, hide) { if (el) el.classList.toggle('hidden', !!hide) }
function displayDescription(t) { return t?.display_description?.trim() || t?.description || 'Movimentação' }
function accountById(id) { return state.accounts.find((a) => a.id === id) }
function categoryById(id) { return state.categories.find((c) => c.id === id) }
function purchaseById(id) { return state.purchases.find((p) => p.id === id) }
function num(v) { const n = Number(v); return Number.isFinite(n) ? n : 0 }
function parseMoneyInput(v) {
  const clean = String(v || '').trim().replace(/\s/g, '').replace(/R\$/gi, '').replace(/\./g, '').replace(',', '.').replace(/[^0-9.-]/g, '')
  const n = Number(clean)
  return Number.isFinite(n) ? n : NaN
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
  $('monthPicker').value = state.month
  bindGlobalEvents()
  const { data } = await supabase.auth.getSession()
  state.session = data.session
  supabase.auth.onAuthStateChange((event, session) => {
    state.session = session
    renderSession()
    if (event === 'PASSWORD_RECOVERY' && session) setTimeout(openPasswordResetModal, 120)
  })
  renderSession()
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
  document.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => navigate(b.dataset.view)))
  $('monthPicker').addEventListener('change', () => { state.month = $('monthPicker').value; state.selectedTx.clear(); loadData() })
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
}

function toggleSidebar(open) { $('sidebar').classList.toggle('open', open); setHidden($('mobileOverlay'), !open) }

function renderSession() {
  setHidden($('splash'), true)
  const signed = !!state.session
  setHidden($('authView'), signed)
  setHidden($('appView'), !signed)
  if (signed) {
    const email = state.session.user.email || 'usuario'
    $('userEmail').textContent = email
    $('userName').textContent = state.profile?.display_name || email.split('@')[0]
    $('userAvatar').textContent = (state.profile?.display_name || email)[0].toUpperCase()
    loadData()
  }
}

function setAuthMode(mode) {
  state.authMode = mode
  showInfo('authMessage', '')
  const map = {
    signin: ['Entrar no painel', 'Use seu e-mail e senha para acessar seus dados.', 'Entrar'],
    signup: ['Criar uma conta', 'Cada pessoa terá dados separados e privados.', 'Criar conta'],
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
  document.querySelectorAll('.nav-button').forEach((b) => b.classList.toggle('active', b.dataset.view === view))
  $('pageTitle').textContent = {
    overview: 'Visão geral', transactions: 'Transações', purchases: 'Compras', import: 'Importar extrato', accounts: 'Contas'
  }[view]
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
    const [acc, cat, tx, pur, profile, budget] = await Promise.all([
      supabase.from('accounts').select('*').eq('active', true).order('created_at'),
      supabase.from('categories').select('*').eq('active', true).order('group_name').order('name'),
      supabase.from('transactions').select('*, accounts(name,institution,account_type), categories(name,group_name,kind)').gte('transaction_date', start).lt('transaction_date', end).order('transaction_date', { ascending: false }).order('created_at', { ascending: false }).limit(1600),
      supabase.from('purchases').select('*').gte('purchase_date', start).lt('purchase_date', end).neq('status', 'ignored').order('purchase_date', { ascending: false }),
      supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),
      supabase.from('budgets').select('*').eq('month', monthDate).is('category_id', null).maybeSingle()
    ])
    const err = acc.error || cat.error || tx.error || pur.error || profile.error || budget.error
    if (err) throw err
    state.accounts = acc.data || []
    state.categories = cat.data || []
    state.transactions = tx.data || []
    state.purchases = pur.data || []
    state.profile = profile.data || null
    state.preferences = { use_purchase_details: false, ...(state.profile?.preferences || {}) }
    state.budget = budget.data || null

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
  } catch (err) {
    showError(humanError(err))
  } finally {
    state.loading = false
    renderMain()
  }
}

function updateUserChrome() {
  const email = state.session?.user?.email || 'usuario'
  const name = state.profile?.display_name || email.split('@')[0]
  $('userName').textContent = name
  $('userAvatar').textContent = name[0]?.toUpperCase() || 'U'
  const review = state.transactions.filter((t) => t.review_status === 'needs_review').length
  $('reviewBadge').textContent = review
  setHidden($('reviewBadge'), !review)
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
  if (state.view === 'overview') renderOverview()
  if (state.view === 'transactions') renderTransactions()
  if (state.view === 'purchases') renderPurchases()
  if (state.view === 'import') renderImport()
  if (state.view === 'accounts') renderAccounts()
}

function calcTotals(tx) {
  return tx.reduce((a, t) => {
    const v = num(t.amount)
    const accountType = t.accounts?.account_type || accountById(t.account_id)?.account_type
    if (['income', 'yield'].includes(t.flow_type) && v > 0) {
      if (accountType === 'benefit') a.benefits += v
      else if (accountType === 'virtual') a.thirdPartyIncome += v
      else a.cashIncome += v
      if (t.flow_type === 'yield') a.yields += v
    }
    if (t.flow_type === 'expense') {
      a.expense += Math.abs(v)
      if (accountType === 'benefit') a.benefitSpend += Math.abs(v)
    }
    if (t.flow_type === 'investment') a.invest += Math.abs(v)
    return a
  }, { cashIncome: 0, benefits: 0, thirdPartyIncome: 0, expense: 0, invest: 0, yields: 0, benefitSpend: 0 })
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
  const resources = totals.cashIncome + totals.benefits + totals.thirdPartyIncome
  const result = resources - totals.expense - totals.invest
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
      ${kpi('Entradas em dinheiro', money.format(totals.cashIncome), 'Receitas e rendimentos em contas', 'Dinheiro')}
      ${kpi('Benefícios recebidos', money.format(totals.benefits), `${money.format(totals.benefitSpend)} usados no mês`, 'Benefício', 'benefit')}
      ${kpi('Gastos reais', money.format(totals.expense), 'Sem transferências internas', 'Consumo')}
      ${kpi('Resultado do mês', money.format(result), `${money.format(totals.invest)} em aportes · inclui pagamentos por terceiros`, result >= 0 ? 'Positivo' : 'Atenção', result >= 0 ? 'positive' : '')}
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
  bindTransactionOpeners()
}

function kpi(label, value, helper, chip, tone = '') {
  return `<article class="kpi-card ${tone}"><div class="kpi-head"><span>${esc(label)}</span><span class="kpi-chip">${esc(chip)}</span></div><strong>${esc(value)}</strong><small>${esc(helper)}</small></article>`
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
  return `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Evolução do saldo"><defs><linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#102535" stop-opacity=".12"/><stop offset="100%" stop-color="#102535" stop-opacity="0"/></linearGradient></defs><line x1="${p}" y1="${h - p}" x2="${w - p}" y2="${h - p}" stroke="#e6e9e6"/><line x1="${p}" y1="${h / 2}" x2="${w - p}" y2="${h / 2}" stroke="#edf0ed"/><path d="${area}" class="chart-fill"/><path d="${d}" class="chart-line"/><circle cx="${pts.at(-1)[0]}" cy="${pts.at(-1)[1]}" r="5" fill="#102535"/><text x="${p}" y="${h - 5}" class="chart-label">01</text><text x="${w / 2}" y="${h - 5}" text-anchor="middle" class="chart-label">15</text><text x="${w - p}" y="${h - 5}" text-anchor="end" class="chart-label">${values.length}</text></svg>`
}
function categoryBars(cats) {
  const max = cats[0]?.[1] || 1
  return `<div class="category-bars">${cats.map(([n, v], i) => `<div><div class="cat-line"><span>${esc(n)}</span><strong>${money.format(v)}</strong></div><div class="cat-track"><div class="cat-fill shade-${i}" style="width:${Math.max(3, v / max * 100)}%"></div></div></div>`).join('')}</div>`
}
function accountIcon(a) {
  const cls = a.account_type === 'benefit' ? 'benefit' : a.account_type === 'virtual' ? 'virtual' : ''
  const icon = a.account_type === 'credit_card' ? '▣' : a.account_type === 'benefit' ? 'B' : a.account_type === 'virtual' ? '⌂' : a.account_type === 'savings' ? '◇' : '◈'
  return `<div class="account-icon ${cls}">${icon}</div>`
}
function accountRow(a) {
  const movement = state.transactions.filter((t) => t.account_id === a.id).reduce((s, t) => s + num(t.amount), 0)
  return `<div class="account-row">${accountIcon(a)}<div class="account-copy"><strong>${esc(a.name)}</strong><span>${esc(a.institution.replaceAll('_', ' '))}</span></div><strong>${money.format(movement)}</strong></div>`
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
      <div id="selectionBar"></div><div id="txList" class="tx-table"></div>
    </section>
  </div>`

  let filter = 'all'
  const draw = () => {
    const q = $('txSearch').value.trim().toLowerCase()
    const acc = $('txAccount').value
    const cat = $('txCategory').value
    const rows = state.transactions.filter((t) => {
      const hay = `${displayDescription(t)} ${t.description || ''} ${t.merchant || ''} ${(t.tags || []).join(' ')}`.toLowerCase()
      const statusMatch = filter === 'all' || (filter === 'needs_review' && t.review_status === 'needs_review') || (filter === 'expense' && t.flow_type === 'expense') || (filter === 'income' && ['income', 'yield'].includes(t.flow_type)) || (filter === 'grouped' && !!t.purchase_id)
      return (!q || hay.includes(q)) && (!acc || t.account_id === acc) && (!cat || t.category_id === cat) && statusMatch
    })
    $('txList').innerHTML = rows.length ? rows.map((t) => transactionRow(t, { selectMode: state.selectionMode })).join('') : empty('Nenhuma transação com esses filtros.')
    renderSelectionBar()
    bindTransactionOpeners()
    document.querySelectorAll('[data-select-tx]').forEach((c) => c.addEventListener('change', (e) => {
      e.stopPropagation()
      if (c.checked) state.selectedTx.add(c.dataset.selectTx); else state.selectedTx.delete(c.dataset.selectTx)
      renderSelectionBar()
    }))
  }
  const renderSelectionBar = () => {
    if (!state.selectionMode) { $('selectionBar').innerHTML = ''; return }
    $('selectionBar').innerHTML = `<div class="selection-bar"><span>${state.selectedTx.size ? `${state.selectedTx.size} pagamento(s) selecionado(s)` : 'Selecione dois ou mais pagamentos da mesma compra'}</span><div class="selection-actions"><button id="cancelSelection" class="button small" type="button">Cancelar</button><button id="confirmGroup" class="button primary small" type="button" ${state.selectedTx.size >= 2 ? '' : 'disabled'}>Agrupar como compra</button></div></div>`
    $('cancelSelection').addEventListener('click', () => { state.selectionMode = false; state.selectedTx.clear(); draw() })
    $('confirmGroup').addEventListener('click', () => openGroupModal([...state.selectedTx]))
  }

  $('txSearch').addEventListener('input', draw)
  $('txAccount').addEventListener('change', draw)
  $('txCategory').addEventListener('change', draw)
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
      <label class="field-label">Conta<select id="editAccount">${state.accounts.map((a) => `<option value="${a.id}" ${a.id === t.account_id ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select></label>
      <label class="field-label">Tipo<select id="editFlow"><option value="expense" ${t.flow_type === 'expense' ? 'selected' : ''}>Despesa</option><option value="income" ${t.flow_type === 'income' ? 'selected' : ''}>Receita</option><option value="yield" ${t.flow_type === 'yield' ? 'selected' : ''}>Rendimento</option><option value="transfer" ${t.flow_type === 'transfer' ? 'selected' : ''}>Transferência</option><option value="investment" ${t.flow_type === 'investment' ? 'selected' : ''}>Investimento</option><option value="adjustment" ${t.flow_type === 'adjustment' ? 'selected' : ''}>Ajuste</option></select></label>
      <label class="field-label">Categoria<select id="editCategory"><option value="">Sem categoria</option>${relevantCategories.map((c) => `<option value="${c.id}" ${c.id === t.category_id ? 'selected' : ''}>${esc(c.group_name)} · ${esc(c.name)}</option>`).join('')}</select></label>
      <label class="field-label full-span">Observação<textarea id="editNotes" placeholder="Contexto que ajude você no futuro">${esc(t.notes || '')}</textarea></label>
      <label class="field-label full-span">Tags<input id="editTags" value="${esc((t.tags || []).join(', '))}" placeholder="ex.: mercado, casa, viagem"><span class="tag-input-help">Separe as tags por vírgula.</span></label>
    </div>
    <div class="toggle-row"><div><strong>Incluir no orçamento</strong><p>Desative quando a movimentação não representar consumo do mês.</p></div><label class="switch"><input id="editBudget" type="checkbox" ${t.include_in_budget ? 'checked' : ''}><span class="switch-track"></span></label></div>
    <div class="toggle-row"><div><strong>Transferência entre minhas contas</strong><p>Evita que a movimentação seja tratada como gasto ou receita real.</p></div><label class="switch"><input id="editInternal" type="checkbox" ${t.is_internal_transfer ? 'checked' : ''}><span class="switch-track"></span></label></div>
    <div class="source-box"><div class="source-box-title">DADO ORIGINAL / FONTE</div><div class="source-grid"><div><span>Descrição original</span><strong>${esc(originalDescription)}</strong></div><div><span>Valor original</span><strong>${money.format(num(originalAmount))}</strong></div><div><span>Data original</span><strong>${esc(fullDateFmt.format(parseDate(originalDate)))}</strong></div><div><span>Origem</span><strong>${esc(sourceAccount)} · ${esc(t.transaction_source)}</strong></div></div></div>
    ${t.transaction_source === 'import' && rulePattern ? `<div class="toggle-row"><div><strong>Criar regra automática com esta edição</strong><p>Próximas transações que contenham “${esc(rulePattern)}” recebem esta categoria automaticamente.</p></div><label class="switch"><input id="createRule" type="checkbox"><span class="switch-track"></span></label></div>` : ''}
    <div id="txEditMessage" class="form-message hidden"></div>
    <div class="modal-actions"><div>${t.flow_type === 'expense' ? '<button id="splitTx" class="button" type="button">≡ Dividir em categorias</button>' : ''}</div><div class="modal-actions-right"><button id="cancelModal" class="button" type="button">Cancelar</button><button id="saveTx" class="button primary" type="submit">✓ Salvar alterações</button></div></div>
  </form></div>`

  const close = () => { modal.innerHTML = '' }
  $('closeModal').addEventListener('click', close)
  $('cancelModal').addEventListener('click', close)
  $('splitTx')?.addEventListener('click', () => openSplitModal(t.id))
  $('editInternal').addEventListener('change', () => { if ($('editInternal').checked) $('editFlow').value = 'transfer' })

  $('txEditForm').addEventListener('submit', async (e) => {
    e.preventDefault()
    const btn = $('saveTx')
    setBusy(btn, true, 'Salvando')
    showInfo('txEditMessage', '')
    try {
      const metadata = { ...(t.metadata || {}) }
      if (!metadata.source_snapshot && t.transaction_source === 'import') {
        metadata.source_snapshot = { description: t.description, transaction_date: t.transaction_date, amount: t.amount, account_id: t.account_id, flow_type: t.flow_type }
      }
      const tags = $('editTags').value.split(',').map((x) => x.trim()).filter(Boolean).slice(0, 12)
      const display = $('editDisplay').value.trim()
      const flow = $('editFlow').value
      const categoryId = $('editCategory').value || null
      const accountId = $('editAccount').value
      const internal = $('editInternal').checked
      const { error } = await supabase.from('transactions').update({
        display_description: display || null,
        transaction_date: $('editDate').value,
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

      if ($('createRule')?.checked && rulePattern && categoryId) {
        const acc = accountById(accountId)
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
      toast('Transação atualizada.', 'success')
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

function renderImport() {
  state.import ??= { step: 1, accountId: state.accounts.find((a) => ['checking', 'credit_card'].includes(a.account_type))?.id || state.accounts[0]?.id || '', file: null, rows: [], message: '', filter: 'all' }
  const imp = state.import
  if (!state.accounts.some((a) => a.id === imp.accountId)) imp.accountId = state.accounts[0]?.id || ''
  const steps = `<section class="import-steps">${step('1', 'Arquivo', imp.step)}<div class="step-line"></div>${step('2', 'Conferência', imp.step)}<div class="step-line"></div>${step('3', 'Concluído', imp.step)}</section>`

  if (imp.step === 1) {
    $('mainArea').innerHTML = `<div class="content-stack">${steps}<section class="dashboard-grid import-grid"><div class="panel">${panelHead('Selecione o extrato', 'Inter OFX/CSV já está habilitado. O sistema faz uma prévia antes de gravar.')}
      <label class="field-label">Conta de origem<select id="importAccount">${state.accounts.map((a) => `<option value="${a.id}" ${a.id === imp.accountId ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select></label>
      <label class="dropzone"><div class="drop-icon">⇧</div><strong>${imp.file ? esc(imp.file.name) : 'Escolher arquivo'}</strong><span>${imp.file ? `${(imp.file.size / 1024).toFixed(1)} KB` : 'OFX ou CSV · até 10 MB'}</span><input id="importFile" type="file" accept=".ofx,.csv,text/csv"></label>
      <button id="analyzeBtn" class="button primary full" type="button">✦ Analisar extrato</button><div id="importMessage" class="form-message ${imp.message ? '' : 'hidden'}">${esc(imp.message)}</div></div>
      <div class="panel">${panelHead('O que acontece antes de importar', 'A revisão evita que o banco dite sozinho como você entende seus gastos.')}<div class="check-list">${checkItem('Duplicidades', 'O mesmo extrato pode ser enviado novamente sem replicar lançamentos.')}${checkItem('Categoria sugerida', 'Você pode corrigir a categoria antes da importação.')}${checkItem('Fila de revisão', 'Descrições incertas ficam marcadas para você revisar depois.')}${checkItem('Compra real', 'Depois da importação, pagamentos do mesmo mercado podem ser agrupados.')}</div></div></section></div>`
    $('importAccount').addEventListener('change', (e) => { imp.accountId = e.target.value })
    $('importFile').addEventListener('change', (e) => { imp.file = e.target.files?.[0] || null; imp.message = ''; renderImport() })
    $('analyzeBtn').addEventListener('click', analyzeImport)
    return
  }

  if (imp.step === 2) {
    const fresh = imp.rows.filter((r) => !r.duplicate)
    const dup = imp.rows.filter((r) => r.duplicate)
    const review = fresh.filter((r) => !r.category_id)
    const filtered = imp.rows.filter((r) => imp.filter === 'all' || (imp.filter === 'review' && !r.duplicate && !r.category_id) || (imp.filter === 'duplicates' && r.duplicate))
    $('mainArea').innerHTML = `<div class="content-stack">${steps}<section class="panel"><div class="review-head"><div><span class="eyebrow">PRÉVIA DO EXTRATO</span><h2>${fresh.length} novas · ${dup.length} já existentes</h2><p class="muted">Você pode ajustar as categorias agora. A descrição original permanece intacta.</p></div><button id="changeFile" class="button" type="button">Trocar arquivo</button></div><div class="review-summary">${summaryChip('Novas', fresh.length)}${summaryChip('Duplicadas', dup.length)}${summaryChip('Para revisar', review.length)}</div><div class="review-filter"><button class="filter-pill ${imp.filter === 'all' ? 'active' : ''}" data-review-filter="all" type="button">Todas</button><button class="filter-pill ${imp.filter === 'review' ? 'active' : ''}" data-review-filter="review" type="button">Só para revisar</button><button class="filter-pill ${imp.filter === 'duplicates' ? 'active' : ''}" data-review-filter="duplicates" type="button">Duplicadas</button></div><div class="review-table">${filtered.slice(0, 220).map(reviewRow).join('')}</div><div class="review-actions"><span>${review.length ? `${review.length} lançamento(s) podem ser importados e revisados depois.` : 'Todas as novas transações estão categorizadas.'}</span><button id="confirmImport" class="button primary" type="button" ${fresh.length ? '' : 'disabled'}>✓ Importar ${fresh.length} novas</button></div><div id="importMessage" class="form-message ${imp.message ? '' : 'hidden'}">${esc(imp.message)}</div></section></div>`
    $('changeFile').addEventListener('click', () => { imp.step = 1; imp.rows = []; imp.message = ''; renderImport() })
    document.querySelectorAll('[data-review-filter]').forEach((b) => b.addEventListener('click', () => { imp.filter = b.dataset.reviewFilter; renderImport() }))
    document.querySelectorAll('[data-import-cat]').forEach((s) => s.addEventListener('change', () => {
      const row = imp.rows.find((r) => r._key === s.dataset.importCat)
      if (row) { row.category_id = s.value || null; row.userEdited = true; renderImport() }
    }))
    $('confirmImport').addEventListener('click', confirmImport)
    return
  }

  $('mainArea').innerHTML = `<div class="content-stack">${steps}<section class="panel success-panel"><div class="success-icon">✓</div><h2>Extrato importado.</h2><p>Novas transações foram adicionadas, duplicidades ignoradas e itens incertos ficaram disponíveis na fila de revisão.</p><div class="section-actions" style="justify-content:center"><button id="goTransactions" class="button" type="button">Revisar transações</button><button id="importAgain" class="button primary" type="button">Importar outro extrato</button></div></section></div>`
  $('goTransactions').addEventListener('click', () => navigate('transactions'))
  $('importAgain').addEventListener('click', () => { state.import = { step: 1, accountId: state.accounts[0]?.id || '', file: null, rows: [], message: '', filter: 'all' }; renderImport() })
}
function step(n, label, current) { const done = current > Number(n), active = current === Number(n); return `<div class="step ${done ? 'done' : ''} ${active ? 'active' : ''}"><span>${done ? '✓' : n}</span><strong>${esc(label)}</strong></div>` }
function checkItem(title, text) { return `<div class="check-item"><div>✓</div><p><strong>${esc(title)}</strong><span>${esc(text)}</span></p></div>` }
function summaryChip(label, value) { return `<div class="summary-chip"><span>${esc(label)}</span><strong>${value}</strong></div>` }
function reviewRow(r) {
  const cats = state.categories.filter((c) => r.flow_type === 'expense' ? c.kind === 'expense' : ['income', 'yield'].includes(r.flow_type) ? c.kind === 'income' : c.kind === 'transfer')
  return `<div class="review-row ${r.duplicate ? 'duplicate' : ''}"><div class="review-main"><strong>${esc(r.description)}</strong><span>${esc(dateFmt.format(parseDate(r.transaction_date)))} · ${r.duplicate ? 'já existe' : r.category_id ? 'categorizada' : 'precisa revisar'}</span></div><select data-import-cat="${r._key}" ${r.duplicate ? 'disabled' : ''}><option value="">Sem categoria</option>${cats.map((c) => `<option value="${c.id}" ${c.id === r.category_id ? 'selected' : ''}>${esc(c.group_name)} · ${esc(c.name)}</option>`).join('')}</select><span class="flow-chip">${r.is_internal_transfer ? 'Transferência' : esc(r.flow_type)}</span><span class="amount">${money.format(num(r.amount))}</span></div>`
}
function inferProfile(account, file) {
  const ext = file.name.toLowerCase().split('.').pop()
  if (account.institution === 'inter' && account.account_type === 'credit_card') return 'inter_card_csv'
  if (account.institution === 'inter' && account.account_type === 'checking' && ext === 'ofx') return 'inter_ofx'
  if (account.institution === 'inter' && account.account_type === 'checking') return 'inter_checking_csv'
  return ''
}
async function analyzeImport() {
  const imp = state.import
  const account = state.accounts.find((a) => a.id === imp.accountId)
  if (!imp.file || !account) { imp.message = 'Selecione uma conta e um arquivo.'; renderImport(); return }
  const profile = inferProfile(account, imp.file)
  if (!profile) {
    imp.message = account.account_type === 'benefit'
      ? 'O cartão alimentação já está criado como conta. Para automatizar o extrato, preciso do arquivo exportado pelo app para mapear o formato.'
      : 'Este formato ainda não está habilitado. Envie um arquivo exportado dessa instituição para eu mapear o parser.'
    renderImport(); return
  }
  const btn = $('analyzeBtn'); setBusy(btn, true, 'Analisando')
  try {
    const text = await imp.file.text()
    const { data, error } = await supabase.functions.invoke('parse-finance-import', { body: { profile, text } })
    if (error) throw error
    const parsed = data?.rows || []
    const fps = parsed.map((r) => r.fingerprint)
    const existing = []
    for (let i = 0; i < fps.length; i += 100) {
      const { data: found, error: e } = await supabase.from('transactions').select('source_fingerprint').in('source_fingerprint', fps.slice(i, i + 100))
      if (e) throw e
      existing.push(...(found || []).map((x) => x.source_fingerprint))
    }
    const set = new Set(existing)
    const catMap = new Map(state.categories.map((c) => [c.name, c.id]))
    imp.rows = parsed.map((r, i) => ({ ...r, _key: `${i}-${r.fingerprint.slice(0, 8)}`, duplicate: set.has(r.fingerprint), category_id: r.category_hint ? catMap.get(r.category_hint) || null : null, userEdited: false }))
    imp.step = 2; imp.filter = 'all'; imp.message = ''; renderImport()
  } catch (err) { imp.message = humanError(err); renderImport() }
}
async function sha256(text) { const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)); return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('') }
async function confirmImport() {
  const imp = state.import
  const fresh = imp.rows.filter((r) => !r.duplicate)
  const account = state.accounts.find((a) => a.id === imp.accountId)
  if (!imp.file || !account || !fresh.length) return
  const btn = $('confirmImport'); setBusy(btn, true, 'Importando')
  try {
    const user = state.session.user
    const hash = await sha256(await imp.file.text())
    const { data: batch, error: bErr } = await supabase.from('import_batches').insert({ user_id: user.id, account_id: account.id, file_name: imp.file.name, file_hash: hash, institution: account.institution, source_format: imp.file.name.toLowerCase().endsWith('.ofx') ? 'ofx' : 'csv', status: 'confirmed', row_count: imp.rows.length, duplicate_count: imp.rows.length - fresh.length, review_count: fresh.filter((r) => !r.category_id).length, confirmed_at: new Date().toISOString() }).select('id').single()
    if (bErr) { if (bErr.code === '23505') { imp.message = 'Esse arquivo já foi importado anteriormente.'; renderImport(); return } throw bErr }
    const payload = fresh.map((r) => ({ user_id: user.id, account_id: account.id, category_id: r.category_id || null, import_batch_id: batch.id, transaction_date: r.transaction_date, description: r.description, display_description: null, merchant: r.merchant, amount: r.amount, flow_type: r.flow_type, is_internal_transfer: r.is_internal_transfer, include_in_budget: r.include_in_budget, transaction_source: 'import', source_record_id: r.source_record_id, source_fingerprint: r.fingerprint, review_status: r.category_id ? (r.userEdited ? 'reviewed' : 'auto') : 'needs_review', tags: [], metadata: r.raw_data }))
    const { error } = await supabase.from('transactions').insert(payload)
    if (error) throw error
    imp.step = 3
    await loadData()
    state.view = 'import'
    renderImport()
  } catch (err) { imp.message = humanError(err); renderImport() }
}

function renderAccounts() {
  const activity = (id) => state.transactions.filter((t) => t.account_id === id).reduce((s, t) => s + num(t.amount), 0)
  $('mainArea').innerHTML = `<div class="content-stack"><section class="section-header"><div><span class="muted">Fontes financeiras</span><h2>Contas e benefícios</h2><p>Benefícios ficam separados da renda em dinheiro, mas entram na visão de consumo real.</p></div><div class="section-actions"><button id="addAccount" class="button primary" type="button">＋ Adicionar conta</button></div></section><section class="accounts-grid">${state.accounts.map((a) => `<button class="account-card" data-edit-account="${a.id}" type="button"><div class="account-card-top">${accountIcon(a)}<span class="panel-tag ${a.account_type === 'benefit' ? 'benefit' : ''}">${esc(accountTypeLabel(a.account_type))}</span></div><span class="institution">${esc(a.institution.replaceAll('_', ' '))}</span><h3>${esc(a.name)}</h3><div class="account-activity"><span>Movimento no mês</span><strong>${money.format(activity(a.id))}</strong></div><div class="account-footer"><span>${a.account_type === 'benefit' ? 'Não é renda bancária' : a.include_in_net_worth ? 'Inclui no patrimônio' : 'Conta de controle'}</span><span>Editar →</span></div></button>`).join('')}</section></div>`
  $('addAccount').addEventListener('click', () => openAccountModal())
  document.querySelectorAll('[data-edit-account]').forEach((b) => b.addEventListener('click', () => openAccountModal(b.dataset.editAccount)))
}
function accountTypeLabel(type) { return ({ checking: 'Conta corrente', credit_card: 'Cartão', wallet: 'Carteira', savings: 'Reserva', investment: 'Investimento', virtual: 'Controle', benefit: 'Benefício' })[type] || type }
function openAccountModal(id = null) {
  const a = id ? accountById(id) : null
  const modal = $('modalHost')
  modal.innerHTML = `<div class="modal-backdrop"><form id="accountForm" class="modal"><div class="modal-head"><div><span class="eyebrow">${a ? 'EDITAR CONTA' : 'NOVA CONTA'}</span><h2>${a ? esc(a.name) : 'Adicionar fonte financeira'}</h2></div><button id="closeModal" class="icon-button" type="button">×</button></div><div class="form-grid"><label class="field-label full-span">Nome<input id="accountName" value="${esc(a?.name || '')}" placeholder="Ex.: Cartão Alimentação"></label><label class="field-label">Instituição<input id="accountInstitution" value="${esc(a?.institution || '')}" placeholder="Ex.: inter"></label><label class="field-label">Tipo<select id="accountType"><option value="checking">Conta corrente</option><option value="credit_card">Cartão de crédito</option><option value="wallet">Carteira</option><option value="savings">Reserva / poupança</option><option value="investment">Investimento</option><option value="benefit">Benefício</option><option value="virtual">Conta de controle</option></select></label></div><div class="toggle-row"><div><strong>Incluir no patrimônio</strong><p>Benefícios e contas de controle normalmente ficam fora do patrimônio.</p></div><label class="switch"><input id="accountNetWorth" type="checkbox" ${a ? (a.include_in_net_worth ? 'checked' : '') : 'checked'}><span class="switch-track"></span></label></div><div id="accountMessage" class="form-message hidden"></div><div class="modal-actions"><span></span><div class="modal-actions-right"><button id="cancelModal" class="button" type="button">Cancelar</button><button id="saveAccount" class="button primary" type="submit">✓ Salvar</button></div></div></form></div>`
  $('accountType').value = a?.account_type || 'checking'
  const close = () => { modal.innerHTML = '' }
  $('closeModal').addEventListener('click', close); $('cancelModal').addEventListener('click', close)
  $('accountType').addEventListener('change', () => { if (['benefit', 'virtual'].includes($('accountType').value)) $('accountNetWorth').checked = false })
  $('accountForm').addEventListener('submit', async (e) => {
    e.preventDefault(); const btn = $('saveAccount'); setBusy(btn, true, 'Salvando')
    try {
      const payload = { name: $('accountName').value.trim(), institution: $('accountInstitution').value.trim().toLowerCase().replace(/\s+/g, '_') || 'manual', account_type: $('accountType').value, include_in_net_worth: $('accountNetWorth').checked }
      if (!payload.name) throw new Error('Informe um nome para a conta.')
      const query = a ? supabase.from('accounts').update(payload).eq('id', a.id) : supabase.from('accounts').insert({ ...payload, user_id: state.session.user.id, currency: 'BRL', active: true })
      const { error } = await query
      if (error) throw error
      close(); toast(a ? 'Conta atualizada.' : 'Conta adicionada.', 'success'); await loadData()
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

function openEntryModal() {
  const modal = $('modalHost')
  let mode = 'expense'
  render()
  function render() {
    const cats = state.categories.filter((c) => mode === 'income' ? c.kind === 'income' : c.kind === 'expense')
    modal.innerHTML = `<div class="modal-backdrop"><form id="entryForm" class="modal"><div class="modal-head"><div><span class="eyebrow">NOVO LANÇAMENTO</span><h2>Registrar movimentação</h2></div><button id="closeModal" class="icon-button" type="button">×</button></div><div class="modal-tabs"><button data-entry-mode="expense" class="${mode === 'expense' ? 'active' : ''}" type="button">Despesa</button><button data-entry-mode="income" class="${mode === 'income' ? 'active' : ''}" type="button">Receita</button><button data-entry-mode="third_party" class="${mode === 'third_party' ? 'active' : ''}" type="button">Pago por terceiro</button></div><div class="form-grid"><label class="field-label">Data<input id="entryDate" type="date" value="${new Date().toISOString().slice(0, 10)}" required></label><label class="field-label">Valor<input id="entryAmount" inputmode="decimal" placeholder="0,00" required></label><label class="field-label full-span">Descrição<input id="entryDescription" placeholder="${mode === 'third_party' ? 'Ex.: Aluguel + condomínio' : 'Ex.: supermercado'}"></label>${mode !== 'third_party' ? `<label class="field-label">Conta<select id="entryAccount">${state.accounts.map((a) => `<option value="${a.id}">${esc(a.name)}</option>`).join('')}</select></label>` : ''}<label class="field-label">Categoria<select id="entryCategory">${cats.map((c) => `<option value="${c.id}">${esc(c.group_name)} · ${esc(c.name)}</option>`).join('')}</select></label><label class="field-label full-span">Observação<textarea id="entryNotes" placeholder="Opcional"></textarea></label></div>${mode === 'third_party' ? '<div class="third-party-note"><span>⌂</span><span>Esse gasto entra na sua vida financeira real, mas não altera o saldo do Inter, Mercado Pago ou outra conta bancária.</span></div>' : ''}<div id="entryMessage" class="form-message hidden"></div><div class="modal-actions"><span></span><div class="modal-actions-right"><button id="cancelModal" class="button" type="button">Cancelar</button><button id="saveEntry" class="button primary" type="submit">✓ Salvar</button></div></div></form></div>`
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

boot()
