import { executeDomainAction } from './domain-service.ts';
import { createDeliverableForUser } from './deliverable-service.ts';
import { rememberForUser } from './memory-service.ts';
import { extractAction, groundedAnswer, researchWithSources } from './openai.ts';
import { routeJarvisMessage } from './jarvis-router.mjs';
import { contextHasData, retrieveJarvisContext } from './retrieval.ts';

function sourceForChannel(channel: string) {
  return channel === 'whatsapp' ? 'whatsapp' : channel === 'web' ? 'jarvis_web' : 'system';
}

function cleanChannel(value: unknown) {
  return ['web','whatsapp','other'].includes(String(value)) ? String(value) : 'web';
}

function canonicalIntent(routeIntent: string) {
  const intents: Record<string, string> = {
    create_task: 'reminder', task_complete: 'reminder', task_reopen: 'reminder',
    create_note: 'note', create_project: 'project', calendar_create: 'calendar',
    financial_annotation: 'financial', remember: 'conversation',
    create_doc: 'query', create_sheet: 'query', research_doc: 'research',
    research_sheet: 'research', save_previous_doc: 'query', save_previous_sheet: 'query',
  };
  const normalized = intents[routeIntent] || routeIntent;
  return ['research','conversation','query','calendar','financial','note','reminder','project','unknown'].includes(normalized)
    ? normalized : 'query';
}

function simpleTitle(value: string, fallback: string) {
  const stripped = value.replace(/^(por favor\s+)?(crie|adicione|anote|guarde|registre|monte|faça|gere)\s+/i, '')
    .replace(/^(uma?|o)\s+(tarefa|nota|ideia|projeto)\s+(para|sobre|chamada?)?\s*/i, '')
    .replace(/\s+/g, ' ').trim();
  return stripped.slice(0, 180) || fallback;
}

async function resolveProject(client: any, userId: string, query: unknown) {
  const q = String(query || '').replace(/[,%()]/g, ' ').trim();
  if (!q) return null;
  const { data, error } = await client.from('jarvis_projects').select('id,name')
    .eq('user_id', userId).ilike('name', `%${q}%`).in('status', ['active','paused'])
    .order('updated_at', { ascending: false }).limit(2);
  if (error) throw error;
  return data?.length === 1 ? data[0] : null;
}

async function resolveTask(client: any, userId: string, query: unknown) {
  const q = String(query || '').replace(/[,%()]/g, ' ').trim();
  if (!q) throw new Error('task_target_missing');
  const { data, error } = await client.from('jarvis_tasks').select('*')
    .eq('user_id', userId).ilike('title', `%${q}%`).order('updated_at', { ascending: false }).limit(3);
  if (error) throw error;
  if (!data?.length) throw new Error('task_not_found');
  const exact = data.find((task: any) => task.title.toLowerCase() === q.toLowerCase());
  if (!exact && data.length > 1) throw new Error('task_target_ambiguous');
  return exact || data[0];
}

async function saveOutbound(client: any, input: {
  userId: string; channel: string; inboundId: string; body: string; intent: string; engine: string; metadata?: any;
}) {
  const { data, error } = await client.from('jarvis_messages').insert({
    user_id: input.userId,
    channel: input.channel,
    direction: 'outbound',
    message_type: 'text',
    body: input.body,
    intent: input.intent,
    confidence: 1,
    status: 'processed',
    reply_to_id: input.inboundId,
    processed_at: new Date().toISOString(),
    raw_data: { engine: input.engine, ...(input.metadata || {}) },
  }).select('*').single();
  if (error) throw error;
  return data;
}

function fallbackAction(message: string, routedAction: string) {
  const empty: any = {
    action: routedAction, reply: '', target_query: null, project_query: null,
    task: { title: null, description: null, due_at: null, priority: 'normal' },
    note: { title: null, content: null, note_type: 'note', tags: [] },
    project: { name: null, description: null, due_at: null },
    calendar: { title: null, starts_at: null, ends_at: null, location: null, notes: null },
    deliverable: { title: null, summary: null, document_content: null, headings: [], sheet_rows: [] },
    memory: { memory_type: 'context', title: null, content: null, importance: 3, scope: 'personal' },
    financial: { direction: 'expense', amount: null, merchant: null, description: null, occurred_at: null },
  };
  if (routedAction === 'create_task') empty.task = { ...empty.task, title: simpleTitle(message, 'Nova tarefa'), description: message };
  if (routedAction === 'create_note') empty.note = { ...empty.note, title: simpleTitle(message, 'Nova nota'), content: message };
  if (routedAction === 'create_project') empty.project = { ...empty.project, name: simpleTitle(message, 'Novo projeto'), description: message };
  return empty;
}

