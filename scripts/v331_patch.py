from pathlib import Path

APP = Path('app.js')
INDEX = Path('index.html')
STYLES = Path('styles.css')
README = Path('README.md')

app = APP.read_text(encoding='utf-8')

def once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected 1 match, found {count}')
    return text.replace(old, new, 1)

import_line = "import { buildAttentionItems, attentionSummary, ATTENTION_URGENCY_LABELS } from './attention-rules.js?v=3.3.1'\n\n"
if app.startswith('import '):
    raise SystemExit('unexpected existing top-level import')
app = import_line + app

old_state = "  calendar: { events: [], loading: false, loaded: false, error: null, connected: null, syncedAt: null, displayName: null }\n"
new_state = old_state.rstrip('\n') + ",\n  attention: { reviewTransactions: [], loading: false, loaded: false, error: null }\n"
app = once(app, old_state, new_state, 'attention state')

loader_marker = 'function updateUserChrome() {'
loader = r'''async function loadAttentionData(force = false) {
  if (!state.session || state.attention.loading || (state.attention.loaded && !force)) return
  state.attention.loading = true
  state.attention.error = null
  if (state.view === 'home') renderMain()
  try {
    const { data, error } = await supabase.from('transactions')
      .select('id,transaction_date,display_description,description,merchant,amount,review_status,created_at')
      .eq('review_status', 'needs_review')
      .order('transaction_date', { ascending: true })
      .order('created_at', { ascending: true })
      .limit(500)
    if (error) throw error
    state.attention.reviewTransactions = data || []
    state.attention.loaded = true
  } catch (err) {
    state.attention.reviewTransactions = []
    state.attention.error = humanError(err)
    state.attention.loaded = true
  } finally {
    state.attention.loading = false
    if (state.view === 'home') renderMain()
  }
}

'''
if app.count(loader_marker) != 1:
    raise SystemExit('updateUserChrome marker not unique')
app = app.replace(loader_marker, loader + loader_marker, 1)

home_start = app.index('function renderHome() {')
agenda_start = app.index('function renderAgenda() {', home_start)
home = app[home_start:agenda_start]

old_init = "  if (state.jarvis.loaded && !state.calendar.loaded && !state.calendar.loading) loadCalendarData()\n"
if home.count(old_init) != 1:
    raise SystemExit('calendar home init not unique')
home = home.replace(old_init, old_init + "  if (!state.attention.loaded && !state.attention.loading) loadAttentionData()\n", 1)

old_tasks = "  const pendingTasks = state.jarvis.tasks.filter((x) => x.status === 'pending').sort((a,b) => new Date(jarvisTaskTime(a) || '2999-01-01') - new Date(jarvisTaskTime(b) || '2999-01-01'))\n  const todayTasks = pendingTasks.filter((x) => isSameLocalDay(jarvisTaskTime(x)))\n  const overdueTasks = pendingTasks.filter((x) => jarvisTaskTime(x) && new Date(jarvisTaskTime(x)) < now && !isSameLocalDay(jarvisTaskTime(x)))\n"
if home.count(old_tasks) != 1:
    raise SystemExit('legacy task attention block not found exactly once')
home = home.replace(old_tasks, '', 1)
home = home.replace("  const pendingAnnotations = state.jarvis.annotations.filter((x) => x.reconciliation_status === 'pending').length\n", '', 1)

att_start = home.index('  const attention = []')
att_end = home.index('  const calendarBody =', att_start)
new_attention = r'''  const attentionItems = buildAttentionItems({
    tasks: state.jarvis.tasks,
    actions: state.jarvis.actions,
    reviewTransactions: state.attention.reviewTransactions,
    annotations: state.jarvis.annotations,
    calendarEvents: state.calendar.events,
    connections: state.jarvis.connections,
    calendarError: state.calendar.error,
    now,
    timezone: JARVIS_TIMEZONE,
  })
  const focusSummary = attentionSummary(attentionItems)
  const attentionBody = state.attention.loading && !state.attention.loaded
    ? '<div class="attention-empty"><span class="spinner"></span><p><strong>Consolidando sinais reais...</strong><small>Verificando pendências financeiras.</small></p></div>'
    : attentionItems.length
      ? `<div class="attention-list">${attentionItems.slice(0,6).map((entry) => `<button type="button" class="attention-item urgency-${esc(entry.urgency)}" data-personal-nav="${esc(entry.navigate)}"><span class="attention-signal"></span><p><strong>${esc(entry.title)}</strong><small>${esc(entry.detail)}</small></p><b class="attention-urgency">${esc(ATTENTION_URGENCY_LABELS[entry.urgency] || 'Média')}</b></button>`).join('')}</div>`
      : '<div class="attention-empty attention-clear"><span>✓</span><p><strong>Nada exige ação agora.</strong><small>Nenhum sinal real ultrapassou os critérios de atenção.</small></p></div>'
  const attentionWarning = state.attention.error
    ? `<div class="attention-data-warning">Não consegui verificar todas as transações para revisão: ${esc(state.attention.error)}</div>`
    : ''
'''
home = home[:att_start] + new_attention + home[att_end:]

old_card = '''        <div class="attention-list">${attention.slice(0,4).map((x,i) => `<div><span>${i+1}</span><p>${esc(x)}</p></div>`).join('')}</div>'''
new_card = '''        ${attentionBody}\n        ${attentionWarning}'''
if home.count(old_card) != 1:
    raise SystemExit(f'legacy attention card count={home.count(old_card)}')
