import { buildAttentionItems, attentionSummary } from './attention-core.js';
import { listCalendarEvents } from './google.ts';

const TZ = 'America/Sao_Paulo';
const DAY = 24 * 60 * 60 * 1000;

function normalize(value = '') {
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function localParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value || '';
  return { year: Number(get('year')), month: Number(get('month')), day: Number(get('day')) };
}

function monthWindow(message: string, now = new Date()) {
  const t = normalize(message);
  const local = localParts(now);
  let year = local.year;
  let month = local.month;
  if (/mes passado|ultimo mes/.test(t)) {
    month -= 1;
    if (month === 0) { month = 12; year -= 1; }
  }
  const first = `${year}-${String(month).padStart(2, '0')}-01`;
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const endExclusive = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;
  return { first, endExclusive, label: month === local.month && year === local.year ? 'este mês' : 'mês passado' };
}

function previousWindow(window: { first: string; endExclusive: string }) {
  const [year, month] = window.first.split('-').map(Number);
  const previousMonth = month === 1 ? 12 : month - 1;
  const previousYear = month === 1 ? year - 1 : year;
  return {
    first: `${previousYear}-${String(previousMonth).padStart(2, '0')}-01`,
    endExclusive: window.first,
    label: 'período anterior',
  };
}

function searchTerms(message: string) {
  const stop = new Set([
    'onde','esta','estao','meu','minha','meus','minhas','qual','quais','quanto','quantos','gastei','gastos',
    'este','essa','esse','isso','mes','hoje','amanha','projeto','projetos','arquivo','arquivos','documento',
    'documentos','tarefa','tarefas','nota','notas','jarvis','preciso','quero','mostre','liste','sobre','para',
    'compare','comparar','comparacao','comparativo','passado','ultimo','ultima','ultimos','ultimas','deste','desse',
  ]);
  return [...new Set(normalize(message).split(/[^a-z0-9]+/).filter((word) => word.length >= 3 && !stop.has(word)))].slice(0, 6);
}

async function financeContext(client: any, userId: string, message: string) {
  const window = monthWindow(message);
  const previous = previousWindow(window);
  const terms = searchTerms(message);
  const search = terms[0] || null;
  const [summaryResult, previousResult, balanceResult, positionsResult, movementsResult] = await Promise.all([
    client.rpc('jarvis_finance_summary', {
      p_start: window.first, p_end_exclusive: window.endExclusive, p_search: search,
    }),
    client.rpc('jarvis_finance_summary', {
      p_start: previous.first, p_end_exclusive: previous.endExclusive, p_search: search,
    }),
    client.from('account_current_balances')
      .select('account_id,name,account_type,confirmed_balance,balance_date,current_balance,last_movement_after_balance')
      .eq('user_id', userId),
    client.from('investment_positions')
      .select('id,name,asset_type,ticker,invested_amount,current_value,liquidity_label,maturity_date,updated_at')
      .eq('user_id', userId).eq('active', true).order('current_value', { ascending: false }).limit(100),
    client.from('investment_movements')
      .select('id,movement_date,movement_type,amount,position_id,notes')
      .eq('user_id', userId).gte('movement_date', window.first).lt('movement_date', window.endExclusive)
      .order('movement_date', { ascending: false }).limit(100),
  ]);
  const failure = [summaryResult, previousResult, balanceResult, positionsResult, movementsResult]
    .find((result: any) => result.error)?.error;
  if (failure) throw failure;
  const summary = summaryResult.data || { totals: {}, matched_totals: {}, categories: [], transactions: [] };
  const previousSummary = previousResult.data || { totals: {}, matched_totals: {} };
  const currentTotals = search ? summary.matched_totals || {} : summary.totals || {};
  const previousTotals = search ? previousSummary.matched_totals || {} : previousSummary.totals || {};
  const currentExpenses = Number(currentTotals.expenses || 0);
  const previousExpenses = Number(previousTotals.expenses || 0);
  const positions = positionsResult.data || [];
  return {
    period: window,
    totals: summary.totals || {},
    matched_totals: summary.matched_totals || {},
    comparison: {
      period: previous,
      totals: previousSummary.totals || {},
      matched_totals: previousSummary.matched_totals || {},
      expense_delta: currentExpenses - previousExpenses,
      expense_change_percent: previousExpenses > 0 ? ((currentExpenses - previousExpenses) / previousExpenses) * 100 : null,
    },
    categories: summary.categories || [],
    balances: balanceResult.data || [],
    investments: {
      positions,
      movements: movementsResult.data || [],
      invested_total: positions.reduce((sum: number, row: any) => sum + Number(row.invested_amount || 0), 0),
      current_total: positions.reduce((sum: number, row: any) => sum + Number(row.current_value || 0), 0),
    },
    transactions: summary.transactions || [],
  };
}

