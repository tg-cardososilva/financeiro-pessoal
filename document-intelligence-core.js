export const DOCUMENT_STATUS_LABELS = Object.freeze({
  pending: 'Aguardando',
  processing: 'Lendo',
  completed: 'Lido',
  failed: 'Falhou',
})

export const DOCUMENT_TYPE_LABELS = Object.freeze({
  unknown: 'Tipo não identificado',
  financial_invoice: 'Nota fiscal',
  financial_receipt: 'Recibo',
  financial_proof: 'Comprovante',
  contract: 'Contrato',
  administrative: 'Documento administrativo',
  travel_reservation: 'Reserva de viagem',
  travel_ticket: 'Passagem',
  travel_lodging: 'Hospedagem',
  travel_other: 'Documento de viagem',
})

export function documentStatusLabel(value = '') {
  return DOCUMENT_STATUS_LABELS[value] || value || 'Não processado'
}

export function documentTypeLabel(value = '') {
  return DOCUMENT_TYPE_LABELS[value] || value || 'Tipo não identificado'
}

export function isProcessableMime(mime = '') {
  return ['application/pdf', 'image/jpeg', 'image/png'].includes(String(mime).toLowerCase())
}

export function shortSummary(processing) {
  return String(processing?.extracted_data?.summary || '').trim()
}

export function documentFieldRows(processing) {
  const data = processing?.extracted_data || {}
  const rows = []
  const add = (label, value) => {
    if (value == null || value === '' || (Array.isArray(value) && !value.length)) return
    rows.push({ label, value: Array.isArray(value) ? value.join(', ') : String(value) })
  }
  if (data.financial?.present) {
    add('Estabelecimento', data.financial.merchant)
    add('Data', data.financial.date)
    if (data.financial.total_amount != null) add('Valor total', `${data.financial.currency || 'BRL'} ${Number(data.financial.total_amount).toFixed(2)}`)
    add('Forma de pagamento', data.financial.payment_method)
    if (Array.isArray(data.financial.items) && data.financial.items.length) add('Itens', data.financial.items.slice(0, 12).map((x) => x.description).filter(Boolean))
  }
  if (data.administrative?.present) {
    add('Título / assunto', data.administrative.title)
    add('Partes', data.administrative.parties)
    add('Vencimento', data.administrative.due_date)
    if (Array.isArray(data.administrative.relevant_dates) && data.administrative.relevant_dates.length) add('Datas relevantes', data.administrative.relevant_dates.map((x) => `${x.label}: ${x.date || 'não informada'}`))
    if (Array.isArray(data.administrative.relevant_values) && data.administrative.relevant_values.length) add('Valores relevantes', data.administrative.relevant_values.map((x) => `${x.label}: ${x.currency || 'BRL'} ${x.amount == null ? 'não informado' : Number(x.amount).toFixed(2)}`))
    if (Array.isArray(data.administrative.obligations) && data.administrative.obligations.length) add('Obrigações / cláusulas-chave', data.administrative.obligations.slice(0, 8))
  }
  if (data.travel?.present) {
    add('Companhia / hotel', data.travel.provider)
    add('Origem', data.travel.origin)
    add('Destino', data.travel.destination)
    add('Início', data.travel.start_date)
    add('Fim', data.travel.end_date)
    add('Localizador / reserva', data.travel.reservation_code)
    add('Passageiros / hóspedes', data.travel.travelers)
    if (data.travel.amount != null) add('Valor', `${data.travel.currency || 'BRL'} ${Number(data.travel.amount).toFixed(2)}`)
  }
  return rows
}

export function documentSuggestions(processing) {
  return Array.isArray(processing?.extracted_data?.suggestions) ? processing.extracted_data.suggestions : []
}
