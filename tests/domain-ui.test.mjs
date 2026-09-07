import assert from 'node:assert/strict'
import { filterTasks, filterNotes, filterProjects, collectNoteTags, dueBucket } from '../domain-ui.js'
import { domainList, domainCreate, domainUpdate, domainDelete, domainTransition } from '../jarvis-domain-client.js'

const now = new Date('2026-09-07T15:00:00-03:00')
const tasks = [
  { id:'1', title:'Enviar contrato', description:'Cliente Alfa', status:'open', priority:'urgent', due_at:'2026-09-07T16:00:00-03:00', project_id:'p1' },
  { id:'2', title:'Comprar papel', description:'escritório', status:'completed', priority:'low', due_at:null, project_id:null },
  { id:'3', title:'Revisar caixa', description:'financeiro', status:'open', priority:'normal', due_at:'2026-09-10T10:00:00-03:00', project_id:'p2' },
]
assert.deepEqual(filterTasks(tasks,{q:'contrato',status:'all',priority:'all',due:'all',project:'all'},now).map(x=>x.id),['1'])
assert.deepEqual(filterTasks(tasks,{q:'',status:'open',priority:'urgent',due:'today',project:'p1'},now).map(x=>x.id),['1'])
assert.equal(dueBucket(null,now),'no_due')

const notes = [
 {id:'n1',title:'Ideia vídeo',content:'margem e caixa',note_type:'idea',tags:['conteúdo','finanças'],project_id:'p1',updated_at:'2026-09-07T15:00:00Z'},
 {id:'n2',title:'Referência',content:'ISO',note_type:'reference',tags:['qualidade'],project_id:null,updated_at:'2026-09-06T15:00:00Z'}
]
assert.deepEqual(filterNotes(notes,{q:'caixa',type:'idea',tag:'finanças',project:'p1'}).map(x=>x.id),['n1'])
assert.deepEqual(collectNoteTags(notes),['conteúdo','finanças','qualidade'])

const projects = [
 {id:'p1',name:'Viagem',description:'Buenos Aires',status:'active',due_at:'2026-09-30T12:00:00Z'},
 {id:'p2',name:'Site',description:'novo site',status:'paused',due_at:null}
]
assert.deepEqual(filterProjects(projects,{q:'buenos',status:'active',due:'next30'},now).map(x=>x.id),['p1'])

const calls = []
const supabase = { functions: { invoke: async (name, {body}) => { calls.push({name,body}); return { data: body.action === 'list' ? {items:[]} : {item:{id:'x'}}, error:null } } } }
await domainList(supabase,'task')
await domainCreate(supabase,'task',{title:'x'})
await domainUpdate(supabase,'task','x',{title:'y'})
await domainTransition(supabase,'task','x','task_complete')
await domainDelete(supabase,'task','x')
assert.equal(calls[0].body.explicit, undefined)
for (const call of calls.slice(1)) assert.equal(call.body.explicit,true)
assert.ok(calls.every((call) => call.name === 'jarvis-domain'))
console.log('domain-ui tests: ok')
