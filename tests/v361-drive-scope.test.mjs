import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  DRIVE_FOLDER_MIME,
  buildChildQuery,
  driveRootConfig,
  isFileInsideRoot,
  walkDriveTree,
} from '../supabase/functions/jarvis-drive/scope-core.js'

const ROOT = 'root-jarvis'
const FOLDER_A = 'folder-a'
const FOLDER_B = 'folder-b'

assert.equal(buildChildQuery(ROOT), "'root-jarvis' in parents and trashed = false")
assert.equal(buildChildQuery(ROOT).includes('sharedWithMe'), false)
assert.deepEqual(driveRootConfig({ metadata: { drive_root_folder_id: ROOT, drive_root_folder_name: 'JARVIS', drive_scope_mode: 'root_folder_tree' } }), {
  id: ROOT,
  name: 'JARVIS',
  mode: 'root_folder_tree',
})
assert.throws(() => driveRootConfig({ metadata: {} }), /Pasta raiz JARVIS nao configurada/)

const treePages = new Map([
  [`${ROOT}:`, { files: [
    { id: 'direct-pdf', name: 'Direto.pdf', mimeType: 'application/pdf', parents: [ROOT] },
    { id: FOLDER_A, name: 'Subpasta', mimeType: DRIVE_FOLDER_MIME, parents: [ROOT] },
    { id: 'shortcut-out', name: 'Atalho externo', mimeType: 'application/vnd.google-apps.shortcut', parents: [ROOT] },
  ], next_page_token: 'page-2' }],
  [`${ROOT}:page-2`, { files: [
    { id: 'direct-jpg', name: 'Foto.jpg', mimeType: 'image/jpeg', parents: [ROOT] },
  ], next_page_token: null }],
  [`${FOLDER_A}:`, { files: [
    { id: 'nested-pdf', name: 'Contrato.pdf', mimeType: 'application/pdf', parents: [FOLDER_A] },
    { id: FOLDER_B, name: 'Nivel 2', mimeType: DRIVE_FOLDER_MIME, parents: [FOLDER_A] },
  ], next_page_token: null }],
  [`${FOLDER_B}:`, { files: [
    { id: 'deep-png', name: 'Reserva.png', mimeType: 'image/png', parents: [FOLDER_B] },
  ], next_page_token: null }],
])

async function listChildren(parentId, pageToken) {
  const key = `${parentId}:${pageToken || ''}`
  return treePages.get(key) || { files: [], next_page_token: null }
}

const first = await walkDriveTree(ROOT, listChildren)
const second = await walkDriveTree(ROOT, listChildren)
const ids = first.entries.map((entry) => entry.file.id)
assert.deepEqual(ids, ['direct-pdf', FOLDER_A, 'direct-jpg', 'nested-pdf', FOLDER_B, 'deep-png'])
assert.equal(ids.includes('shortcut-out'), false)
assert.equal(ids.includes('outside-file'), false)
assert.equal(ids.includes('shared-outside'), false)
assert.equal(first.pages, 4)
assert.equal(first.folders_visited, 3)
assert.deepEqual(second.entries.map((entry) => entry.file.id), ids)
assert.equal(new Set(ids).size, ids.length)
assert.equal(first.entries.find((entry) => entry.file.id === 'nested-pdf')?.depth, 2)
assert.equal(first.entries.find((entry) => entry.file.id === 'deep-png')?.depth, 3)

const metadata = new Map([
  [FOLDER_A, { id: FOLDER_A, mimeType: DRIVE_FOLDER_MIME, parents: [ROOT], trashed: false }],
  [FOLDER_B, { id: FOLDER_B, mimeType: DRIVE_FOLDER_MIME, parents: [FOLDER_A], trashed: false }],
  ['outside-parent', { id: 'outside-parent', mimeType: DRIVE_FOLDER_MIME, parents: ['my-drive-other'], trashed: false }],
  ['shared-parent', { id: 'shared-parent', mimeType: DRIVE_FOLDER_MIME, parents: ['shared-root'], trashed: false }],
  ['my-drive-other', { id: 'my-drive-other', mimeType: DRIVE_FOLDER_MIME, parents: [], trashed: false }],
  ['shared-root', { id: 'shared-root', mimeType: DRIVE_FOLDER_MIME, parents: [], trashed: false }],
])
const getMetadata = async (id) => metadata.get(id) || null
assert.equal(await isFileInsideRoot({ id: 'direct-pdf', parents: [ROOT], trashed: false }, ROOT, getMetadata), true)
assert.equal(await isFileInsideRoot({ id: 'nested-pdf', parents: [FOLDER_A], trashed: false }, ROOT, getMetadata), true)
assert.equal(await isFileInsideRoot({ id: 'deep-png', parents: [FOLDER_B], trashed: false }, ROOT, getMetadata), true)
assert.equal(await isFileInsideRoot({ id: 'outside-file', parents: ['outside-parent'], trashed: false }, ROOT, getMetadata), false)
assert.equal(await isFileInsideRoot({ id: 'shared-outside', parents: ['shared-parent'], trashed: false }, ROOT, getMetadata), false)

let inaccessibleCalls = 0
await assert.rejects(
  () => walkDriveTree(ROOT, async () => {
    inaccessibleCalls += 1
    throw new Error('root inaccessible')
  }),
  /root inaccessible/,
)
assert.equal(inaccessibleCalls, 1)

const driveService = readFileSync(new URL('../supabase/functions/jarvis-drive/index.ts', import.meta.url), 'utf8')
const processing = readFileSync(new URL('../supabase/functions/jarvis-document-processing/index.ts', import.meta.url), 'utf8')
const frontend = readFileSync(new URL('../document-intelligence.js', import.meta.url), 'utf8')
const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8')
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8')

assert.match(driveService, /buildChildQuery\(parentId\)/)
assert.match(driveService, /includeItemsFromAllDrives:\s*'false'/)
assert.doesNotMatch(driveService, /sharedWithMe/)
assert.match(driveService, /drive_root_inaccessible/)
assert.match(driveService, /Nenhum fallback|nenhum fallback/i)
assert.match(driveService, /onConflict:\s*'user_id,provider,provider_file_id'/)
assert.match(driveService, /staleIds/)
assert.match(driveService, /drive_root_folder_id/)
assert.match(processing, /drive_file_outside_root/)
assert.match(processing, /assertFileInsideRoot/)
assert.match(processing, /root_folder_id/)
assert.match(frontend, /setParent\(config\.root_folder_id\)/)
assert.match(frontend, /Fonte: Meu Drive \/ JARVIS/)
assert.match(frontend, /drive\.file/)
assert.doesNotMatch(frontend, /drive\.readonly/)
assert.match(html, /styles\.css\?v=3\.6\.1/)
assert.match(html, /app\.js\?v=3\.6\.1/)
assert.match(html, /document-intelligence\.js\?v=3\.6\.1/)

const loadStart = app.indexOf('async function loadFilesData')
const loadEnd = app.indexOf('function fileProjectName', loadStart)
assert.ok(loadStart >= 0 && loadEnd > loadStart)
assert.equal(app.slice(loadStart, loadEnd).includes('fileSync('), false)

console.log('v3.6.1 Drive scope tests ok')
