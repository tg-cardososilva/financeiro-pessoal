export const DRIVE_FOLDER_MIME = 'application/vnd.google-apps.folder'
export const DRIVE_SHORTCUT_MIME = 'application/vnd.google-apps.shortcut'

function scopeError(message, code, status = 409) {
  return Object.assign(new Error(message), { code, status })
}

export function driveQueryEscape(value = '') {
  return String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

export function buildChildQuery(parentId) {
  const id = String(parentId || '').trim()
  if (!id) throw scopeError('Pasta pai do Drive ausente', 'drive_parent_missing')
  return `'${driveQueryEscape(id)}' in parents and trashed = false`
}

export function driveRootConfig(connection) {
  const metadata = connection?.metadata || {}
  const id = String(metadata.drive_root_folder_id || '').trim()
  const mode = String(metadata.drive_scope_mode || '').trim()
  if (!id || mode !== 'root_folder_tree') {
    throw scopeError('Pasta raiz JARVIS nao configurada. Nenhuma leitura ampla do Drive sera usada.', 'drive_root_not_configured')
  }
  return {
    id,
    name: String(metadata.drive_root_folder_name || 'JARVIS'),
    mode,
  }
}

export function isIndexableDriveItem(file) {
  if (!file?.id) return false
  if (file.trashed === true) return false
  if (String(file.mimeType || '') === DRIVE_SHORTCUT_MIME) return false
  return true
}

export async function walkDriveTree(rootId, listChildren, options = {}) {
  const maxPages = Number(options.maxPages || 2000)
  const maxFolders = Number(options.maxFolders || 10000)
  const queue = [{ id: String(rootId), depth: 0 }]
  const visitedFolders = new Set([String(rootId)])
  const seenItems = new Set()
  const entries = []
  let pages = 0

  while (queue.length) {
    const current = queue.shift()
    let pageToken = null
    do {
      const page = await listChildren(current.id, pageToken)
      pages += 1
      if (pages > maxPages) {
        throw scopeError('A arvore JARVIS excedeu o limite seguro de paginas para uma sincronizacao unica. Nenhum fallback para o Drive inteiro foi usado.', 'drive_scope_page_limit', 413)
      }
      for (const file of Array.isArray(page?.files) ? page.files : []) {
        if (!isIndexableDriveItem(file)) continue
        const fileId = String(file.id)
        if (!seenItems.has(fileId)) {
          seenItems.add(fileId)
          entries.push({ file, parent_id: current.id, depth: current.depth + 1 })
        }
        if (String(file.mimeType || '') === DRIVE_FOLDER_MIME && !visitedFolders.has(fileId)) {
          if (visitedFolders.size >= maxFolders) {
            throw scopeError('A arvore JARVIS excedeu o limite seguro de pastas para uma sincronizacao unica.', 'drive_scope_folder_limit', 413)
          }
          visitedFolders.add(fileId)
          queue.push({ id: fileId, depth: current.depth + 1 })
        }
      }
      pageToken = page?.next_page_token || null
    } while (pageToken)
  }

  return {
    entries,
    pages,
    folders_visited: visitedFolders.size,
  }
}

export async function isFileInsideRoot(file, rootId, getMetadata, options = {}) {
  const root = String(rootId || '').trim()
  if (!root || !file?.id || file.trashed === true) return false
  if (String(file.id) === root) return true

  const maxAncestors = Number(options.maxAncestors || 256)
  const queue = Array.isArray(file.parents) ? file.parents.map(String) : []
  const visited = new Set()
  let inspected = 0

  while (queue.length) {
    const parentId = String(queue.shift())
    if (!parentId || visited.has(parentId)) continue
    if (parentId === root) return true
    visited.add(parentId)
    inspected += 1
    if (inspected > maxAncestors) {
      throw scopeError('Nao foi possivel validar a arvore do arquivo dentro do limite seguro.', 'drive_scope_ancestor_limit', 409)
    }
    const parent = await getMetadata(parentId)
    if (!parent || parent.trashed === true) continue
    for (const ancestorId of Array.isArray(parent.parents) ? parent.parents : []) {
      if (!visited.has(String(ancestorId))) queue.push(String(ancestorId))
    }
  }

  return false
}