home = home.replace(old_card, new_card, 1)

old_refresh = "      await Promise.all([loadData(), loadJarvisData(true), loadCalendarData(true)])\n"
new_refresh = "      await Promise.all([loadData(), loadJarvisData(true), loadCalendarData(true), loadAttentionData(true)])\n"
if home.count(old_refresh) != 1:
    raise SystemExit('home refresh target not unique')
home = home.replace(old_refresh, new_refresh, 1)
app = app[:home_start] + home + app[agenda_start:]

# Keep attention state fresh after a user explicitly edits a transaction.
tx_old = "      await loadData()\n    } catch (err) {\n      showInfo('txEditMessage', humanError(err))"
tx_new = "      await Promise.all([loadData(), loadAttentionData(true)])\n    } catch (err) {\n      showInfo('txEditMessage', humanError(err))"
if app.count(tx_old) == 1:
    app = app.replace(tx_old, tx_new, 1)

home_check = app[app.index('function renderHome() {'):app.index('function renderAgenda() {')]
for forbidden in ['const attention = []', 'overdueTasks.length', 'pendingAnnotations) attention.push']:
    if forbidden in home_check:
        raise SystemExit(f'legacy attention logic remains: {forbidden}')
APP.write_text(app, encoding='utf-8')

index = INDEX.read_text(encoding='utf-8')
if index.count('v=3.3.0') != 2:
    raise SystemExit(f'unexpected index version markers: {index.count("v=3.3.0")}')
INDEX.write_text(index.replace('v=3.3.0', 'v=3.3.1'), encoding='utf-8')

css = STYLES.read_text(encoding='utf-8')
css += r'''

/* v3.3.1 - Requer atencao derivado somente de dados reais */
.attention-list{display:grid;gap:8px;margin-top:14px}.attention-item{width:100%;border:1px solid var(--line);background:#fff;border-radius:12px;padding:10px 10px;display:grid;grid-template-columns:12px minmax(0,1fr) auto;gap:9px;align-items:center;text-align:left;transition:.15s ease}.attention-item:hover{border-color:var(--line-strong);transform:translateY(-1px);box-shadow:0 5px 14px rgba(16,37,53,.04)}.attention-signal{width:9px;height:9px;border-radius:99px;background:#9ba3aa}.attention-item p{display:grid;gap:2px;margin:0;min-width:0}.attention-item p strong{font-size:10.5px;color:var(--ink)}.attention-item p small{font-size:9px;color:var(--muted);line-height:1.4}.attention-urgency{font-size:8.5px;font-weight:700;padding:4px 6px;border-radius:99px;background:#f0f2f0;color:#667079;white-space:nowrap}.attention-item.urgency-critical .attention-signal{background:var(--red)}.attention-item.urgency-critical .attention-urgency{background:var(--red-soft);color:var(--red)}.attention-item.urgency-high .attention-signal{background:var(--amber)}.attention-item.urgency-high .attention-urgency{background:var(--amber-soft);color:var(--amber)}.attention-item.urgency-medium .attention-signal{background:var(--violet)}.attention-item.urgency-medium .attention-urgency{background:var(--violet-soft);color:var(--violet)}.attention-item.urgency-low .attention-signal{background:#7f958b}.attention-item.urgency-low .attention-urgency{background:#eef3f0;color:#597267}.attention-empty{margin-top:14px;border:1px dashed var(--line-strong);border-radius:12px;padding:14px;display:grid;grid-template-columns:28px minmax(0,1fr);gap:9px;align-items:center;color:var(--muted)}.attention-empty>span{width:28px;height:28px;border-radius:9px;border:1px solid var(--line);background:#fff;display:grid;place-items:center}.attention-empty p{display:grid;gap:2px;margin:0}.attention-empty strong{font-size:10.5px;color:var(--ink)}.attention-empty small{font-size:9px}.attention-clear>span{color:var(--green);background:var(--green-soft);border-color:#cfe3d7}.attention-data-warning{margin-top:9px;padding:8px 9px;border-radius:9px;background:var(--amber-soft);color:#86501f;font-size:8.5px;line-height:1.4}
'''
STYLES.write_text(css, encoding='utf-8')

readme = README.read_text(encoding='utf-8')
readme = once(readme, '# Jarvis v3.3.0 - Home 360 com agenda real', '# Jarvis v3.3.1 - Requer atencao com dados reais', 'readme heading')
readme = once(readme, '- `app.js`\n', '- `app.js`\n- `attention-rules.js`\n', 'readme file list')
readme += '''\n## v3.3.1\n\n- `Requer atenção` passa a ser derivado exclusivamente de dados reais já existentes.\n- Regras cobrem tarefas vencidas/próximas, ações propostas, transações para revisão, compromissos próximos, anotações financeiras pendentes e falhas de integração.\n- Itens recebem urgência `Urgente`, `Alta`, `Média` ou `Baixa` e são ordenados por score e prazo.\n- Transações e anotações repetitivas são consolidadas; registros individuais usam chaves estáveis para evitar duplicidade.\n- A busca global de transações para revisão é somente leitura e independente do mês selecionado.\n- Nenhum dado de teste persistente é criado. Os testes das regras usam apenas fixtures em memória.\n- A Home continua somente leitura.\n'''
README.write_text(readme, encoding='utf-8')

print('v3.3.1 patch applied')
