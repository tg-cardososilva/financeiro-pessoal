from pathlib import Path
import re


def replace_once(text, pattern, replacement, label, flags=0):
    out, count = re.subn(pattern, replacement, text, count=1, flags=flags)
    if count != 1:
        raise SystemExit(f'{label}: expected 1 replacement, got {count}')
    return out

app_path = Path('app.js')
css_path = Path('styles.css')
app = app_path.read_text()

imports = """import { buildAttentionItems, attentionSummary, ATTENTION_URGENCY_LABELS } from './attention-rules.js?v=3.3.1'\nimport { domainList, domainCreate, domainUpdate, domainDelete, domainTransition } from './jarvis-domain-client.js?v=3.4.0b'\nimport { TASK_STATUS_LABELS, TASK_PRIORITY_LABELS, NOTE_TYPE_LABELS, PROJECT_STATUS_LABELS, SOURCE_LABELS, filterTasks, filterNotes, filterProjects, collectNoteTags } from './domain-ui.js?v=3.4.0b'"""
app = replace_once(app, r"import \{ buildAttentionItems, attentionSummary, ATTENTION_URGENCY_LABELS \} from './attention-rules\.js\?v=3\.3\.1'", imports, 'imports')

state_old = "  attention: { reviewTransactions: [], loading: false, loaded: false, error: null }\n"
state_new = """  attention: { reviewTransactions: [], loading: false, loaded: false, error: null },
  domainUi: {
    task: { q: '', status: 'open', priority: 'all', due: 'all', project: 'all' },
    note: { q: '', type: 'all', tag: 'all', project: 'all' },
    project: { q: '', status: 'all', due: 'all' }
  }
"""
if state_old not in app:
    raise SystemExit('state domainUi anchor missing')
app = app.replace(state_old, state_new, 1)

app = replace_once(app, r"function jarvisProjectName\(project\) \{.*?\n\}\n\nfunction jarvisTaskTime\(task\) \{.*?\n\}", """function jarvisProjectName(project) {
  return project?.name || 'Projeto sem nome'
}

function jarvisTaskTime(task) {
  return task?.due_at || null
}""", 'official project/task helpers', re.S)

load_jarvis = r"""async function loadJarvisData(force = false) {
  if (!state.session || state.jarvis.loading || (state.jarvis.loaded && !force)) return
  state.jarvis.loading = true
  if (['jarvis','home','agenda','tasks','notes','projects'].includes(state.view)) renderMain()
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
  } finally {
    state.jarvis.loading = false
    if (['jarvis','home','agenda','tasks','notes','projects'].includes(state.view)) renderMain()
  }
}
"""
app = replace_once(app, r"async function loadJarvisData\(force = false\) \{.*?\n\}\n\nasync function loadCalendarData", load_jarvis + "\nasync function loadCalendarData", 'loadJarvisData canonical domain reads', re.S)

app = app.replace("state.jarvis.tasks.filter((x) => x.status === 'pending').length", "state.jarvis.tasks.filter((x) => x.status === 'open').length")
app = app.replace("const allActiveProjects = state.jarvis.projects.filter((x) => !['completed','archived','cancelled'].includes(String(x.status || '').toLowerCase()))", "const allActiveProjects = state.jarvis.projects.filter((x) => ['active','paused'].includes(String(x.status || '').toLowerCase()))")

