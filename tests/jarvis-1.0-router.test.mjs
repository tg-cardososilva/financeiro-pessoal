import test from 'node:test'
import assert from 'node:assert/strict'
import { routeJarvisMessage } from '../supabase/functions/_shared/jarvis-router.mjs'

const cases = [
  ['Quanto gastei este mês?', 'query', ['finance']],
  ['O que tenho amanhã?', 'query', ['agenda']],
  ['Quais tarefas estão vencidas?', 'query', ['tasks']],
  ['Mostre minhas notas sobre vídeo', 'query', ['notes']],
  ['Quais projetos estão parados?', 'query', ['projects']],
  ['Onde está meu contrato?', 'query', ['files','documents']],
  ['O que preciso resolver hoje?', 'query', ['attention']],
  ['Qual horário prefiro para reuniões?', 'query', ['agenda','memories']],
  ['Compare meus gastos deste mês com o mês passado.', 'query', ['finance']],
]

for (const [message, mode, domains] of cases) {
  test(`routes grounded question: ${message}`, () => {
    const route = routeJarvisMessage(message)
    assert.equal(route.mode, mode)
    for (const domain of domains) assert.ok(route.domains.includes(domain), `missing ${domain}`)
  })
}

const actions = [
  ['Crie uma tarefa para renovar o seguro.', 'create_task'],
  ['Guarde essa ideia para um vídeo.', 'create_note'],
  ['Crie um projeto para a viagem à Itália.', 'create_project'],
  ['Agende uma reunião amanhã às 14h.', 'calendar_create'],
  ['Pesquise concorrentes e crie um relatório.', 'research_doc'],
  ['Monte uma planilha comparando esses concorrentes.', 'create_sheet'],
  ['Salve isso no projeto Itália.', 'save_previous_doc'],
  ['Conclua a tarefa renovar o seguro.', 'task_complete'],
  ['Reabra a tarefa renovar o seguro.', 'task_reopen'],
  ['Lembre que prefiro reuniões de manhã.', 'remember'],
  ['Gastei R$ 25,00 no mercado.', 'financial_annotation'],
]

for (const [message, action] of actions) {
  test(`routes controlled action: ${message}`, () => {
    const route = routeJarvisMessage(message)
    assert.equal(route.mode, 'action')
    assert.equal(route.action, action)
  })
}

test('project status retrieval expands only to related canonical domains', () => {
  const route = routeJarvisMessage('O que falta no projeto Itália?')
  assert.deepEqual(new Set(route.domains), new Set(['projects','tasks','notes','files','documents']))
})
