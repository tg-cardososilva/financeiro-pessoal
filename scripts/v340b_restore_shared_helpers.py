from pathlib import Path

p = Path('app.js')
s = p.read_text()
anchor = '\nasync function loadCalendarData(force = false) {'
if s.count(anchor) != 1:
    raise SystemExit(f'calendar loader anchor count={s.count(anchor)}')
if 'function jarvisGoogleConnection()' in s:
    raise SystemExit('shared helpers already restored')

helpers = r'''

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
'''

s = s.replace(anchor, helpers + anchor, 1)
for token in ['remind_at', 'project_type', 'project_name', 'objective', 'priority || 3']:
    if token in s:
        raise SystemExit(f'legacy token after restore: {token}')
required = [
  'function jarvisIntentLabel(', 'function jarvisGoogleConnection(', 'function formatJarvisEvent(',
  'async function connectJarvisGoogleCalendar(', 'async function executeJarvisCalendarAction(',
  'async function testJarvisWhatsApp(', 'function jarvisDateTime(', 'function personalLoading(',
  'function bindPersonalNav(', 'function jarvisPresenceMarkup(', 'function setJarvisVisualState(',
  'function shouldUseCalendarRead(', 'async function invokeJarvisEngine(', 'async function sendJarvisQuick(',
  'function zonedDateKey(', 'function groupCalendarEvents('
]
for item in required:
    if item not in s:
        raise SystemExit(f'missing restored helper: {item}')
p.write_text(s)
print('shared helpers restored')
