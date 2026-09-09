function outputText(payload: any) {
  if (typeof payload?.output_text === 'string' && payload.output_text.trim()) return payload.output_text.trim();
  for (const item of Array.isArray(payload?.output) ? payload.output : []) {
    for (const part of Array.isArray(item?.content) ? item.content : []) {
      if (typeof part?.text === 'string' && part.text.trim()) return part.text.trim();
    }
  }
  return '';
}

function config() {
  const key = Deno.env.get('OPENAI_API_KEY') || '';
  if (!key) throw new Error('openai_not_configured');
  return { key, model: Deno.env.get('OPENAI_MODEL') || 'gpt-5.6-luna' };
}

async function response(body: Record<string, unknown>) {
  const { key, model } = config();
  const result = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, store: false, ...body }),
  });
  const payload = await result.json().catch(() => ({}));
  if (!result.ok) throw new Error(`openai_http_${result.status}`);
  return payload;
}

export async function groundedAnswer(message: string, domains: string[], context: Record<string, unknown>) {
  const payload = await response({
    input: [{
      role: 'system',
      content: [
        'Você é o Jarvis, assistente pessoal privado.',
        'Responda em português brasileiro, de forma direta.',
        'Use exclusivamente os dados do CONTEXTO REAL abaixo para afirmações pessoais.',
        'Nunca complete lacunas por suposição. Se o dado pedido não existir, diga claramente que não encontrou.',
        'Valores financeiros usam BRL e datas usam America/Sao_Paulo.',
        'Quando houver links de arquivos, preserve-os.',
        `Domínios consultados deterministicamente: ${domains.join(', ')}.`,
        `CONTEXTO REAL: ${JSON.stringify(context).slice(0, 45000)}`,
      ].join('\n'),
    }, { role: 'user', content: message }],
    max_output_tokens: 1200,
  });
  const text = outputText(payload);
  if (!text) throw new Error('openai_empty_output');
  return { text, model: payload.model || null, usage: payload.usage || null };
}

const calendarEventSchema = {
  type: 'object', additionalProperties: false,
  properties: {
    title: { type: ['string','null'] }, starts_at: { type: ['string','null'] },
    ends_at: { type: ['string','null'] }, location: { type: ['string','null'] }, notes: { type: ['string','null'] },
  },
  required: ['title','starts_at','ends_at','location','notes'],
};

const actionSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    action: {
      type: 'string',
      enum: ['create_task','create_note','create_project','task_complete','task_reopen','calendar_create','create_doc','create_sheet','save_previous_doc','save_previous_sheet','remember','financial_annotation','unknown'],
    },
    reply: { type: 'string' },
    target_query: { type: ['string','null'] },
    project_query: { type: ['string','null'] },
    task: {
      type: 'object', additionalProperties: false,
      properties: {
        title: { type: ['string','null'] }, description: { type: ['string','null'] },
        due_at: { type: ['string','null'] }, priority: { type: 'string', enum: ['low','normal','high','urgent'] },
      },
      required: ['title','description','due_at','priority'],
    },
    note: {
      type: 'object', additionalProperties: false,
      properties: {
        title: { type: ['string','null'] }, content: { type: ['string','null'] },
        note_type: { type: 'string', enum: ['note','idea','reference'] },
        tags: { type: 'array', items: { type: 'string' } },
      },
      required: ['title','content','note_type','tags'],
    },
    project: {
      type: 'object', additionalProperties: false,
      properties: {
        name: { type: ['string','null'] }, description: { type: ['string','null'] }, due_at: { type: ['string','null'] },
      },
      required: ['name','description','due_at'],
    },
    calendar: calendarEventSchema,
    calendar_events: { type: 'array', maxItems: 10, items: calendarEventSchema },
    deliverable: {
      type: 'object', additionalProperties: false,
      properties: {
        title: { type: ['string','null'] }, summary: { type: ['string','null'] },
        document_content: { type: ['string','null'] },
        headings: {
          type: 'array',
          items: {
            type: 'object', additionalProperties: false,
            properties: { start: { type: 'integer' }, end: { type: 'integer' }, level: { type: 'integer', minimum: 1, maximum: 3 } },
            required: ['start','end','level'],
          },
        },
        sheet_rows: { type: 'array', items: { type: 'array', items: { type: ['string','number','boolean','null'] } } },
      },
      required: ['title','summary','document_content','headings','sheet_rows'],
    },
    memory: {
      type: 'object', additionalProperties: false,
      properties: {
        memory_type: { type: 'string', enum: ['preference','fact','context','decision','rule','routine','project_context'] },
        title: { type: ['string','null'] }, content: { type: ['string','null'] },
        importance: { type: 'integer', minimum: 1, maximum: 5 }, scope: { type: ['string','null'] },
      },
      required: ['memory_type','title','content','importance','scope'],
    },
    financial: {
      type: 'object', additionalProperties: false,
      properties: {
        direction: { type: 'string', enum: ['expense','income','transfer','investment','yield','adjustment'] },
        amount: { type: ['number','null'] }, merchant: { type: ['string','null'] },
        description: { type: ['string','null'] }, occurred_at: { type: ['string','null'] },
      },
      required: ['direction','amount','merchant','description','occurred_at'],
    },
  },
  required: ['action','reply','target_query','project_query','task','note','project','calendar','calendar_events','deliverable','memory','financial'],
};

