export const MAX_CALENDAR_BATCH_SIZE = 10
export const DEFAULT_CALENDAR_DURATION_MINUTES = 60

function valueOrNull(value) {
  const clean = String(value || '').trim()
  return clean || null
}

function normalizeTimestamp(value) {
  const raw = valueOrNull(value)
  if (!raw) return null
  const date = new Date(raw)
  if (Number.isNaN(date.getTime())) throw new Error('calendar_time_invalid')
  return date.toISOString()
}

export function normalizeCalendarEvents(parsed = {}) {
  const candidates = Array.isArray(parsed.calendar_events) && parsed.calendar_events.length
    ? parsed.calendar_events
    : parsed.calendar ? [parsed.calendar] : []
  if (!candidates.length) throw new Error('calendar_details_missing')
  if (candidates.length > MAX_CALENDAR_BATCH_SIZE) throw new Error('calendar_batch_size_invalid')

  return candidates.map((candidate) => {
    const title = valueOrNull(candidate?.title)
    const startsAt = normalizeTimestamp(candidate?.starts_at)
    if (!title || !startsAt) throw new Error('calendar_details_missing')
    const parsedStart = new Date(startsAt)
    const suppliedEnd = normalizeTimestamp(candidate?.ends_at)
    const endsAt = suppliedEnd || new Date(
      parsedStart.getTime() + DEFAULT_CALENDAR_DURATION_MINUTES * 60 * 1000,
    ).toISOString()
    if (new Date(endsAt).getTime() <= parsedStart.getTime()) throw new Error('calendar_end_before_start')
    return {
      title,
      starts_at: startsAt,
      ends_at: endsAt,
      location: valueOrNull(candidate?.location),
      notes: valueOrNull(candidate?.notes),
      duration_defaulted: !suppliedEnd,
    }
  })
}

export function calendarBatchConfirmationReply(events = []) {
  if (events.length === 1) {
    const suffix = events[0].duration_defaulted ? ' Considerei duração padrão de 1 hora.' : ''
    return `Preparei o compromisso “${events[0].title}”.${suffix} Confirme para criar no Google Calendar.`
  }
  const defaults = events.filter((event) => event.duration_defaulted).length
  const titles = events.map((event) => `“${event.title}”`).join(', ')
  const suffix = defaults ? ` ${defaults === events.length ? 'Todos usam' : `${defaults} usam`} duração padrão de 1 hora.` : ''
  return `Preparei ${events.length} compromissos: ${titles}.${suffix} Confirme o lote para criar cada evento no Google Calendar.`
}

export function summarizeCalendarBatchResults(results = []) {
  const counts = { executed: 0, failed: 0, cancelled: 0, in_progress: 0 }
  for (const result of results) {
    const status = String(result?.status || '')
    if (Object.hasOwn(counts, status)) counts[status] += 1
  }
  return {
    ...counts,
    total: results.length,
    ok: results.length > 0 && counts.failed === 0 && counts.in_progress === 0,
    partial_success: counts.executed > 0 && (counts.failed > 0 || counts.in_progress > 0),
  }
}

export async function executeCalendarBatchItems(actions = [], executor) {
  const results = []
  for (const action of actions) {
    try {
      results.push(await executor(action))
    } catch (error) {
      results.push({
        action_id: action?.id || null,
        title: action?.payload?.title || 'Evento',
        status: 'failed',
        error: error instanceof Error ? error.message : 'Falha ao executar evento',
      })
    }
  }
  return results
}
