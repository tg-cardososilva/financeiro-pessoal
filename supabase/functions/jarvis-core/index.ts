import { createClient } from 'npm:@supabase/supabase-js@2.115.0';
import { isDocumentKnowledgeQuery, documentKnowledgeReply } from "./document-memory.ts";

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const jsonHeaders = { ...cors, 'Content-Type': 'application/json' };

function normalize(text = '') {
  return String(text).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function parseMoney(text = '') {
  const patterns = [
    /r\$\s*([\d.]+(?:,\d{1,2})?)/i,
    /(?:gastei|paguei|recebi|transferi|comprei|coloquei|saquei|retirei)\s+(?:r\$\s*)?([\d.]+(?:,\d{1,2})?)/i,
    /([\d.]+(?:,\d{1,2})?)\s*reais\b/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const value = Number(match[1].replace(/\./g, '').replace(',', '.'));
    if (Number.isFinite(value) && value > 0) return value;
  }
  return null;
}

function localIntent(text = '') {
  const t = normalize(text);
  const amount = parseMoney(text);
  if (/\b(me lembra|lembrete|lembrar)\b/.test(t)) return { intent: 'reminder', confidence: 0.78, amount: null, direction: null, reply: 'Entendi como uma tarefa ou lembrete.' };
  if (/\b(agenda|agende|reuniao|evento|consulta|dentista)\b/.test(t)) return { intent: 'calendar', confidence: 0.74, amount: null, direction: null, reply: 'Entendi como agenda. Vou preparar a ação para confirmação.' };
  if (/\b(anota|anote|ideia|nota)\b/.test(t)) return { intent: 'note', confidence: 0.82, amount: null, direction: null, reply: 'Entendi como uma nota ou ideia.' };
  if (/\b(viagem|viajar|projeto|planejamento)\b/.test(t)) return { intent: 'project', confidence: 0.68, amount: null, direction: null, reply: 'Entendi como um projeto ou planejamento.' };
  if (amount !== null || /\b(gastei|paguei|pix|recebi|comprei|transferi|aporte|resgate|rendimento)\b/.test(t)) {
    let direction = 'expense';
    if (/\b(recebi|entrada|ganhei)\b/.test(t)) direction = 'income';
    if (/\b(transferi|pix para|minha outra conta)\b/.test(t)) direction = 'transfer';
    if (/\b(aporte|investi|cofrinho|reservei)\b/.test(t)) direction = 'investment';
    if (/\b(rendimento|rendeu|lucro)\b/.test(t)) direction = 'yield';
    return { intent: 'financial', confidence: amount ? 0.8 : 0.62, amount, direction, reply: amount ? `Entendi como financeiro: R$ ${amount.toFixed(2).replace('.', ',')}.` : 'Entendi como financeiro, mas ainda preciso do valor.' };
  }
  if (/\b(quanto|quais|o que|mostra|liste|lista)\b/.test(t)) return { intent: 'query', confidence: 0.55, amount: null, direction: null, reply: 'Entendi como uma consulta ao Jarvis.' };
  return { intent: 'conversation', confidence: 0.4, amount: null, direction: null, reply: 'Mensagem registrada.' };
}

function responseOutputText(payload) {
  if (typeof payload?.output_text === 'string' && payload.output_text.trim()) return payload.output_text.trim();
  for (const item of Array.isArray(payload?.output) ? payload.output : []) {
    for (const part of Array.isArray(item?.content) ? item.content : []) {
      if ((part?.type === 'output_text' || part?.type === 'text') && typeof part?.text === 'string') return part.text.trim();
    }
  }
  return null;
}

async function callOpenAI(message, context) {
  const key = Deno.env.get('OPENAI_API_KEY');
  if (!key) return null;
  const model = Deno.env.get('OPENAI_MODEL') || 'gpt-5.6-luna';
  const localNow = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'full', timeStyle: 'long' }).format(new Date());
  const schema = {
    type: 'object', additionalProperties: false,
    properties: {
      intent: { type: 'string', enum: ['financial','note','reminder','calendar','project','query','conversation','unknown'] },
      confidence: { type: 'number', minimum: 0, maximum: 1 }, reply: { type: 'string' }, confirmation_required: { type: 'boolean' },
      financial: { type: 'object', additionalProperties: false, properties: {
        present: { type: 'boolean' }, direction: { type: 'string', enum: ['expense','income','transfer','investment','yield','adjustment'] },
        amount: { type: ['number','null'] }, merchant: { type: ['string','null'] }, counterparty: { type: ['string','null'] }, description: { type: ['string','null'] },
        payment_method: { type: ['string','null'] }, account_hint: { type: ['string','null'] }, category_hint: { type: ['string','null'] }, occurred_at: { type: ['string','null'] }, notes: { type: ['string','null'] }
      }, required: ['present','direction','amount','merchant','counterparty','description','payment_method','account_hint','category_hint','occurred_at','notes'] },
      note: { type: 'object', additionalProperties: false, properties: { present: { type: 'boolean' }, note_type: { type: 'string', enum: ['note','idea','reference'] }, title: { type: ['string','null'] }, content: { type: ['string','null'] }, tags: { type: 'array', items: { type: 'string' } } }, required: ['present','note_type','title','content','tags'] },
      task: { type: 'object', additionalProperties: false, properties: { present: { type: 'boolean' }, title: { type: ['string','null'] }, description: { type: ['string','null'] }, due_at: { type: ['string','null'] } }, required: ['present','title','description','due_at'] },
      calendar: { type: 'object', additionalProperties: false, properties: { present: { type: 'boolean' }, title: { type: ['string','null'] }, starts_at: { type: ['string','null'] }, ends_at: { type: ['string','null'] }, location: { type: ['string','null'] }, notes: { type: ['string','null'] } }, required: ['present','title','starts_at','ends_at','location','notes'] },
      project: { type: 'object', additionalProperties: false, properties: { present: { type: 'boolean' }, name: { type: ['string','null'] }, description: { type: ['string','null'] }, due_at: { type: ['string','null'] } }, required: ['present','name','description','due_at'] }
    }, required: ['intent','confidence','reply','confirmation_required','financial','note','task','calendar','project']
  };
  const instructions = `Voce e o nucleo do Jarvis. Extraia somente o que o usuario explicitamente pediu ou informou.\n- tarefa = algo para fazer; nota = algo para lembrar/consultar; projeto = contexto que agrupa coisas.\n- nao transforme conversa casual em tarefa, nota ou projeto.\n- nota aceita apenas note, idea ou reference.\n- agenda sempre exige confirmacao.\n- datas usam America/Sao_Paulo. Agora: ${localNow}.\n- nao invente valores, datas, pessoas ou categorias.\nContexto: ${JSON.stringify(context).slice(0, 18000)}`;
  const response = await fetch('https://api.openai.com/v1/responses', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model, store: false, input: [{ role: 'system', content: instructions }, { role: 'user', content: message }], text: { format: { type: 'json_schema', name: 'jarvis_intent', strict: true, schema } } }) });
  if (!response.ok) throw new Error(`OpenAI ${response.status}: ${await response.text()}`);
  const payload = await response.json();
  const text = responseOutputText(payload);
  if (!text) throw new Error('OpenAI sem saida estruturada');
  return JSON.parse(text);
}

