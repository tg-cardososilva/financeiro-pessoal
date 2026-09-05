export const ATTENTION_URGENCY_LABELS = {
  critical: 'Urgente',
  high: 'Alta',
  medium: 'Média',
  low: 'Baixa',
}

const MS_HOUR = 60 * 60 * 1000
const MS_DAY = 24 * MS_HOUR

function normalize(value = '') {
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
}

function toDate(value) {
  if (!value) return null
  const d = value instanceof Date ? value : new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

function localDateKey(value, timezone) {
  const d = toDate(value)
  if (!d) return ''
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d)
  const get = (type) => parts.find((p) => p.type === type)?.value || ''
  return `${get('year')}-${get('month')}-${get('day')}`
}

function addDateKeyDays(key, days) {
  const [y, m, d] = String(key).split('-').map(Number)
  if (!y || !m || !d) return ''
  return new Date(Date.UTC(y, m - 1, d + days, 12)).toISOString().slice(0, 10)
}

function daysBetweenKeys(fromKey, toKey) {
  if (!fromKey || !toKey) return null
  const from = new Date(`${fromKey}T12:00:00Z`)
  const to = new Date(`${toKey}T12:00:00Z`)
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return null
  return Math.round((to.getTime() - from.getTime()) / MS_DAY)
}

function formatWhen(value, timezone) {
  const d = toDate(value)
  if (!d) return 'Sem horário definido'
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: timezone,
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d)
}

function formatDate(value, timezone) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) {
    const [y, m, d] = String(value).split('-').map(Number)
    return new Intl.DateTimeFormat('pt-BR', { timeZone: timezone, day: '2-digit', month: 'short' }).format(new Date(Date.UTC(y, m - 1, d, 12)))
  }
  const date = toDate(value)
  if (!date) return 'Sem data definida'
  return new Intl.DateTimeFormat('pt-BR', { timeZone: timezone, day: '2-digit', month: 'short' }).format(date)
}

function item(base) {
  return {
    key: base.key,
    type: base.type,
    sourceId: base.sourceId || null,
    urgency: base.urgency || 'medium',
    score: Number(base.score || 0),
    title: base.title || 'Item requer atenção',
    detail: base.detail || '',
    navigate: base.navigate || 'jarvis',
    dueAt: base.dueAt || null,
  }
}

function providerLabel(provider = '') {
  const p = normalize(provider)
  if (p === 'google_calendar') return 'Google Calendar'
  if (p === 'whatsapp') return 'WhatsApp'
  if (p === 'google_drive') return 'Google Drive'
  return provider ? String(provider).replaceAll('_', ' ') : 'Integração'
}

function dedupe(items) {
  const byKey = new Map()
  for (const current of items) {
    const previous = byKey.get(current.key)
    if (!previous || current.score > previous.score) byKey.set(current.key, current)
  }
  return [...byKey.values()].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    const ad = toDate(a.dueAt)?.getTime() ?? Number.MAX_SAFE_INTEGER
    const bd = toDate(b.dueAt)?.getTime() ?? Number.MAX_SAFE_INTEGER
    if (ad !== bd) return ad - bd
    return a.title.localeCompare(b.title, 'pt-BR')
  })
}

function taskItems(tasks, now, timezone) {
  const out = []
  for (const task of tasks || []) {
    if (String(task?.status || '').toLowerCase() !== 'pending') continue
    const dueRaw = task?.due_at || task?.remind_at
    const due = toDate(dueRaw)
    if (!due) continue
    const delta = due.getTime() - now.getTime()
    let urgency = null
    let score = 0
    let detail = ''
    if (delta < 0) {
      urgency = 'critical'; score = 100; detail = `Vencida em ${formatWhen(due, timezone)}`
    } else if (delta <= 6 * MS_HOUR) {
      urgency = 'high'; score = 92; detail = `Vence nas próximas horas · ${formatWhen(due, timezone)}`
    } else if (delta <= MS_DAY) {
      urgency = 'high'; score = 86; detail = `Vence nas próximas 24h · ${formatWhen(due, timezone)}`
    } else if (delta <= 3 * MS_DAY) {
      urgency = 'medium'; score = 66; detail = `Vence em breve · ${formatWhen(due, timezone)}`
    }
    if (!urgency) continue
    out.push(item({
      key: `task:${task.id || normalize(task.title)}`,
      type: 'task', sourceId: task.id, urgency, score,
      title: task.title || 'Tarefa pendente', detail, navigate: 'tasks', dueAt: due.toISOString(),
    }))
  }
  return out
}