async function domainContext(client: any, userId: string, domains: string[], message: string) {
  const terms = searchTerms(message);
  const q = terms[0] || '';
  const result: Record<string, unknown> = {};
  let projects: any[] = [];
  if (domains.includes('projects')) {
    let query = client.from('jarvis_projects').select('*').eq('user_id', userId)
      .order('updated_at', { ascending: false }).limit(100);
    if (q) query = query.or(`name.ilike.%${q}%,description.ilike.%${q}%`);
    const response = await query;
    if (response.error) throw response.error;
    projects = response.data || [];
    result.projects = projects;
  }
  const projectIds = projects.map((row) => row.id);
  if (domains.includes('tasks')) {
    let query = client.from('jarvis_tasks').select('*').eq('user_id', userId)
      .order('updated_at', { ascending: false }).limit(200);
    if (projectIds.length && domains.includes('projects')) query = query.in('project_id', projectIds);
    else if (q) query = query.or(`title.ilike.%${q}%,description.ilike.%${q}%`);
    const response = await query;
    if (response.error) throw response.error;
    result.tasks = response.data || [];
  }
  if (domains.includes('notes')) {
    let query = client.from('jarvis_notes').select('*').eq('user_id', userId)
      .order('updated_at', { ascending: false }).limit(150);
    if (projectIds.length && domains.includes('projects')) query = query.in('project_id', projectIds);
    else if (q) query = query.or(`title.ilike.%${q}%,content.ilike.%${q}%`);
    const response = await query;
    if (response.error) throw response.error;
    result.notes = response.data || [];
  }
  if (domains.includes('files')) {
    let query = client.from('jarvis_files')
      .select('id,name,mime_type,web_view_link,modified_at_provider,project_id,source,metadata')
      .eq('user_id', userId).order('modified_at_provider', { ascending: false }).limit(150);
    if (projectIds.length && domains.includes('projects')) query = query.in('project_id', projectIds);
    else if (q) query = query.ilike('name', `%${q}%`);
    const response = await query;
    if (response.error) throw response.error;
    result.files = response.data || [];
  }
  if (domains.includes('documents')) {
    let query = client.from('jarvis_document_processing')
      .select('id,jarvis_file_id,processing_status,document_type,extracted_data,confidence,processed_at,error_code')
      .eq('user_id', userId).order('updated_at', { ascending: false }).limit(100);
    if (q) query = query.ilike('extracted_text', `%${q}%`);
    const response = await query;
    if (response.error) throw response.error;
    const documents = response.data || [];
    const fileIds = documents.map((row: any) => row.jarvis_file_id);
    let files: any[] = [];
    if (fileIds.length) {
      const fileResponse = await client.from('jarvis_files').select('id,name,web_view_link,project_id')
        .eq('user_id', userId).in('id', fileIds);
      if (fileResponse.error) throw fileResponse.error;
      files = fileResponse.data || [];
    }
    const byId = new Map(files.map((file: any) => [file.id, file]));
    result.documents = documents.map((document: any) => ({ ...document, file: byId.get(document.jarvis_file_id) || null }));
  }
  if (domains.includes('memories')) {
    let query = client.from('jarvis_memories')
      .select('id,memory_type,title,content,importance,memory_key,updated_at,expires_at')
      .eq('user_id', userId).eq('active', true)
      .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
      .order('importance', { ascending: false }).limit(20);
    if (q) query = query.or(`title.ilike.%${q}%,content.ilike.%${q}%`);
    const response = await query;
    if (response.error) throw response.error;
    result.memories = response.data || [];
  }
  return result;
}

