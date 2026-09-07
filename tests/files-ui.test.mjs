import assert from 'node:assert/strict'
import { fileTypeCategory, fileSizeLabel, matchesFileFilters } from '../files-ui.js'

assert.equal(fileTypeCategory('application/pdf'), 'pdf')
assert.equal(fileTypeCategory('application/vnd.google-apps.spreadsheet'), 'spreadsheet')
assert.equal(fileTypeCategory('image/png'), 'image')
assert.equal(fileSizeLabel(1536), '1,5 KB')

const file = { name: 'Contrato Cliente.pdf', mime_type: 'application/pdf', project_id: 'p1' }
assert.equal(matchesFileFilters(file, { q: 'contrato', type: 'pdf', project: 'p1' }), true)
assert.equal(matchesFileFilters(file, { q: 'nota', type: 'pdf', project: 'p1' }), false)
assert.equal(matchesFileFilters(file, { q: '', type: 'document', project: 'p1' }), false)
assert.equal(matchesFileFilters(file, { q: '', type: 'pdf', project: 'p2' }), false)
console.log('files-ui tests passed')