function actionItems(actions, now, timezone) {
  const out = []
  for (const action of actions || []) {
    if (String(action?.status || '').toLowerCase() !== 'proposed') continue
    const startsAt = toDate(action?.payload?.starts_at)
    let urgency = 'medium'
    let score = 68
    let detail = 'Aguardando sua confirmação'
    if (startsAt) {
      const delta = startsAt.getTime() - now.getTime()
      if (delta <= 0) {
        urgency = 'critical'; score = 98; detail = `Horário previsto já chegou · ${formatWhen(startsAt, timezone)}`
      } else if (delta <= 6 * MS_HOUR) {
        urgency = 'high'; score = 93; detail = `Aguardando confirmação para as próximas horas · ${formatWhen(startsAt, timezone)}`
      } else if (delta <= MS_DAY) {
        urgency = 'high'; score = 88; detail = `Aguardando confirmação nas próximas 24h · ${formatWhen(startsAt, timezone)}`
      } else if (delta <= 3 * MS_DAY) {
        urgency = 'medium'; score = 72; detail = `Aguardando confirmação · ${formatWhen(startsAt, timezone)}`
      }
    }
    out.push(item({
      key: `action:${action.id || normalize(`${action.action_type}:${action?.payload?.title || ''}`)}`,
      type: 'action', sourceId: action.id, urgency, score,
      title: action?.payload?.title || 'Ação proposta pelo Jarvis', detail,
      navigate: action?.action_type === 'calendar_create' ? 'agenda' : 'jarvis',
      dueAt: startsAt?.toISOString() || action?.created_at || null,
    }))
  }
  return out
}

function transactionItems(transactions, now, timezone) {
  const rows = (transactions || []).filter((tx) => String(tx?.review_status || '').toLowerCase() === 'needs_review')
  if (!rows.length) return []
  const todayKey = localDateKey(now, timezone)
  const ages = rows.map((tx) => {
    const key = /^\d{4}-\d{2}-\d{2}$/.test(String(tx?.transaction_date || '')) ? tx.transaction_date : localDateKey(tx?.created_at, timezone)
    return { tx, key, age: daysBetweenKeys(key, todayKey) ?? 0 }
  }).sort((a, b) => b.age - a.age)
  const oldest = ages[0]
  const urgency = oldest.age >= 7 ? 'high' : 'medium'
  const score = oldest.age >= 7 ? 78 : oldest.age >= 3 ? 64 : 56
  const count = rows.length
  return [item({
    key: 'transactions:needs_review',
    type: 'transaction_review', urgency, score,
    title: `${count} transaç${count === 1 ? 'ão' : 'ões'} para revisar`,
    detail: oldest.age > 0 ? `Mais antiga há ${oldest.age} dia${oldest.age === 1 ? '' : 's'} · ${formatDate(oldest.key, timezone)}` : 'Há lançamentos aguardando revisão',
    navigate: 'transactions', dueAt: oldest?.tx?.created_at || null,
  })]
}

function annotationItems(annotations, now, timezone) {
  const rows = (annotations || []).filter((a) => String(a?.reconciliation_status || '').toLowerCase() === 'pending')
  if (!rows.length) return []
  const sorted = rows.map((a) => {
    const date = toDate(a?.occurred_at || a?.created_at)
    const age = date ? Math.max(0, Math.floor((now.getTime() - date.getTime()) / MS_DAY)) : 0
    return { a, date, age }
  }).sort((a, b) => b.age - a.age)
  const oldest = sorted[0]
  const urgency = oldest.age >= 3 ? 'high' : 'medium'
  const score = oldest.age >= 3 ? 76 : 58
  const count = rows.length
  return [item({
    key: 'annotations:pending',
    type: 'financial_annotation', urgency, score,
    title: `${count} contexto${count === 1 ? '' : 's'} financeiro${count === 1 ? '' : 's'} para conciliar`,
    detail: oldest.date ? `Mais antigo há ${oldest.age} dia${oldest.age === 1 ? '' : 's'} · ${formatWhen(oldest.date, timezone)}` : 'Aguardando conciliação com extratos',
    navigate: 'jarvis', dueAt: oldest.date?.toISOString() || null,
  })]
}

