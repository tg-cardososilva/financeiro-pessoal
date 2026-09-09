import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8')
const client = readFileSync(new URL('../jarvis-files-client.js', import.meta.url), 'utf8')
const service = readFileSync(new URL('../supabase/functions/jarvis-drive/index.ts', import.meta.url), 'utf8')
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8')

assert.equal(app.includes("supabase.from('jarvis_files')"), false)
assert.equal(client.includes("supabase.from('jarvis_files')"), false)
assert.match(client, /functions\.invoke\('jarvis-drive'/)

const loadStart = app.indexOf('async function loadFilesData')
const loadEnd = app.indexOf('function fileProjectName', loadStart)
assert.ok(loadStart >= 0 && loadEnd > loadStart)
const loader = app.slice(loadStart, loadEnd)
assert.equal(loader.includes('fileSync('), false)
assert.match(app, /async function syncFilesExplicit[\s\S]*fileSync\(supabase\)/)

assert.match(service, /grant_type: 'refresh_token'/)
assert.match(service, /pageToken/)
assert.match(service, /nextPageToken/)
assert.match(service, /select\('id,provider_file_id,project_id'\)/)
assert.match(service, /project_id: projectByProviderId\.get/)
assert.match(service, /\['sync', 'link', 'unlink', 'jarvis_query'\]/)
assert.match(service, /drive\.metadata\.readonly/)
assert.equal(service.includes('alt=media'), false)
assert.equal(service.includes('/upload/drive'), false)
assert.equal(service.includes('files.delete'), false)
assert.equal(service.includes('files.update'), false)
assert.equal(service.includes('files.create'), false)

assert.match(html, /data-view="files"/)
assert.match(html, /styles\.css\?v=1\.0\.0-rc\.1/)
assert.match(html, /app\.js\?v=1\.0\.0-rc\.1/)

const frontend = app + client + readFileSync(new URL('../files-ui.js', import.meta.url), 'utf8') + html
assert.equal(frontend.includes('GOOGLE_CLIENT_SECRET'), false)
assert.equal(frontend.includes('SUPABASE_SERVICE_ROLE_KEY'), false)
assert.equal(frontend.includes('refresh_token'), false)

console.log('v3.5.0 file-layer regression guardrails passed under v3.6.x')