async function performAction(args: {
  client: any; admin: any; userId: string; channel: string; message: string;
  action: string; parsed: any; inboundId: string;
}) {
  const { client, admin, userId, channel, message, action, parsed, inboundId } = args;
  const source = sourceForChannel(channel);
  const keyBase = `jarvis-core:${inboundId}`;
  const project = await resolveProject(client, userId, parsed.project_query);
  const created: Record<string, unknown> = {};
  let reply = parsed.reply || '';
  let confirmationRequired = false;

  if (action === 'create_task') {
    const result = await executeDomainAction(client, userId, {
      entity: 'task', action: 'create', explicit: true, idempotency_key: `${keyBase}:task`,
      data: {
        title: parsed.task?.title || simpleTitle(message, 'Nova tarefa'),
        description: parsed.task?.description || null, due_at: parsed.task?.due_at || null,
        priority: parsed.task?.priority || 'normal', project_id: project?.id || null, source,
      },
    });
    created.task = result.item;
    reply = `Tarefa criada: ${result.item.title}.`;
  } else if (action === 'create_note') {
    const content = parsed.note?.content || message;
    const result = await executeDomainAction(client, userId, {
      entity: 'note', action: 'create', explicit: true, idempotency_key: `${keyBase}:note`,
      data: {
        title: parsed.note?.title || simpleTitle(content, 'Nova nota'), content,
        note_type: parsed.note?.note_type || 'note', tags: parsed.note?.tags || [],
        project_id: project?.id || null, source,
      },
    });
    created.note = result.item;
    reply = `Nota salva: ${result.item.title}.`;
  } else if (action === 'create_project') {
    const result = await executeDomainAction(client, userId, {
      entity: 'project', action: 'create', explicit: true, idempotency_key: `${keyBase}:project`,
      data: {
        name: parsed.project?.name || simpleTitle(message, 'Novo projeto'),
        description: parsed.project?.description || null, due_at: parsed.project?.due_at || null, source,
      },
    });
    created.project = result.item;
    reply = `Projeto criado: ${result.item.name}.`;
  } else if (action === 'task_complete' || action === 'task_reopen') {
    const task = await resolveTask(client, userId, parsed.target_query);
    const result = await executeDomainAction(client, userId, {
      entity: 'task', action, id: task.id, explicit: true, idempotency_key: `${keyBase}:${action}`,
    });
    created.task = result.item;
    reply = action === 'task_complete' ? `Tarefa concluída: ${result.item.title}.` : `Tarefa reaberta: ${result.item.title}.`;
  } else if (action === 'calendar_create') {
    const calendar = parsed.calendar || {};
    if (!calendar.title || !calendar.starts_at || !calendar.ends_at) throw new Error('calendar_details_missing');
    const { data, error } = await client.from('jarvis_actions').insert({
      user_id: userId, source_message_id: inboundId, action_type: 'calendar_create',
      status: 'proposed', confirmation_required: true,
      payload: {
        title: calendar.title, starts_at: calendar.starts_at, ends_at: calendar.ends_at,
        location: calendar.location || null, notes: calendar.notes || null,
        idempotency_key: `${keyBase}:calendar`,
      },
    }).select('*').single();
    if (error) throw error;
    created.calendar_action = data;
    confirmationRequired = true;
    reply = `Preparei o compromisso “${calendar.title}”. Confirme para criar no Google Calendar.`;
  } else if (['create_doc','create_sheet','research_doc','research_sheet','save_previous_doc','save_previous_sheet'].includes(action)) {
    let deliverable = parsed.deliverable || {};
    let sources: any[] = [];
    if (action.startsWith('research_')) {
      const research = await researchWithSources(message, action.endsWith('sheet') ? 'sheet' : 'doc');
      deliverable = research.result;
      sources = research.result.sources || [];
    }
    if (action.startsWith('save_previous_')) {
      const previous = await client.from('jarvis_messages').select('body,created_at')
        .eq('user_id', userId).eq('direction', 'outbound').neq('reply_to_id', inboundId)
        .order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (previous.error) throw previous.error;
      if (!previous.data?.body) throw new Error('previous_content_not_found');
      deliverable = {
        title: parsed.deliverable?.title || 'Conteúdo salvo pelo Jarvis',
        summary: parsed.deliverable?.summary || 'Conteúdo da interação anterior.',
        document_content: previous.data.body,
        headings: [],
        sheet_rows: parsed.deliverable?.sheet_rows || [['Conteúdo'], [previous.data.body]],
      };
    }
    const type = action.endsWith('sheet') ? 'sheet' : 'doc';
    const result = await createDeliverableForUser({
      client, admin, userId,
      body: {
        explicit: true, idempotency_key: `${keyBase}:deliverable`, type,
        title: deliverable.title || (type === 'sheet' ? 'Planilha criada pelo Jarvis' : 'Documento criado pelo Jarvis'),
        project_id: project?.id || null, source,
        summary: deliverable.summary || null, sources,
        document: { content: deliverable.document_content, headings: deliverable.headings || [] },
        sheet: { rows: deliverable.sheet_rows || [] },
      },
    });
    created.deliverable = result.deliverable;
    reply = `${type === 'sheet' ? 'Planilha' : 'Documento'} criado: ${result.deliverable.title}. ${result.deliverable.link || ''}`.trim();
  } else if (action === 'remember') {
    const result = await rememberForUser(client, userId, parsed.memory);
    created.memory = result.item;
    reply = `Memória atualizada: ${result.item.title}.`;
  } else if (action === 'financial_annotation') {
    const financial = parsed.financial;
    if (!financial?.amount || Number(financial.amount) <= 0) throw new Error('financial_amount_missing');
    const { data, error } = await client.from('financial_annotations').insert({
      user_id: userId, source_message_id: inboundId, occurred_at: financial.occurred_at || new Date().toISOString(),
      direction: financial.direction || 'expense', amount: Number(financial.amount),
      merchant: financial.merchant || null, description: financial.description || message,
      reconciliation_status: 'pending', metadata: { source, idempotency_key: `${keyBase}:financial` },
    }).select('*').single();
    if (error) throw error;
    created.financial_annotation = data;
    reply = 'Contexto financeiro registrado para conciliação; nenhuma transação foi criada automaticamente.';
  } else throw new Error('unsupported_action');

  return { created, reply, confirmationRequired };
}