function calendarItems(events, now, timezone) {
  const out = []
  const todayKey = localDateKey(now, timezone)
  for (const event of events || []) {
    if (!event?.id || !event?.start) continue
    if (event?.all_day && /^\d{4}-\d{2}-\d{2}$/.test(String(event.start))) {
      const diffDays = daysBetweenKeys(todayKey, event.start)
      if (diffDays == null || diffDays < 0 || diffDays > 3) continue
      const urgency = diffDays === 0 ? 'medium' : 'low'
      const score = diffDays === 0 ? 74 : diffDays === 1 ? 52 : 42
      const detail = diffDays === 0 ? 'Evento de dia inteiro hoje' : diffDays === 1 ? 'Evento de dia inteiro amanhã' : `Evento de dia inteiro em ${formatDate(event.start, timezone)}`
      out.push(item({
        key: `calendar:${event.id}:${event.start}`,
        type: 'calendar_event', sourceId: event.id, urgency, score,
        title: event.title || 'Compromisso', detail, navigate: 'agenda', dueAt: event.start,
      }))
      continue
    }
    const start = toDate(event.start)
    const end = toDate(event.end)
    if (!start) continue
    const delta = start.getTime() - now.getTime()
    const ongoing = end && start <= now && now <= end
    if (!ongoing && delta < 0) continue
    let urgency = null
    let score = 0
    let detail = ''
    if (ongoing) {
      urgency = 'critical'; score = 96; detail = 'Compromisso acontecendo agora'
    } else if (delta <= 2 * MS_HOUR) {
      urgency = 'high'; score = 91; detail = `Começa em breve · ${formatWhen(start, timezone)}`
    } else if (delta <= MS_DAY) {
      urgency = 'medium'; score = 73; detail = `Nas próximas 24h · ${formatWhen(start, timezone)}`
    } else if (delta <= 3 * MS_DAY) {
      urgency = 'low'; score = 46; detail = `Nos próximos dias · ${formatWhen(start, timezone)}`
    }
    if (!urgency) continue
    out.push(item({
      key: `calendar:${event.id}:${event.start}`,
      type: 'calendar_event', sourceId: event.id, urgency, score,
      title: event.title || 'Compromisso', detail, navigate: 'agenda', dueAt: start.toISOString(),
    }))
  }
  return out
}

function integrationItems(connections, calendarError) {
  const out = []
  for (const connection of connections || []) {
    const status = normalize(connection?.status)
    if (!status || status === 'connected') continue
    const label = providerLabel(connection?.provider)
    const severe = ['error', 'failed', 'expired', 'revoked'].includes(status)
    out.push(item({
      key: `integration:${connection?.provider || connection?.id || 'unknown'}`,
      type: 'integration', sourceId: connection?.id,
      urgency: severe ? 'high' : 'medium', score: severe ? 94 : 70,
      title: `${label} precisa de atenção`,
      detail: `Status da integração: ${connection?.status || 'indisponível'}`,
      navigate: 'jarvis', dueAt: connection?.updated_at || null,
    }))
  }
  if (calendarError) {
    out.push(item({
      key: 'integration:google_calendar',
      type: 'integration', urgency: 'high', score: 95,
      title: 'Google Calendar indisponível',
      detail: String(calendarError), navigate: 'agenda',
    }))
  }
  return out
}

export function buildAttentionItems({
  tasks = [],
  actions = [],
  reviewTransactions = [],
  annotations = [],
  calendarEvents = [],
  connections = [],
  calendarError = null,
  now = new Date(),
  timezone = 'America/Sao_Paulo',
} = {}) {
  const ref = toDate(now) || new Date()
  return dedupe([
    ...taskItems(tasks, ref, timezone),
    ...actionItems(actions, ref, timezone),
    ...transactionItems(reviewTransactions, ref, timezone),
    ...annotationItems(annotations, ref, timezone),
    ...calendarItems(calendarEvents, ref, timezone),
    ...integrationItems(connections, calendarError),
  ])
}

export function attentionSummary(items = []) {
  if (!items.length) return 'Seu ambiente está em ordem. Nenhum item real requer atenção agora.'
  const critical = items.filter((x) => x.urgency === 'critical').length
  if (critical) return `${critical} item${critical === 1 ? '' : 's'} urgente${critical === 1 ? '' : 's'} requer${critical === 1 ? '' : 'em'} sua atenção agora.`
  const high = items.filter((x) => x.urgency === 'high').length
  if (high) return `${high} item${high === 1 ? '' : 's'} de alta prioridade merece${high === 1 ? '' : 'm'} atenção.`
  return `${items.length} item${items.length === 1 ? '' : 's'} real${items.length === 1 ? '' : 'is'} para acompanhar nas próximas horas ou dias.`
}
