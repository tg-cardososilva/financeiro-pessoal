from pathlib import Path

APP = Path('app.js')
INDEX = Path('index.html')
STYLES = Path('styles.css')
README = Path('README.md')

app = APP.read_text(encoding='utf-8')


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected 1 match, found {count}')
    return text.replace(old, new, 1)


def replace_between(text: str, start_marker: str, end_marker: str, replacement: str, label: str) -> str:
    start = text.find(start_marker)
    if start < 0:
        raise SystemExit(f'{label}: start marker not found')
    end = text.find(end_marker, start)
    if end < 0:
        raise SystemExit(f'{label}: end marker not found')
    return text[:start] + replacement + text[end:]


state_old = "  jarvis: { messages: [], annotations: [], notes: [], tasks: [], projects: [], actions: [], connections: [], counts: { annotations: 0, notes: 0, tasks: 0, projects: 0, actions: 0 }, loading: false, loaded: false, engine: null, error: null }\n"
state_new = state_old.rstrip('\n') + ",\n  calendar: { events: [], loading: false, loaded: false, error: null, connected: null, syncedAt: null, displayName: null }\n"
app = replace_once(app, state_old, state_new, 'calendar state')

app = replace_once(
    app,
    "    await loadJarvisData(true)\n",
    "    await Promise.all([loadJarvisData(true), loadCalendarData(true)])\n",
    'calendar refresh after confirmed action',
)

engine_marker = "async function sendJarvisQuick(message, button = null) {"
engine_helper = r'''const JARVIS_TIMEZONE = 'America/Sao_Paulo'

function normalizeJarvisText(value = '') {
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

function shouldUseCalendarRead(message = '') {
  const text = normalizeJarvisText(message)
  const writeIntent = /\b(agende|agendar|marque|marcar|crie|criar|adicione|adicionar|cancele|cancelar|remarque|remarcar|mude|mudar|altere|alterar|apague|apagar|remova|remover)\b/.test(text)
  if (writeIntent) return false
  return /\b(calendario|compromisso|compromissos|reuniao|reunioes|evento|eventos|agenda)\b/.test(text)
    || /\bo que (eu )?tenho (hoje|amanha)\b/.test(text)
    || /\btenho (algo|algum compromisso|alguma reuniao) (hoje|amanha)\b/.test(text)
}

async function invokeJarvisEngine(message, source = 'panel_jarvis') {
  const functionName = shouldUseCalendarRead(message) ? 'jarvis-calendar-query' : 'jarvis-core'
  return supabase.functions.invoke(functionName, { body: { message, channel: 'web', source } })
}

'''
if engine_marker not in app:
    raise SystemExit('sendJarvisQuick marker not found')
app = app.replace(engine_marker, engine_helper + engine_marker, 1)

app = replace_once(
    app,
    "    const { data, error } = await supabase.functions.invoke('jarvis-core', { body: { message: text, channel: 'web', source: `panel_${state.view}` } })\n",
    "    const { data, error } = await invokeJarvisEngine(text, `panel_${state.view}`)\n",
    'sendJarvisQuick router',
)
app = replace_once(
    app,
    "    const { data, error } = await supabase.functions.invoke('jarvis-core', { body: { message: text, channel: 'web', source: 'panel_simulator' } })\n",
    "    const { data, error } = await invokeJarvisEngine(text, 'panel_jarvis')\n",
    'sendJarvisMessage router',
)

home_agenda_block = r'''function zonedDateKey(value = new Date()) {
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
    return new Date(y, m - 1, d, 12)
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
          ? events.map((event) => `<article><div class="agenda-date"><strong>${esc(calendarEventDateLabel(event).split(' ')[0] || '--')}</strong><span>${esc(calendarEventDateLabel(event).split(' ')[1] || '')}</span></div><div><strong>${esc(event.title || 'Compromisso')}</strong><span>${esc(calendarEventTimeLabel(event))}${event.location ? ` · ${esc(event.location)}` : ''}</span><small>Google Calendar</small></div>${event.html_link ? `<a href="${esc(event.html_link)}" target="_blank" rel="noopener">Abrir ↗</a>` : ''}</article>`).join('')
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

'''
app = replace_between(app, 'function renderHome() {', 'function renderTasks() {', home_agenda_block, 'home/agenda replacement')

# Guard against accidental writes inside the calendar read path.
read_start = app.find('async function loadCalendarData(force = false) {')
read_end = app.find('function calendarSourceLabel', read_start)
if read_start < 0 or read_end < 0:
    raise SystemExit('calendar read function boundaries not found')
