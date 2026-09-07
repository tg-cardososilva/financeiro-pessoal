import assert from 'node:assert/strict'
import { documentStatusLabel, documentTypeLabel, isProcessableMime, shortSummary, documentFieldRows, documentSuggestions } from '../document-intelligence-core.js'

assert.equal(documentStatusLabel('completed'), 'Lido')
assert.equal(documentTypeLabel('travel_ticket'), 'Passagem')
assert.equal(isProcessableMime('application/pdf'), true)
assert.equal(isProcessableMime('application/vnd.google-apps.document'), false)
const processing = {
  extracted_data: {
    summary: 'Reserva confirmada.',
    travel: { present: true, provider: 'Companhia X', origin: 'RIO', destination: 'SAO', start_date: '2026-10-01', end_date: null, reservation_code: 'ABC123', travelers: ['Thiago'], amount: 350, currency: 'BRL' },
    suggestions: [{ kind: 'calendar_event', reason: 'Viagem com data definida' }],
  },
}
assert.equal(shortSummary(processing), 'Reserva confirmada.')
const rows = documentFieldRows(processing)
assert(rows.some((x) => x.label === 'Localizador / reserva' && x.value === 'ABC123'))
assert(rows.some((x) => x.label === 'Valor' && x.value.includes('350.00')))
assert.equal(documentSuggestions(processing).length, 1)
console.log('document intelligence core tests ok')
