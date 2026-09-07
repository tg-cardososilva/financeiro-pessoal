export const TASK_STATUS_LABELS = { open: 'Em aberto', completed: 'Concluída', cancelled: 'Cancelada' }
export const TASK_PRIORITY_LABELS = { low: 'Baixa', normal: 'Normal', high: 'Alta', urgent: 'Urgente' }
export const NOTE_TYPE_LABELS = { note: 'Nota', idea: 'Ideia', reference: 'Referência' }
export const PROJECT_STATUS_LABELS = { active: 'Ativo', paused: 'Pausado', completed: 'Concluído', archived: 'Arquivado' }
export const SOURCE_LABELS = { manual_web: 'Painel', jarvis_web: 'Jarvis Web', whatsapp: 'WhatsApp', imported: 'Importado', system: 'Sistema' }

const normalize = (value = '') => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
const toDate = (value) => {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

export function dueBucket(value, now = new Date()) {
  const due = toDate(value)
  if (!due) return 'no_due'
  const ref = toDate(now) || new Date()
  const start = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate())
  const end = new Date(start); end.setDate(end.getDate() + 1)
  const next7 = new Date(start); next7.setDate(next7.getDate() + 7)
  if (due < ref) return 'overdue'
  if (due >= start && due < end) return 'today'
  if (due < next7) return 'next7'
  return 'later'
}

export function projectDueBucket(value, now = new Date()) {
  const due = toDate(value)
  if (!due) return 'no_due'
  const ref = toDate(now) || new Date()
  const next30 = new Date(ref); next30.setDate(next30.getDate() + 30)
  if (due < ref) return 'overdue'
  if (due <= next30) return 'next30'
  return 'later'
}

export function filterTasks(tasks = [], filters = {}, now = new Date()) {
  const q = normalize(filters.q)
  return tasks.filter((task) => {
    if (filters.status && filters.status !== 'all' && task.status !== filters.status) return false
    if (filters.priority && filters.priority !== 'all' && task.priority !== filters.priority) return false
    if (filters.project && filters.project !== 'all' && String(task.project_id || '') !== filters.project) return false
    if (filters.due && filters.due !== 'all' && dueBucket(task.due_at, now) !== filters.due) return false
    if (q && !normalize(`${task.title || ''} ${task.description || ''}`).includes(q)) return false
    return true
  }).sort((a, b) => {
    const statusRank = { open: 0, completed: 1, cancelled: 2 }
    const priorityRank = { urgent: 0, high: 1, normal: 2, low: 3 }
    const sr = (statusRank[a.status] ?? 9) - (statusRank[b.status] ?? 9)
    if (sr) return sr
    const pa = priorityRank[a.priority] ?? 9
    const pb = priorityRank[b.priority] ?? 9
    if (pa !== pb) return pa - pb
    const da = toDate(a.due_at)?.getTime() ?? Number.MAX_SAFE_INTEGER
    const db = toDate(b.due_at)?.getTime() ?? Number.MAX_SAFE_INTEGER
    if (da !== db) return da - db
    return String(a.title || '').localeCompare(String(b.title || ''), 'pt-BR')
  })
}

export function collectNoteTags(notes = []) {
  return [...new Set(notes.flatMap((note) => Array.isArray(note.tags) ? note.tags : []).map((tag) => String(tag).trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'pt-BR'))
}

export function filterNotes(notes = [], filters = {}) {
  const q = normalize(filters.q)
  const tag = normalize(filters.tag)
  return notes.filter((note) => {
    if (filters.type && filters.type !== 'all' && note.note_type !== filters.type) return false
    if (filters.project && filters.project !== 'all' && String(note.project_id || '') !== filters.project) return false
    const tags = Array.isArray(note.tags) ? note.tags : []
    if (tag && tag !== 'all' && !tags.some((item) => normalize(item) === tag)) return false
    if (q && !normalize(`${note.title || ''} ${note.content || ''} ${tags.join(' ')}`).includes(q)) return false
    return true
  }).sort((a, b) => (toDate(b.updated_at)?.getTime() || 0) - (toDate(a.updated_at)?.getTime() || 0))
}

export function filterProjects(projects = [], filters = {}, now = new Date()) {
  const q = normalize(filters.q)
  return projects.filter((project) => {
    if (filters.status && filters.status !== 'all' && project.status !== filters.status) return false
    if (filters.due && filters.due !== 'all' && projectDueBucket(project.due_at, now) !== filters.due) return false
    if (q && !normalize(`${project.name || ''} ${project.description || ''}`).includes(q)) return false
    return true
  }).sort((a, b) => {
    const statusRank = { active: 0, paused: 1, completed: 2, archived: 3 }
    const sr = (statusRank[a.status] ?? 9) - (statusRank[b.status] ?? 9)
    if (sr) return sr
    const da = toDate(a.due_at)?.getTime() ?? Number.MAX_SAFE_INTEGER
    const db = toDate(b.due_at)?.getTime() ?? Number.MAX_SAFE_INTEGER
    if (da !== db) return da - db
    return String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR')
  })
}
