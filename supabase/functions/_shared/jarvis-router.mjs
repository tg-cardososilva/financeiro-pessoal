export function normalizeJarvisText(value = '') {
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
}

function has(text, pattern) {
  return pattern.test(text)
}

export function routeJarvisMessage(message) {
  const text = normalizeJarvisText(message)
  const domains = new Set()
  let action = null

  const research = has(text, /\b(pesquis|investigue|levante|fontes na web|na internet)\b/)
    || (has(text, /\bconcorrentes\b/) && !has(text, /\b(esses|estes|os) concorrentes\b/))
  const sheet = has(text, /\b(planilha|spreadsheet|tabela comparativa|compare em tabela|orcamento em tabela)\b/)
  const doc = has(text, /\b(relatorio|briefing|roteiro|ata|documento|planejamento escrito|resumo estruturado)\b/)
  const create = has(text, /\b(crie|criar|adicione|adicionar|anote|anota|guarde|registre|monte|faca|gere|salve|agende|marque)\b/)
  const savePrevious = has(text, /\b(salve|guarde|registre)\s+(isso|isto|esse conteudo|essa pesquisa|o resultado)\b/)

  if (research) domains.add('research')
  if (research && (doc || sheet || has(text, /\b(salve|crie|monte|faca|gere)\b/))) {
    action = sheet ? 'research_sheet' : 'research_doc'
  } else if (savePrevious) {
    action = sheet ? 'save_previous_sheet' : 'save_previous_doc'
  } else if (create && sheet) {
    action = 'create_sheet'
  } else if (create && doc) {
    action = 'create_doc'
  }

  if (has(text, /\b(gasto|gastei|gastos|despesa|despesas|receita|receitas|saldo|saldos|transacao|transacoes|categoria|categorias|orcamento|financeiro|financeira|investimento|investimentos|aporte|rendimento)\b/)) {
    domains.add('finance')
  }
  if (has(text, /\b(agenda|calendario|compromisso|compromissos|reuniao|reunioes|evento|eventos|amanha|horario)\b/)) {
    domains.add('agenda')
  }
  if (has(text, /\b(tarefa|tarefas|lembrete|lembre|pendencia|pendencias|afazer|afazeres)\b/)) {
    domains.add('tasks')
  }
  if (has(text, /\b(nota|notas|ideia|ideias|anotacao|anotacoes|referencia)\b/)) {
    domains.add('notes')
  }
  if (has(text, /\b(projeto|projetos)\b/)) {
    domains.add('projects')
    if (has(text, /\b(falta|faltam|pendencia|pendencias|parado|parados|andamento|status|salve|associe|vincule)\b/)) {
      domains.add('tasks')
      domains.add('notes')
      domains.add('files')
      domains.add('documents')
    }
  }
  if (has(text, /\b(arquivo|arquivos|drive|pasta|onde esta|onde fica)\b/)) domains.add('files')
  if (has(text, /\b(documento processado|documentos processados|ocr|contrato|nota fiscal|recibo|comprovante|vencimento)\b/)) {
    domains.add('documents')
    domains.add('files')
  }
  if (has(text, /\b(memoria|lembra de mim|preferencia|prefiro|costumo|decidi|regra pessoal|rotina)\b/)) domains.add('memories')
  if (has(text, /\b(o que preciso resolver|requer atencao|precisa de atencao|minhas prioridades|prioridades de hoje|resumo do dia)\b/)) {
    domains.add('attention')
  }

  if (!action && has(text, /\b(conclua|concluir|marque como concluida|marque como concluido|finalize)\b/) && domains.has('tasks')) action = 'task_complete'
  if (!action && has(text, /\b(reabra|reabrir|volte para aberta|volte para aberto)\b/) && domains.has('tasks')) action = 'task_reopen'
  if (!action && create && domains.has('tasks')) action = 'create_task'
  if (!action && create && domains.has('notes')) action = 'create_note'
  if (!action && create && domains.has('projects')) action = 'create_project'
  if (!action && create && domains.has('agenda')) action = 'calendar_create'
  if (!action && has(text, /\b(lembre que|guarde como memoria|memorize|minha preferencia e|minha regra e)\b/)) action = 'remember'
  if (!action && /\b(gastei|paguei|recebi)\b/.test(text) && /(?:r\$\s*)?\d/.test(text)) action = 'financial_annotation'

  if (!domains.size && has(text, /\b(hoje|agora|proximos dias)\b/)) domains.add('attention')
  const mode = action ? 'action' : research ? 'research' : domains.size ? 'query' : 'conversation'
  return {
    mode,
    action,
    domains: [...domains],
    explicit: Boolean(action && create) || ['task_complete','task_reopen','remember'].includes(action || ''),
    deliverable_type: action?.endsWith('sheet') ? 'sheet' : action?.endsWith('doc') ? 'doc' : null,
  }
}