export async function executeJarvis({
  client, admin, userId, body,
}: { client: any; admin: any; userId: string; body: any }) {
  const message = String(body?.message || '').trim();
  if (!message) throw new Error('empty_message');
  const channel = cleanChannel(body?.channel);
  const externalMessageId = body?.external_message_id ? String(body.external_message_id).slice(0, 300) : null;

  if (externalMessageId) {
    const existing = await client.from('jarvis_messages').select('id,status,intent')
      .eq('user_id', userId).eq('channel', channel).eq('external_message_id', externalMessageId).maybeSingle();
    if (existing.error) throw existing.error;
    if (existing.data) {
      const outbound = await client.from('jarvis_messages').select('*')
        .eq('reply_to_id', existing.data.id).eq('direction', 'outbound').order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (outbound.error) throw outbound.error;
      return {
        ok: true, idempotent_replay: true, intent: existing.data.intent,
        reply: outbound.data?.body || 'Mensagem já recebida e em processamento.',
        inbound_message_id: existing.data.id, outbound_message_id: outbound.data?.id || null,
      };
    }
  }

  const route = routeJarvisMessage(message);
  const inboundResult = await client.from('jarvis_messages').insert({
    user_id: userId, identity_id: body?.identity_id || null, channel, direction: 'inbound',
    message_type: ['text','audio','image','document','event'].includes(body?.message_type) ? body.message_type : 'text',
    body: message, external_message_id: externalMessageId, status: 'processing',
    raw_data: { source: body?.source || 'jarvis-core', route: { mode: route.mode, action: route.action, domains: route.domains } },
  }).select('*').single();
  if (inboundResult.error) throw inboundResult.error;
  const inbound = inboundResult.data;

  try {
    let reply = '';
    let engine = 'deterministic_retrieval_v1';
    let created: Record<string, unknown> = {};
    let confirmationRequired = false;
    let intent = route.mode === 'action' ? route.action || 'unknown' : route.mode;
    let metadata: any = { domains: route.domains };

    if (route.mode === 'query') {
      const context = await retrieveJarvisContext(client, admin, userId, route.domains, message);
      metadata.context_domains = Object.keys(context);
      if (!contextHasData(context)) {
        reply = `Não encontrei dados em ${route.domains.join(', ') || 'nenhum domínio'} para responder a isso.`;
      } else {
        try {
          const answer = await groundedAnswer(message, route.domains, context);
          reply = answer.text;
          engine = 'openai_grounded_retrieval_v1';
          metadata.model = answer.model;
        } catch {
          reply = context.attention?.summary || 'Encontrei dados reais, mas não consegui sintetizá-los agora. Tente novamente.';
          engine = 'deterministic_fallback_v1';
        }
      }
    } else if (route.mode === 'research') {
      const research = await researchWithSources(message, 'doc');
      reply = `${research.result.summary}\n\nFontes:\n${research.result.sources.map((source: any) => `- ${source.title}: ${source.url}`).join('\n')}`;
      engine = 'openai_web_search_v1';
      metadata.source_count = research.result.sources.length;
    } else if (route.mode === 'action' && route.action) {
      let parsed: any;
      try {
        let extractionMessage = message;
        if (['create_doc','create_sheet'].includes(route.action) && /\b(isso|isto|esses|essas|anterior|acima)\b/i.test(message)) {
          const previous = await client.from('jarvis_messages').select('body')
            .eq('user_id', userId).eq('direction', 'outbound').neq('reply_to_id', inbound.id)
            .order('created_at', { ascending: false }).limit(1).maybeSingle();
          if (previous.error) throw previous.error;
          if (previous.data?.body) extractionMessage = `${message}\n\nCONTEXTO ANTERIOR SOLICITADO PELO USUÁRIO:\n${String(previous.data.body).slice(0, 16000)}`;
        }
        const extracted = await extractAction(extractionMessage, route.action);
        parsed = extracted.parsed;
        metadata.model = extracted.model;
        engine = 'openai_action_v1';
      } catch {
        parsed = fallbackAction(message, route.action);
        engine = 'deterministic_action_fallback_v1';
      }
      const result = await performAction({
        client, admin, userId, channel, message, action: route.action,
        parsed, inboundId: inbound.id,
      });
      reply = result.reply;
      created = result.created;
      confirmationRequired = result.confirmationRequired;
    } else {
      reply = 'Estou pronto. Posso consultar seus dados, organizar tarefas, notas e projetos, ou criar um documento quando você pedir.';
      intent = 'conversation';
    }

    const processedAt = new Date().toISOString();
    const updateResult = await client.from('jarvis_messages').update({
      intent: canonicalIntent(intent),
      confidence: 1,
      status: confirmationRequired ? 'needs_confirmation' : 'processed',
      processed_at: processedAt,
      raw_data: { source: body?.source || 'jarvis-core', engine, ...metadata },
    }).eq('id', inbound.id).eq('user_id', userId);
    if (updateResult.error) throw updateResult.error;
    const outbound = await saveOutbound(client, {
      userId, channel, inboundId: inbound.id, body: reply,
      intent: canonicalIntent(intent),
      engine, metadata,
    });
    return {
      ok: true, engine, route, intent, confidence: 1, reply,
      confirmation_required: confirmationRequired, created,
      inbound_message_id: inbound.id, outbound_message_id: outbound.id,
    };
  } catch (error) {
    const code = error instanceof Error ? error.message : 'jarvis_failed';
    await client.from('jarvis_messages').update({
      status: 'failed', processed_at: new Date().toISOString(),
      raw_data: { source: body?.source || 'jarvis-core', engine: 'jarvis_engine_v1', error_code: code.slice(0, 120) },
    }).eq('id', inbound.id).eq('user_id', userId);
    throw error;
  }
}