export async function extractAction(message: string, routedAction: string) {
  const localNow = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo', dateStyle: 'full', timeStyle: 'long',
  }).format(new Date());
  const payload = await response({
    input: [{
      role: 'system',
      content: [
        'Extraia uma ação que o usuário pediu explicitamente. Não invente campos.',
        `O roteador determinístico classificou como: ${routedAction}.`,
        'Mantenha a ação do roteador, exceto se a mensagem for realmente ambígua; nesse caso use unknown.',
        'Tarefa é algo a fazer; nota é conteúdo para guardar; projeto agrupa trabalho.',
        'Agenda cria apenas propostas que exigirão confirmação.',
        'Para Calendar, extraia um item em calendar_events para cada compromisso distinto pedido, preservando a ordem.',
        'Em Calendar, calendar deve repetir o primeiro item para compatibilidade; sem compromissos, use calendar com campos nulos e calendar_events vazio.',
        'Se o início estiver claro e duração/fim não forem informados, deixe ends_at nulo; o contrato aplicará 60 minutos e mostrará isso na confirmação.',
        'Docs são texto estruturado. Sheets são tabelas. Não use Slides.',
        'Para memória, só aceite preferência, fato estável, decisão, regra, rotina ou contexto de projeto explicitamente declarado.',
        `Agora em America/Sao_Paulo: ${localNow}.`,
      ].join('\n'),
    }, { role: 'user', content: message }],
    text: { format: { type: 'json_schema', name: 'jarvis_action', strict: true, schema: actionSchema } },
    max_output_tokens: 3000,
  });
  const text = outputText(payload);
  if (!text) throw new Error('openai_empty_output');
  return { parsed: JSON.parse(text), model: payload.model || null, usage: payload.usage || null };
}

const researchSchema = {
  type: 'object', additionalProperties: false,
  properties: {
    title: { type: 'string' },
    summary: { type: 'string' },
    document_content: { type: 'string' },
    headings: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        properties: { start: { type: 'integer' }, end: { type: 'integer' }, level: { type: 'integer', minimum: 1, maximum: 3 } },
        required: ['start','end','level'],
      },
    },
    sheet_rows: { type: 'array', items: { type: 'array', items: { type: ['string','number','boolean','null'] } } },
    sources: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        properties: { title: { type: 'string' }, url: { type: 'string' } },
        required: ['title','url'],
      },
    },
  },
  required: ['title','summary','document_content','headings','sheet_rows','sources'],
};

export async function researchWithSources(message: string, deliverableType: 'doc' | 'sheet') {
  const payload = await response({
    tools: [{ type: 'web_search' }],
    include: ['web_search_call.action.sources'],
    input: [{
      role: 'system',
      content: [
        'Pesquise a solicitação usando fontes atuais e rastreáveis.',
        'Prefira fontes primárias e identifique claramente incertezas.',
        'Nunca invente URL, número ou fato.',
        deliverableType === 'sheet'
          ? 'Produza sheet_rows com cabeçalho e linhas comparáveis; document_content pode conter um resumo curto.'
          : 'Produza document_content estruturado, incluindo ao final uma seção Fontes com título e URL; sheet_rows pode ser vazio.',
        'Os índices de headings são offsets UTF-16, base zero, dentro de document_content.',
      ].join('\n'),
    }, { role: 'user', content: message }],
    text: { format: { type: 'json_schema', name: 'jarvis_research', strict: true, schema: researchSchema } },
    max_output_tokens: 7000,
  });
  const text = outputText(payload);
  if (!text) throw new Error('openai_empty_output');
  const parsed = JSON.parse(text);
  const sources = new Map<string, { title: string; url: string }>();
  for (const source of Array.isArray(parsed.sources) ? parsed.sources : []) {
    if (/^https:\/\//i.test(source?.url || '')) sources.set(source.url, { title: source.title || source.url, url: source.url });
  }
  const visit = (value: any) => {
    if (!value || typeof value !== 'object') return;
    if (typeof value.url === 'string' && /^https:\/\//i.test(value.url)) {
      sources.set(value.url, { title: String(value.title || value.url), url: value.url });
    }
    for (const nested of Object.values(value)) visit(nested);
  };
  visit(payload.output);
  parsed.sources = [...sources.values()].slice(0, 50);
  if (!parsed.sources.length) throw new Error('research_sources_missing');
  return { result: parsed, model: payload.model || null, usage: payload.usage || null };
}
