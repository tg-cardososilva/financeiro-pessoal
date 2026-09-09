import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { buildAttentionItems, attentionSummary } from '../_shared/attention-core.js';
import { adminClient, authenticatedContext } from '../_shared/auth.ts';
import { listCalendarEvents } from '../_shared/google.ts';
import { corsHeaders, json } from '../_shared/http.ts';

const admin = adminClient();

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  try {
    const { client, userId } = await authenticatedContext(req);
    const now = new Date();
    const calendarEnd = new Date(now.getTime() + 4 * 24 * 60 * 60 * 1000);
    const [
      tasksResult, actionsResult, transactionsResult, annotationsResult,
      connectionsResult, projectsResult, documentsResult, healthResult, latestResult,
      calendarResult,
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
      listCalendarEvents(admin, userId, now, calendarEnd)
        .then((events) => ({ events, error: null }))
        .catch((error) => ({ events: [], error: error instanceof Error ? error.message : 'calendar_unavailable' })),
    ]);
    const dbError = [
      tasksResult, actionsResult, transactionsResult, annotationsResult, connectionsResult,
      projectsResult, documentsResult, healthResult, latestResult,
    ].find((result: any) => result.error)?.error;
    if (dbError) throw dbError;

    const fileIds = (documentsResult.data || []).map((row: any) => row.jarvis_file_id);
    let fileNames = new Map<string, string>();
    if (fileIds.length) {
      const { data: files, error } = await client.from('jarvis_files').select('id,name')
        .eq('user_id', userId).in('id', fileIds);
      if (error) throw error;
      fileNames = new Map((files || []).map((file: any) => [file.id, file.name]));
    }
    const documents = (documentsResult.data || []).map((document: any) => ({
      ...document,
      file_name: fileNames.get(document.jarvis_file_id) || 'Documento',
    }));
    const items = buildAttentionItems({
      tasks: tasksResult.data || [],
      actions: actionsResult.data || [],
      reviewTransactions: transactionsResult.data || [],
      annotations: annotationsResult.data || [],
      connections: connectionsResult.data || [],
      projects: projectsResult.data || [],
      documents,
      healthChecks: healthResult.data || [],
      latestFinancialDate: latestResult.data?.transaction_date || null,
      calendarEvents: calendarResult.events,
      calendarError: calendarResult.error,
      now,
      timezone: 'America/Sao_Paulo',
    });
    return json({
      ok: true,
      generated_at: now.toISOString(),
      timezone: 'America/Sao_Paulo',
      items,
      summary: attentionSummary(items),
      sources: {
        tasks: tasksResult.data?.length || 0,
        actions: actionsResult.data?.length || 0,
        review_transactions: transactionsResult.data?.length || 0,
        annotations: annotationsResult.data?.length || 0,
        calendar_events: calendarResult.events.length,
        documents: documents.length,
        projects: projectsResult.data?.length || 0,
      },
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : 'attention_unavailable';
    return json({ error: ['not_authenticated','invalid_session'].includes(code) ? code : 'attention_unavailable' },
      ['not_authenticated','invalid_session'].includes(code) ? 401 : 500);
  }
});