domain_block = r'''function domainProjectName(id) {
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
  bind('taskFilterQ', 'q', 'input'); bind('taskFilterStatus', 'status'); bind('taskFilterPriority', 'priority'); bind('taskFilterDue', 'due'); bind('taskFilterProject', 'project')
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
  bind('noteFilterQ','q','input'); bind('noteFilterType','type'); bind('noteFilterTag','tag'); bind('noteFilterProject','project')
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
    if (!confirm(`Excluir definitivamente o projeto “${project.name}”? Tarefas e notas serão preservadas sem vínculo com ele.`)) return
    await performDomainWrite($('domainProjectDelete'), () => domainDelete(supabase, 'project', project.id), 'Projeto excluído; tarefas e notas foram preservadas.')
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
  const modal = $('modalHost')
  modal.innerHTML = `<div class="modal-backdrop"><div class="modal wide domain-modal"><div class="modal-head"><div><span class="eyebrow">PROJETO</span><h2>${esc(project.name)}</h2><div class="domain-card-chips">${projectStatusChip(project)}</div></div><button id="closeModal" class="icon-button" type="button">×</button></div><div class="project-context"><p>${esc(project.description || 'Sem descrição adicional.')}</p><div class="project-context-stats"><button id="projectTasksLink" type="button"><strong>${tasks.length}</strong><span>Tarefas relacionadas</span></button><button id="projectNotesLink" type="button"><strong>${notes.length}</strong><span>Notas relacionadas</span></button><div><strong>${esc(domainWhen(project.due_at))}</strong><span>Prazo</span></div></div><div class="project-related-preview"><div><strong>Tarefas</strong>${tasks.length ? tasks.slice(0,4).map((task) => `<span>${taskStatusChip(task)} ${esc(task.title)}</span>`).join('') : '<span>Nenhuma tarefa ligada a este projeto.</span>'}</div><div><strong>Notas</strong>${notes.length ? notes.slice(0,4).map((note) => `<span>${noteTypeChip(note)} ${esc(note.title)}</span>`).join('') : '<span>Nenhuma nota ligada a este projeto.</span>'}</div></div></div>${domainTechnicalDetails(project)}<div class="modal-actions"><span></span><div class="modal-actions-right"><button id="projectDetailClose" class="button" type="button">Fechar</button><button id="projectDetailEdit" class="button primary" type="button">Editar projeto</button></div></div></div></div>`
  const close = () => { modal.innerHTML = '' }
  $('closeModal').addEventListener('click', close); $('projectDetailClose').addEventListener('click', close)
  $('projectDetailEdit').addEventListener('click', () => openProjectEditor(id))
  $('projectTasksLink').addEventListener('click', () => { close(); state.domainUi.task.project = id; state.domainUi.task.status = 'all'; navigate('tasks') })
  $('projectNotesLink').addEventListener('click', () => { close(); state.domainUi.note.project = id; navigate('notes') })
}

function projectActionMarkup(project) {
  if (project.status === 'active') return `<button class="button small" data-project-transition="project_pause" data-id="${esc(project.id)}" type="button">Pausar</button><button class="button small" data-project-transition="project_complete" data-id="${esc(project.id)}" type="button">Concluir</button><button class="button small" data-project-transition="project_archive" data-id="${esc(project.id)}" type="button">Arquivar</button>`
  if (project.status === 'paused') return `<button class="button small primary" data-project-transition="project_reopen" data-id="${esc(project.id)}" type="button">Reativar</button><button class="button small" data-project-transition="project_complete" data-id="${esc(project.id)}" type="button">Concluir</button><button class="button small" data-project-transition="project_archive" data-id="${esc(project.id)}" type="button">Arquivar</button>`
  if (project.status === 'completed') return `<button class="button small" data-project-transition="project_reopen" data-id="${esc(project.id)}" type="button">Reativar</button><button class="button small" data-project-transition="project_archive" data-id="${esc(project.id)}" type="button">Arquivar</button>`
  return `<button class="button small primary" data-project-transition="project_reopen" data-id="${esc(project.id)}" type="button">Reabrir como ativo</button>`
}

function renderProjects() {
  if (!state.jarvis.loaded && !state.jarvis.loading) { loadJarvisData(); $('mainArea').innerHTML = personalLoading(); return }
  const filters = state.domainUi.project
  const projects = filterProjects(state.jarvis.projects, filters)
  const activeCount = state.jarvis.projects.filter((project) => project.status === 'active').length
  $('mainArea').innerHTML = `<div class="content-stack personal-section domain-section"><section class="section-intro domain-intro"><div><span class="eyebrow">PROJETOS</span><h2>Contextos que agrupam coisas.</h2><p>${activeCount} projeto${activeCount === 1 ? '' : 's'} ativo${activeCount === 1 ? '' : 's'}. Tarefas e notas continuam sendo registros próprios e apenas se relacionam ao projeto.</p></div><button id="domainNewProject" class="button primary" type="button">＋ Novo projeto</button></section><section class="panel domain-toolbar"><label class="domain-search">Buscar<input id="projectFilterQ" type="search" value="${esc(filters.q)}" placeholder="Nome ou descrição"></label><label>Status<select id="projectFilterStatus"><option value="all">Todos</option>${Object.entries(PROJECT_STATUS_LABELS).map(([value,label]) => `<option value="${value}" ${filters.status === value ? 'selected' : ''}>${esc(label)}</option>`).join('')}</select></label><label>Prazo<select id="projectFilterDue"><option value="all">Qualquer prazo</option><option value="overdue" ${filters.due === 'overdue' ? 'selected' : ''}>Vencidos</option><option value="next30" ${filters.due === 'next30' ? 'selected' : ''}>Próximos 30 dias</option><option value="no_due" ${filters.due === 'no_due' ? 'selected' : ''}>Sem prazo</option></select></label></section><section class="projects-grid domain-projects-grid">${projects.length ? projects.map((project) => `<article class="project-card domain-project-card"><div class="project-mark">◇</div><div class="domain-project-body"><div class="domain-card-chips">${projectStatusChip(project)}</div><h3>${esc(project.name)}</h3><p>${esc(project.description || 'Sem descrição adicional.')}</p><div class="domain-card-meta"><span>${esc(domainWhen(project.due_at))}</span><span>${state.jarvis.tasks.filter((task) => task.project_id === project.id).length} tarefas · ${state.jarvis.notes.filter((note) => note.project_id === project.id).length} notas</span></div><div class="domain-card-actions project-actions">${projectActionMarkup(project)}<button class="button small" data-project-open="${esc(project.id)}" type="button">Abrir contexto</button><button class="button small" data-project-edit="${esc(project.id)}" type="button">Editar</button></div></div></article>`).join('') : '<div class="personal-empty panel"><strong>Nenhum projeto encontrado.</strong><span>Crie um projeto real ou ajuste os filtros acima.</span></div>'}</section></div>`
  $('domainNewProject').addEventListener('click', () => openProjectEditor())
  const bind = (id, key, event = 'change') => $(id).addEventListener(event, () => { filters[key] = $(id).value; renderProjects() })
  bind('projectFilterQ','q','input'); bind('projectFilterStatus','status'); bind('projectFilterDue','due')
  document.querySelectorAll('[data-project-open]').forEach((button) => button.addEventListener('click', () => openProjectDetail(button.dataset.projectOpen)))
  document.querySelectorAll('[data-project-edit]').forEach((button) => button.addEventListener('click', () => openProjectEditor(button.dataset.projectEdit)))
  document.querySelectorAll('[data-project-transition]').forEach((button) => button.addEventListener('click', () => transitionProject(button.dataset.id, button.dataset.projectTransition, button)))
}
'''

