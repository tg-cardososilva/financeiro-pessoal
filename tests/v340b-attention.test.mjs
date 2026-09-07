import assert from 'node:assert/strict'
import { buildAttentionItems } from '../attention-rules.js'

const now = new Date('2026-09-07T15:00:00-03:00')
const items = buildAttentionItems({
  tasks: [
    { id: 'open-due', title: 'Resolver hoje', status: 'open', due_at: '2026-09-07T16:00:00-03:00', priority: 'urgent' },
    { id: 'completed-due', title: 'Já concluída', status: 'completed', due_at: '2026-09-07T16:00:00-03:00', priority: 'urgent' }
  ],
  now,
  timezone: 'America/Sao_Paulo'
})

assert.equal(items.filter((item) => item.type === 'task').length, 1)
assert.equal(items.find((item) => item.type === 'task')?.sourceId, 'open-due')
assert.ok(['high','critical'].includes(items.find((item) => item.type === 'task')?.urgency))
console.log('v3.4.0b attention integration: ok')
