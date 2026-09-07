import assert from 'node:assert/strict'
import { fileList, fileSync, fileLinkProject, fileUnlinkProject, fileRemoteList, fileRemoteGet, fileJarvisQuery } from '../jarvis-files-client.js'

const calls = []
const supabase = { functions: { invoke: async (name, options) => {
  calls.push({ name, body: options.body })
  if (options.body.action === 'list') return { data: { items: [{ id: '1' }], count: 1, limit: 100, offset: 0 }, error: null }
  if (options.body.action === 'remote_list') return { data: { items: [], next_page_token: 'next' }, error: null }
  if (options.body.action === 'remote_get') return { data: { item: { provider_file_id: 'g1' } }, error: null }
  return { data: { ok: true, item: { id: '1' } }, error: null }
} } }

await fileList(supabase, { q: 'contrato' })
await fileRemoteList(supabase, { q: 'contrato', page_token: 'p1' })
await fileRemoteGet(supabase, 'g1')
await fileSync(supabase)
await fileLinkProject(supabase, '1', 'p1')
await fileUnlinkProject(supabase, '1')
await fileJarvisQuery(supabase, 'encontre o PDF com contrato')

for (const call of calls) assert.equal(call.name, 'jarvis-drive')
for (const call of calls.filter((c) => ['list','remote_list','remote_get'].includes(c.body.action))) assert.equal('explicit' in call.body, false)
for (const call of calls.filter((c) => ['sync','link','unlink','jarvis_query'].includes(c.body.action))) assert.equal(call.body.explicit, true)
assert.equal(calls.find((c) => c.body.action === 'remote_list').body.page_token, 'p1')
console.log('jarvis-files-client tests passed')
