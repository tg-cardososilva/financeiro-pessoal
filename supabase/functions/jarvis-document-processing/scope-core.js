export const DRIVE_FOLDER_MIME = 'application/vnd.google-apps.folder'

function scopeError(message, code, status = 409) {
  return Object.assign(new Error(message), { code, status })
}

export function driveRootConfig(connection) {
  const metadata = connection?.metadata || {}
  const id = String(metadata.drive_root_folder_id || '').trim()
  const mode = String(metadata.drive_scope_mode || '').trim()
  if (!id || mode !== 'root_folder_tree') {
    throw scopeError('Pasta raiz JARVIS nao configurada. Nenhum fallback para o Drive inteiro sera usado.', 'drive_root_not_configured')
  }
  return {
    id,
    name: String(metadata.drive_root_folder_name || 'JARVIS'),
    mode,
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
      throw scopeError('Nao foi possivel validar a arvore do arquivo dentro do limite seguro.', 'drive_scope_ancestor_limit')
    }
    const parent = await getMetadata(parentId)
    if (!parent || parent.trashed === true) continue
    for (const ancestorId of Array.isArray(parent.parents) ? parent.parents : []) {
      if (!visited.has(String(ancestorId))) queue.push(String(ancestorId))
    }
  }

  return false
}