app = replace_once(app, r"function renderTasks\(\) \{.*?\nfunction renderJarvis\(\)", domain_block + "\nfunction renderJarvis()", 'operational domain modules', re.S)

for token in ["remind_at", "project_type", "project_name", "objective"]:
    if token in app:
        raise SystemExit(f'legacy token remains in app.js: {token}')
if "priority || 3" in app or "x.status === 'pending'" in app:
    raise SystemExit('legacy task UI semantics remain')
for table in ['jarvis_tasks','jarvis_notes','jarvis_projects']:
    if f"from('{table}')" in app or f'from("{table}")' in app:
        raise SystemExit(f'direct frontend table access remains: {table}')

app_path.write_text(app)

css = css_path.read_text()
marker = '/* v3.4.0b operational domains */'
if marker in css:
    raise SystemExit('v3.4.0b CSS marker already exists')
css += r'''

/* v3.4.0b operational domains */
.domain-section{gap:18px}.domain-intro{align-items:center}.domain-intro>.button{flex:0 0 auto}
.domain-toolbar{display:grid;grid-template-columns:minmax(220px,2fr) repeat(4,minmax(130px,1fr));gap:10px;padding:14px;align-items:end}.domain-toolbar label{display:grid;gap:6px;font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.04em}.domain-toolbar input,.domain-toolbar select{width:100%;min-height:40px;border:1px solid var(--line);background:var(--card);border-radius:10px;padding:8px 10px;color:var(--ink);font:inherit;font-size:13px;text-transform:none;letter-spacing:0}.domain-search{min-width:0}
.domain-list{display:grid;gap:10px}.domain-card{display:flex;justify-content:space-between;gap:18px;padding:17px 18px;border:1px solid var(--line);border-radius:16px;background:var(--card);box-shadow:var(--shadow)}.domain-card-main{min-width:0;flex:1}.domain-card h3,.domain-note-card h3,.domain-project-card h3{margin:8px 0 4px;font-size:16px}.domain-card p,.domain-note-card p,.domain-project-card p{margin:0;color:var(--muted);font-size:13px;line-height:1.5;white-space:pre-wrap}
.domain-card-chips{display:flex;flex-wrap:wrap;gap:6px;align-items:center}.domain-chip{display:inline-flex;align-items:center;min-height:24px;padding:3px 8px;border:1px solid var(--line);border-radius:999px;font-size:10px;font-weight:800;line-height:1;background:var(--card-soft);color:var(--muted)}.domain-chip.status.open,.domain-chip.status.active{color:#315f48;background:#eef8f2;border-color:#d4eadc}.domain-chip.status.completed{color:#39596f;background:#eef5fa;border-color:#d5e4ed}.domain-chip.status.cancelled,.domain-chip.status.archived{color:#6a6262;background:#f5f3f3;border-color:#e5dfdf}.domain-chip.status.paused{color:#765a28;background:#fff7e8;border-color:#f1dfb9}.domain-chip.priority.urgent{color:#8b2f2f;background:#fff0f0;border-color:#f2cece}.domain-chip.priority.high{color:#84531f;background:#fff5e9;border-color:#f2dbc0}.domain-chip.priority.normal{color:#3e5b72;background:#f0f6fa;border-color:#d9e6ee}.domain-chip.priority.low{color:#5d6b62;background:#f2f6f3;border-color:#dde6e0}.domain-chip.note.idea{color:#67518a;background:#f6f1fb;border-color:#e4d8f1}.domain-chip.note.reference{color:#3f6072;background:#eef6fa;border-color:#d7e7ef}.domain-chip.project{max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.domain-card-meta{display:flex;flex-wrap:wrap;gap:8px 14px;margin-top:10px;color:var(--muted);font-size:11px}.domain-card-actions{display:flex;flex-wrap:wrap;gap:7px;align-items:center;justify-content:flex-end;align-self:center}.domain-notes-grid,.domain-projects-grid{align-items:stretch}.domain-note-card{display:flex;flex-direction:column;min-height:210px}.domain-note-card p{flex:1;max-height:132px;overflow:hidden}.domain-note-card footer{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-top:14px}.domain-tags{display:flex;flex-wrap:wrap;gap:5px;margin-top:10px}.domain-tags span{padding:3px 7px;border-radius:999px;background:var(--card-soft);color:var(--muted);font-size:10px}.domain-project-card{align-items:flex-start}.domain-project-body{min-width:0;width:100%}.project-actions{justify-content:flex-start;margin-top:14px}
.domain-modal .field-label textarea{resize:vertical}.domain-tech{margin-top:14px;border:1px solid var(--line);border-radius:12px;padding:10px 12px;background:var(--card-soft)}.domain-tech summary{cursor:pointer;font-size:11px;font-weight:800;color:var(--muted)}.domain-tech>div{display:grid;grid-template-columns:110px 1fr;gap:10px;padding-top:8px;font-size:11px}.domain-tech span{color:var(--muted)}.domain-tech code{overflow-wrap:anywhere;font-size:10px}.domain-structural-note{display:grid;gap:4px;padding:11px 12px;margin-top:12px;border-radius:12px;background:var(--card-soft);font-size:11px}.domain-structural-note span{color:var(--muted)}.domain-current-status{padding-top:9px}.ghost-danger{opacity:.8}
.project-context{display:grid;gap:16px}.project-context>p{color:var(--muted);line-height:1.55;white-space:pre-wrap}.project-context-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.project-context-stats>*{display:grid;gap:3px;min-height:78px;padding:12px;border:1px solid var(--line);border-radius:12px;background:var(--card-soft);text-align:left;font:inherit;color:inherit}.project-context-stats button{cursor:pointer}.project-context-stats strong{font-size:17px}.project-context-stats span{color:var(--muted);font-size:10px}.project-related-preview{display:grid;grid-template-columns:1fr 1fr;gap:12px}.project-related-preview>div{display:grid;gap:7px;padding:12px;border:1px solid var(--line);border-radius:12px}.project-related-preview>div>span{color:var(--muted);font-size:11px}
@media(max-width:980px){.domain-toolbar{grid-template-columns:1fr 1fr}.domain-search{grid-column:1/-1}.domain-card{flex-direction:column}.domain-card-actions{justify-content:flex-start}}@media(max-width:620px){.domain-toolbar{grid-template-columns:1fr}.domain-search{grid-column:auto}.project-context-stats,.project-related-preview{grid-template-columns:1fr}.domain-intro{align-items:flex-start}}
'''
css_path.write_text(css)
print('v3.4.0b patch applied')