read_block = app[read_start:read_end]
for token in ('.delete()', '.insert(', '.update(', '.upsert(', '.rpc('):
    if token in read_block:
        raise SystemExit(f'calendar read path contains write token: {token}')
if "supabase.functions.invoke('jarvis-calendar-read'" not in read_block:
    raise SystemExit('calendar read function does not invoke read edge function')

# Ensure executed jarvis_actions are no longer used as the real agenda source.
for forbidden in ('scheduledCalendarActions', 'Nenhum compromisso futuro criado pelo Jarvis.', 'Eventos conhecidos pelo Jarvis. A leitura completa'):
    if forbidden in app:
        raise SystemExit(f'legacy pseudo-calendar source still present: {forbidden}')
if "Jarvis · aguardando confirmação" not in app or "Google Calendar" not in app:
    raise SystemExit('source labels missing')

APP.write_text(app, encoding='utf-8')

index = INDEX.read_text(encoding='utf-8')
if index.count('v=3.2.2') != 2:
    raise SystemExit('unexpected index cache-bust markers')
index = index.replace('v=3.2.2', 'v=3.3.0')
INDEX.write_text(index, encoding='utf-8')

styles = STYLES.read_text(encoding='utf-8')
marker = '/* v3.3.0 real calendar */'
if marker in styles:
    raise SystemExit('v3.3.0 styles already present')
styles += r'''

/* v3.3.0 real calendar */
.home-focus-grid-agenda { align-items: stretch; }
.real-agenda-card { min-height: 100%; }
.home-agenda-groups { display: grid; gap: 14px; margin-top: 14px; }
.home-agenda-group { border: 1px solid var(--line, #e7e9e7); border-radius: 14px; padding: 12px; background: rgba(255,255,255,.62); }
.home-agenda-group-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 8px; }
.home-agenda-group-head strong { font-size: 12px; letter-spacing: .04em; text-transform: uppercase; }
.home-agenda-group-head span { min-width: 24px; height: 24px; display: inline-flex; align-items: center; justify-content: center; border-radius: 999px; background: #eef1ef; font-size: 11px; font-weight: 700; }
.home-agenda-items { display: grid; gap: 8px; }
.home-agenda-item { display: grid; grid-template-columns: 72px 1fr; gap: 10px; align-items: start; padding: 9px 0; border-top: 1px solid rgba(20,35,45,.07); }
.home-agenda-item:first-child { border-top: 0; padding-top: 0; }
.home-agenda-item .home-time { font-size: 12px; font-weight: 700; color: #53616b; }
.home-agenda-item strong { display: block; font-size: 14px; }
.home-agenda-item small { display: block; margin-top: 3px; color: #71808a; font-size: 11px; }
.home-agenda-item.proposed { border-left: 3px solid #b98d42; padding-left: 10px; }
.home-agenda-empty { padding: 8px 0; color: #7c888f; font-size: 12px; }
.home-agenda-proposals { margin-top: 16px; padding-top: 14px; border-top: 1px dashed #d9ddda; }
.calendar-state-card { margin-top: 14px; display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 14px; border: 1px solid #e2e6e3; border-radius: 14px; background: #f8f9f7; }
.calendar-state-card strong { width: 100%; }
.calendar-state-card span:not(.spinner) { color: #66737b; font-size: 12px; }
.calendar-state-card.error { border-color: #ead7d3; background: #fff8f6; }
@media (max-width: 760px) {
  .home-agenda-item { grid-template-columns: 62px 1fr; }
}
'''
STYLES.write_text(styles, encoding='utf-8')

readme = README.read_text(encoding='utf-8')
readme = replace_once(readme, '# Jarvis v3.2.2 - limpeza arquitetural', '# Jarvis v3.3.0 - Home 360 com agenda real', 'README heading')
readme += '''\n## v3.3.0\n\n- Home lê eventos reais do Google Calendar por uma Edge Function dedicada e somente leitura.\n- Eventos são separados em Hoje, Amanhã e Próximos dias.\n- Eventos reais e `jarvis_actions` propostas aparecem como fontes distintas.\n- Falhas do Calendar degradam apenas o bloco de agenda, sem derrubar a Home.\n- Datas e horários do Calendar usam `America/Sao_Paulo`.\n- A camada visual deduplica eventos por `id + start`.\n- Perguntas de agenda do Jarvis usam a mesma fonte `jarvis-calendar-read`; pedidos de escrita continuam no fluxo com confirmação.\n- Atualizar a Home não cria, altera, cancela ou apaga eventos.\n'''
README.write_text(readme, encoding='utf-8')

print('v3.3.0 agenda patch applied')