function sourceForChannel(channel) { if (channel === 'whatsapp') return 'whatsapp'; if (channel === 'web') return 'jarvis_web'; return 'system'; }
function derivedTitle(content, explicitTitle) { const title = String(explicitTitle || '').trim(); if (title) return title.slice(0, 160); const compact = String(content || '').replace(/\s+/g, ' ').trim(); return compact.slice(0, 120) || 'Nota'; }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Metodo nao suportado' }), { status: 405, headers: jsonHeaders });
  try {
    const auth = req.headers.get('Authorization');
    if (!auth) return new Response(JSON.stringify({ error: 'Nao autenticado' }), { status: 401, headers: jsonHeaders });
    const url = Deno.env.get('SUPABASE_URL'); const anon = Deno.env.get('SUPABASE_ANON_KEY'); if (!url || !anon) throw new Error('Configuracao Supabase ausente');
    const supabase = createClient(url, anon, { global: { headers: { Authorization: auth } } });
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) return new Response(JSON.stringify({ error: 'Sessao invalida' }), { status: 401, headers: jsonHeaders });
    const userId = userData.user.id; const body = await req.json(); const message = String(body?.message || '').trim();
    if (!message) return new Response(JSON.stringify({ error: 'Mensagem vazia' }), { status: 400, headers: jsonHeaders });
    const channel = ['web','whatsapp','other'].includes(body?.channel) ? body.channel : 'web';
    const messageType = ['text','audio','image','document','event'].includes(body?.message_type) ? body.message_type : 'text'; const source = sourceForChannel(channel);
    const { data: inbound, error: inboundError } = await supabase.from('jarvis_messages').insert({ user_id: userId, channel, direction: 'inbound', message_type: messageType, body: message, status: 'processing', raw_data: { source: body?.source || 'jarvis-core' } }).select('*').single();
    if (inboundError) throw inboundError;

    if (isDocumentKnowledgeQuery(message)) {
      const documentReply = await documentKnowledgeReply(supabase, userId, message);
      const now = new Date().toISOString();
      await supabase.from('jarvis_messages').update({ intent: 'query', confidence: 1, status: 'processed', processed_at: now, raw_data: { source: body?.source || 'jarvis-core', engine: documentReply.engine, file_ids: documentReply.items } }).eq('id', inbound.id);
      const { data: outbound, error: outboundError } = await supabase.from('jarvis_messages').insert({ user_id: userId, channel, direction: 'outbound', message_type: 'text', body: documentReply.reply, intent: 'query', confidence: 1, status: 'processed', reply_to_id: inbound.id, processed_at: now, raw_data: { engine: documentReply.engine, file_ids: documentReply.items } }).select('*').single();
      if (outboundError) throw outboundError;
      return new Response(JSON.stringify({ ok: true, engine: documentReply.engine, intent: 'query', confidence: 1, reply: documentReply.reply, confirmation_required: false, created: {}, inbound_message_id: inbound.id, outbound_message_id: outbound.id }), { headers: jsonHeaders });
    }

    const [{ data: memories }, { data: recent }, { data: accounts }, { data: categories }] = await Promise.all([
      supabase.from('jarvis_memories').select('memory_type,title,content,importance').eq('active', true).order('importance', { ascending: false }).limit(12),
      supabase.from('jarvis_messages').select('direction,body,transcript,intent,created_at').order('created_at', { ascending: false }).limit(10),
      supabase.from('accounts').select('id,name,account_type').eq('active', true).order('name'),
      supabase.from('categories').select('id,name,group_name,kind').eq('active', true).order('group_name').order('name')
    ]);
    const context = { memories: memories || [], recent_messages: (recent || []).reverse(), accounts: accounts || [], categories: categories || [] };
    let parsed = null; let engine = 'openai'; try { parsed = await callOpenAI(message, context); } catch (error) { console.error('OpenAI fallback:', error); }
    if (!parsed) { engine = 'rules_v0'; const local = localIntent(message); parsed = { intent: local.intent, confidence: local.confidence, reply: local.reply, confirmation_required: local.intent === 'calendar', financial: { present: local.intent === 'financial' && local.amount !== null, direction: local.direction || 'expense', amount: local.amount, merchant: null, counterparty: null, description: message, payment_method: null, account_hint: null, category_hint: null, occurred_at: null, notes: null }, note: { present: false, note_type: 'note', title: null, content: null, tags: [] }, task: { present: false, title: null, description: null, due_at: null }, calendar: { present: local.intent === 'calendar', title: local.intent === 'calendar' ? message : null, starts_at: null, ends_at: null, location: null, notes: null }, project: { present: false, name: null, description: null, due_at: null } }; }
    const created = {};
    if (parsed.intent === 'financial' && parsed.financial?.present && Number(parsed.financial.amount) > 0) { const accountMatch = parsed.financial.account_hint ? (accounts || []).find((a) => normalize(a.name).includes(normalize(parsed.financial.account_hint)) || normalize(parsed.financial.account_hint).includes(normalize(a.name))) : null; const categoryMatch = parsed.financial.category_hint ? (categories || []).find((c) => normalize(c.name) === normalize(parsed.financial.category_hint) || normalize(`${c.group_name} ${c.name}`).includes(normalize(parsed.financial.category_hint))) : null; const { data, error } = await supabase.from('financial_annotations').insert({ user_id: userId, source_message_id: inbound.id, account_id: accountMatch?.id || null, category_id: categoryMatch?.id || null, occurred_at: parsed.financial.occurred_at || new Date().toISOString(), direction: parsed.financial.direction, amount: parsed.financial.amount, merchant: parsed.financial.merchant, counterparty: parsed.financial.counterparty, description: parsed.financial.description || message, payment_method: parsed.financial.payment_method, account_hint: parsed.financial.account_hint, category_hint: parsed.financial.category_hint, notes: parsed.financial.notes, reconciliation_status: 'pending', metadata: { engine } }).select('*').single(); if (error) throw error; created.financial_annotation = data; }
    if (parsed.intent === 'note' && parsed.note?.present && parsed.note.content) { const { data, error } = await supabase.from('jarvis_notes').insert({ user_id: userId, project_id: null, title: derivedTitle(parsed.note.content, parsed.note.title), content: parsed.note.content, note_type: parsed.note.note_type || 'note', tags: parsed.note.tags || [], source }).select('*').single(); if (error) throw error; created.note = data; }
    if (parsed.intent === 'reminder' && parsed.task?.present && parsed.task.title) { const { data, error } = await supabase.from('jarvis_tasks').insert({ user_id: userId, project_id: null, title: parsed.task.title, description: parsed.task.description, status: 'open', priority: 'normal', due_at: parsed.task.due_at, completed_at: null, recurrence_rule: null, source }).select('*').single(); if (error) throw error; created.task = data; }
    if (parsed.intent === 'project' && parsed.project?.present && parsed.project.name) { const { data, error } = await supabase.from('jarvis_projects').insert({ user_id: userId, name: parsed.project.name, description: parsed.project.description, status: 'active', due_at: parsed.project.due_at, archived_at: null, source }).select('*').single(); if (error) throw error; created.project = data; }
    if (parsed.intent === 'calendar' && parsed.calendar?.present) { const { data, error } = await supabase.from('jarvis_actions').insert({ user_id: userId, source_message_id: inbound.id, action_type: 'calendar_create', status: 'proposed', confirmation_required: true, payload: parsed.calendar }).select('*').single(); if (error) throw error; created.calendar_action = data; }
    await supabase.from('jarvis_messages').update({ intent: parsed.intent, confidence: parsed.confidence, status: parsed.confirmation_required ? 'needs_confirmation' : 'processed', processed_at: new Date().toISOString(), raw_data: { source: body?.source || 'jarvis-core', engine, parsed } }).eq('id', inbound.id);
    const { data: outbound, error: outboundError } = await supabase.from('jarvis_messages').insert({ user_id: userId, channel, direction: 'outbound', message_type: 'text', body: parsed.reply, intent: parsed.intent, confidence: parsed.confidence, status: 'processed', reply_to_id: inbound.id, processed_at: new Date().toISOString(), raw_data: { engine } }).select('*').single(); if (outboundError) throw outboundError;
    return new Response(JSON.stringify({ ok: true, engine, intent: parsed.intent, confidence: parsed.confidence, reply: parsed.reply, confirmation_required: parsed.confirmation_required, created, inbound_message_id: inbound.id, outbound_message_id: outbound.id }), { headers: jsonHeaders });
  } catch (error) { console.error(error); return new Response(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }), { status: 400, headers: jsonHeaders }); }
});
