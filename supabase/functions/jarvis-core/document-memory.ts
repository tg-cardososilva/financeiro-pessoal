function normalize(text = '') {
  return String(text).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

export function isDocumentKnowledgeQuery(message = '') {
  const t = normalize(message);
  const subject = /\b(contrato|documento|documentos|nota fiscal|nota|recibo|comprovante|passagem|reserva|hospedagem|hotel|viagem|localizador|clausula|clausulas|obrigacao|obrigacoes)\b/.test(t);
  const question = /\b(o que diz|resumo|resuma|qual|quais|quanto|valor|quando|data|localizador|vencimento|partes|obrigacao|obrigacoes|clausula|clausulas)\b/.test(t);
  const write = /\b(crie|criar|agende|agendar|registre|registrar|salve|salvar|pague|pagar|concilie|conciliar)\b/.test(t);
  return subject && question && !write;
}

function queryTerms(message = '') {
  const stop = new Set(['qual','quais','quanto','quando','valor','data','localizador','contrato','documento','documentos','nota','fiscal','recibo','comprovante','passagem','reserva','hospedagem','hotel','viagem','clausula','clausulas','obrigacao','obrigacoes','essa','esse','isso','meu','minha','do','da','de','dos','das','o','a','os','as','que','diz','sobre']);
  return normalize(message).split(/[^a-z0-9]+/).filter((x) => x.length >= 3 && !stop.has(x));
}

function moneyLabel(amount, currency) {
  if (amount == null || !Number.isFinite(Number(amount))) return null;
  const cur = String(currency || 'BRL').toUpperCase();
  try { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: cur }).format(Number(amount)); }
  catch (_) { return `${cur} ${Number(amount).toFixed(2)}`; }
}

export async function documentKnowledgeReply(supabase, userId, message) {
  const { data: docs, error: docsError } = await supabase.from('jarvis_document_processing')
    .select('id,jarvis_file_id,document_type,extracted_data,confidence,processed_at')
    .eq('user_id', userId).eq('processing_status', 'completed')
    .order('processed_at', { ascending: false }).limit(100);
  if (docsError) throw docsError;
  const fileIds = [...new Set((docs || []).map((d) => d.jarvis_file_id).filter(Boolean))];
  const { data: files, error: filesError } = fileIds.length
    ? await supabase.from('jarvis_files').select('id,name,web_view_link,project_id').eq('user_id', userId).in('id', fileIds)
    : { data: [], error: null };
  if (filesError) throw filesError;
  const fileMap = new Map((files || []).map((f) => [f.id, f]));
  const t = normalize(message);
  const terms = queryTerms(message);
  const typeHints = [];
  if (/\bcontrato\b/.test(t)) typeHints.push('contract');
  if (/\b(nota fiscal|nota|recibo|comprovante)\b/.test(t)) typeHints.push('financial_invoice','financial_receipt','financial_proof');
  if (/\b(passagem|localizador)\b/.test(t)) typeHints.push('travel_ticket','travel_reservation');
  if (/\b(hospedagem|hotel)\b/.test(t)) typeHints.push('travel_lodging','travel_reservation');
  if (/\bviagem\b/.test(t)) typeHints.push('travel_ticket','travel_reservation','travel_lodging','travel_other');
  const ranked = (docs || []).map((doc) => {
    const file = fileMap.get(doc.jarvis_file_id) || { name: 'Documento processado', web_view_link: null };
    const name = normalize(file.name);
    let score = 0;
    if (typeHints.includes(doc.document_type)) score += 20;
    for (const term of terms) if (name.includes(term)) score += 5;
    return { doc, file, score };
  }).filter((x) => !terms.length || terms.some((term) => normalize(x.file.name).includes(term)) || typeHints.includes(x.doc.document_type))
    .sort((a, b) => b.score - a.score || new Date(b.doc.processed_at || 0).getTime() - new Date(a.doc.processed_at || 0).getTime());

  if (!ranked.length) {
    return { reply: 'Ainda nao tenho uma leitura processada que corresponda a essa pergunta. Abra Arquivos e use “Ler documento” explicitamente no arquivo desejado. Nada sera processado automaticamente.', items: [], engine: 'jarvis-document-memory' };
  }
  const best = ranked[0];
  const data = best.doc.extracted_data || {};
  let answer = null;
  if (/\b(localizador|codigo.*reserva)\b/.test(t)) {
    const code = data.travel?.reservation_code;
    answer = code ? `O localizador/reserva e ${code}.` : 'O localizador nao foi identificado na leitura.';
  } else if (/\b(valor|quanto)\b/.test(t)) {
    const financial = moneyLabel(data.financial?.total_amount, data.financial?.currency);
    const travel = moneyLabel(data.travel?.amount, data.travel?.currency);
    const adminValue = Array.isArray(data.administrative?.relevant_values) ? data.administrative.relevant_values.find((v) => v?.amount != null) : null;
    const admin = adminValue ? moneyLabel(adminValue.amount, adminValue.currency) : null;
    answer = financial ? `O valor total identificado e ${financial}.` : travel ? `O valor identificado e ${travel}.` : admin ? `Um valor relevante identificado e ${admin}.` : 'Nao identifiquei um valor confiavel na leitura.';
  } else if (/\b(quando|data|vencimento)\b/.test(t)) {
    const travelStart = data.travel?.start_date;
    const travelEnd = data.travel?.end_date;
    const due = data.administrative?.due_date;
    const financialDate = data.financial?.date;
    answer = travelStart ? `A data inicial identificada e ${travelStart}${travelEnd ? `, com termino em ${travelEnd}` : ''}.` : due ? `O vencimento identificado e ${due}.` : financialDate ? `A data identificada e ${financialDate}.` : 'Nao identifiquei uma data confiavel na leitura.';
  } else if (/\b(partes)\b/.test(t)) {
    const parties = Array.isArray(data.administrative?.parties) ? data.administrative.parties : [];
    answer = parties.length ? `As partes identificadas sao: ${parties.join(', ')}.` : 'As partes nao foram identificadas com confianca.';
  } else if (/\b(obrigacao|obrigacoes|clausula|clausulas)\b/.test(t)) {
    const obligations = Array.isArray(data.administrative?.obligations) ? data.administrative.obligations : [];
    answer = obligations.length ? `Pontos principais: ${obligations.slice(0, 6).join(' · ')}.` : 'Nao identifiquei obrigacoes ou clausulas-chave estruturadas.';
  } else {
    answer = String(data.summary || 'A leitura foi concluida, mas nao ha resumo estruturado disponivel.');
  }
  const link = best.file.web_view_link ? `\nAbrir no Drive: ${best.file.web_view_link}` : '';
  return { reply: `${answer}\nFonte: ${best.file.name}.${link}`, items: [best.doc.jarvis_file_id], engine: 'jarvis-document-memory' };
}