async function attentionContext(client: any, admin: any, userId: string) {
  const now = new Date();
  const [
    tasks, actions, reviewTransactions, annotations, connections, projects,
    documents, health, latest, calendar,
  ] = await Promise.all([
    client.from('jarvis_tasks').select('id,project_id,title,status,priority,due_at,updated_at').eq('user_id', userId).eq('status', 'open').limit(300),
    client.from('jarvis_actions').select('id,action_type,status,payload,created_at').eq('user_id', userId).eq('status', 'proposed').limit(100),
    client.from('transactions').select('id,transaction_date,review_status,created_at').eq('user_id', userId).in('review_status', ['auto','needs_review']).limit(500),
    client.from('financial_annotations').select('id,reconciliation_status,occurred_at,created_at').eq('user_id', userId).eq('reconciliation_status', 'pending').limit(200),
    client.from('jarvis_connections').select('id,provider,status,updated_at').eq('user_id', userId),
    client.from('jarvis_projects').select('id,name,status,due_at,updated_at').eq('user_id', userId).in('status', ['active','paused']).limit(200),
    client.from('jarvis_document_processing').select('id,jarvis_file_id,processing_status,extracted_data').eq('user_id', userId).eq('processing_status', 'completed').limit(200),
    client.from('jarvis_health_checks').select('id,component,status,code,message,action_required,checked_at').eq('user_id', userId),
    client.from('transactions').select('transaction_date').eq('user_id', userId).order('transaction_date', { ascending: false }).limit(1).maybeSingle(),
    listCalendarEvents(admin, userId, now, new Date(now.getTime() + 4 * DAY))
      .then((events) => ({ events, error: null }))
      .catch((error) => ({ events: [], error: error instanceof Error ? error.message : 'calendar_unavailable' })),
  ]);
  const dbResults: any[] = [tasks,actions,reviewTransactions,annotations,connections,projects,documents,health,latest];
  const dbError = dbResults.find((result) => result.error)?.error;
  if (dbError) throw dbError;
  const fileIds = (documents.data || []).map((row: any) => row.jarvis_file_id);
  let byFile = new Map<string, string>();
  if (fileIds.length) {
    const files = await client.from('jarvis_files').select('id,name').eq('user_id', userId).in('id', fileIds);
    if (files.error) throw files.error;
    byFile = new Map((files.data || []).map((file: any) => [file.id, file.name]));
  }
  const items = buildAttentionItems({
    tasks: tasks.data || [], actions: actions.data || [], reviewTransactions: reviewTransactions.data || [],
    annotations: annotations.data || [], connections: connections.data || [], projects: projects.data || [],
    documents: (documents.data || []).map((row: any) => ({ ...row, file_name: byFile.get(row.jarvis_file_id) || 'Documento' })),
    healthChecks: health.data || [], latestFinancialDate: latest.data?.transaction_date || null,
    calendarEvents: calendar.events, calendarError: calendar.error, now, timezone: TZ,
  });
  return { summary: attentionSummary(items), items: items.slice(0, 30), generated_at: now.toISOString() };
}

export async function retrieveJarvisContext(client: any, admin: any, userId: string, domains: string[], message: string): Promise<Record<string, any>> {
  const context: Record<string, any> = {};
  if (domains.includes('finance')) context.finance = await financeContext(client, userId, message);
  if (domains.includes('agenda')) {
    const now = new Date();
    const t = normalize(message);
    const days = /amanha/.test(t) ? 2 : /semana|proximos dias/.test(t) ? 8 : 14;
    context.agenda = {
      timezone: TZ,
      events: await listCalendarEvents(admin, userId, new Date(now.getTime() - DAY), new Date(now.getTime() + days * DAY)),
    };
  }
  Object.assign(context, await domainContext(client, userId, domains, message));
  if (domains.includes('attention')) context.attention = await attentionContext(client, admin, userId);
  return context;
}

export function contextHasData(context: Record<string, any>) {
  return Object.values(context).some((value: any) => {
    if (Array.isArray(value)) return value.length > 0;
    if (!value || typeof value !== 'object') return Boolean(value);
    if (Array.isArray(value.items)) return value.items.length > 0;
    if (Array.isArray(value.events)) return value.events.length > 0;
    if (value.totals?.transaction_count > 0) return true;
    return Object.values(value).some((nested: any) => Array.isArray(nested) ? nested.length > 0 : Boolean(nested));
  });
}
