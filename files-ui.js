export const FILE_TYPE_LABELS = {
  all: 'Todos os tipos',
  pdf: 'PDF',
  document: 'Documentos',
  spreadsheet: 'Planilhas',
  presentation: 'Apresentações',
  image: 'Imagens',
  folder: 'Pastas',
  other: 'Outros'
}

export function fileTypeCategory(fileOrMime = '') {
  const mime = typeof fileOrMime === 'string' ? fileOrMime : String(fileOrMime?.mime_type || '')
  if (mime === 'application/pdf') return 'pdf'
  if (mime === 'application/vnd.google-apps.folder') return 'folder'
  if (mime.startsWith('image/')) return 'image'
  if (mime === 'application/vnd.google-apps.spreadsheet' || mime.includes('spreadsheetml') || mime === 'text/csv') return 'spreadsheet'
  if (mime === 'application/vnd.google-apps.presentation' || mime.includes('presentationml')) return 'presentation'
  if (mime === 'application/vnd.google-apps.document' || mime.includes('wordprocessingml') || mime.startsWith('text/')) return 'document'
  return 'other'
}

export function fileTypeLabel(fileOrMime = '') {
  const category = fileTypeCategory(fileOrMime)
  return FILE_TYPE_LABELS[category] || 'Arquivo'
}

export function fileIcon(fileOrMime = '') {
  const category = fileTypeCategory(fileOrMime)
  return ({ pdf: 'PDF', document: 'DOC', spreadsheet: 'XLS', presentation: 'PPT', image: 'IMG', folder: 'DIR', other: 'FILE' })[category]
}

export function fileSizeLabel(value) {
  const bytes = Number(value)
  if (!Number.isFinite(bytes) || bytes < 0) return 'Tamanho não informado'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} KB`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`
  return `${(bytes / 1024 ** 3).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} GB`
}

export function matchesFileFilters(file, filters = {}) {
  const q = String(filters.q || '').trim().toLocaleLowerCase('pt-BR')
  if (q && !String(file?.name || '').toLocaleLowerCase('pt-BR').includes(q)) return false
  if (filters.type && filters.type !== 'all' && fileTypeCategory(file) !== filters.type) return false
  if (filters.project === 'none' && file?.project_id) return false
  if (filters.project && !['all', 'none'].includes(filters.project) && file?.project_id !== filters.project) return false
  return true
}
