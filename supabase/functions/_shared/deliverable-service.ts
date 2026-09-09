import {
  GOOGLE_DOC_MIME, GOOGLE_SHEET_MIME, createDriveNativeFile, getDriveFile,
  googleAccess, googleDocIsEmpty, googleSheetIsEmpty, jarvisRoot, validateJarvisRoot,
  writeGoogleDoc, writeGoogleSheet,
} from './google.ts';

function cleanTitle(value: unknown) {
  const title = String(value || '').replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 180);
  if (!title) throw new Error('title_required');
  return title;
}

function cleanKey(value: unknown) {
  const key = String(value || '').trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$/.test(key)) throw new Error('idempotency_key_invalid');
  return key;
}

function normalizeSources(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 50).map((source: any) => ({
    title: String(source?.title || '').trim().slice(0, 300) || null,
    url: /^https:\/\//i.test(String(source?.url || '')) ? String(source.url).slice(0, 2000) : null,
  })).filter((source: any) => source.title || source.url);
}

async function assertProject(client: any, userId: string, projectId: unknown) {
  if (!projectId) return null;
  const { data, error } = await client.from('jarvis_projects').select('id')
    .eq('user_id', userId).eq('id', String(projectId)).maybeSingle();
  if (error || !data) throw new Error('project_not_found');
  return data.id;
}

function responseFor(request: any, replay = false) {
  return {
    ok: true,
    idempotent_replay: replay,
    deliverable: {
      id: request.id, type: request.deliverable_type, title: request.title,
      provider_file_id: request.provider_file_id, jarvis_file_id: request.jarvis_file_id,
      project_id: request.project_id, link: request.web_view_link,
      summary: request.summary, sources: request.sources || [],
    },
  };
}

export async function createDeliverableForUser({
  client, admin, userId, body,
}: { client: any; admin: any; userId: string; body: any }) {
  if (body?.explicit !== true) throw new Error('explicit_confirmation_required');
  const key = cleanKey(body.idempotency_key);
  const title = cleanTitle(body.title);
  const kind = body.type === 'sheet' || body.type === 'google_sheet' ? 'google_sheet'
    : body.type === 'doc' || body.type === 'google_doc' ? 'google_doc' : '';
  if (!kind) throw new Error('invalid_deliverable_type');
  const projectId = await assertProject(client, userId, body.project_id);
  const sources = normalizeSources(body.sources);
  const summary = String(body.summary || '').trim().slice(0, 8000) || null;

  const reservation = await client.rpc('reserve_jarvis_deliverable', {
    p_idempotency_key: key, p_deliverable_type: kind, p_title: title,
    p_project_id: projectId, p_summary: summary, p_sources: sources,
  });
  if (reservation.error) throw reservation.error;
  const request = reservation.data?.request;
  if (!request) throw new Error('deliverable_reservation_failed');
  if (request.deliverable_type !== kind) throw new Error('idempotency_key_conflict');
  if (request.status === 'completed') return responseFor(request, true);
  if (reservation.data?.claimed !== true) throw new Error('deliverable_in_progress');

  try {
    const { accessToken, connection } = await googleAccess(admin, userId, 'google_drive');
    const root = await validateJarvisRoot(accessToken, connection);
    const mimeType = kind === 'google_doc' ? GOOGLE_DOC_MIME : GOOGLE_SHEET_MIME;
    let remote: any;
    if (request.provider_file_id) {
      remote = await getDriveFile(accessToken, request.provider_file_id);
      if (remote.trashed || !Array.isArray(remote.parents) || !remote.parents.includes(root.id)) {
        throw new Error('deliverable_outside_jarvis_root');
      }
    } else {
      remote = await createDriveNativeFile(accessToken, root.id, title, mimeType);
      const saved = await client.from('jarvis_deliverable_requests').update({
        provider_file_id: remote.id, web_view_link: remote.webViewLink || null, error_code: null,
      }).eq('id', request.id).eq('user_id', userId);
      if (saved.error) throw saved.error;
    }
    if (kind === 'google_doc') {
      const content = String(body?.document?.content || body.content || '').trim();
      if (!content) throw new Error('document_content_required');
      if (await googleDocIsEmpty(accessToken, remote.id)) {
        await writeGoogleDoc(accessToken, remote.id, content, Array.isArray(body?.document?.headings) ? body.document.headings : []);
      }
    } else {
      const rows = Array.isArray(body?.sheet?.rows) ? body.sheet.rows : body.rows;
      if (!Array.isArray(rows) || !rows.length) throw new Error('sheet_rows_required');
      if (await googleSheetIsEmpty(accessToken, remote.id)) await writeGoogleSheet(accessToken, remote.id, rows);
    }
    remote = await getDriveFile(accessToken, remote.id);
    const fileRow = {
      user_id: userId, provider: 'google_drive', provider_file_id: remote.id,
      name: remote.name || title, mime_type: remote.mimeType || mimeType,
      web_view_link: remote.webViewLink || null,
      modified_at_provider: remote.modifiedTime || new Date().toISOString(),
      size_bytes: remote.size == null ? null : Number(remote.size), project_id: projectId,
      source: body.source === 'whatsapp' ? 'whatsapp' : 'jarvis_web',
      metadata: {
        drive_scope_mode: 'root_folder_tree', drive_root_folder_id: jarvisRoot(connection).id,
        drive_parent_id: root.id, drive_depth: 1, created_by: 'jarvis-deliverables',
        deliverable_request_id: request.id, sources,
      },
    };
    const fileResult = await client.from('jarvis_files').upsert(fileRow, {
      onConflict: 'user_id,provider,provider_file_id',
    }).select('*').single();
    if (fileResult.error) throw fileResult.error;
    const completedResult = await client.from('jarvis_deliverable_requests').update({
      status: 'completed', provider_file_id: remote.id, jarvis_file_id: fileResult.data.id,
      web_view_link: remote.webViewLink || null, summary, sources, error_code: null,
      lease_expires_at: null,
    }).eq('id', request.id).eq('user_id', userId)
      .eq('processing_token', request.processing_token).select('*').single();
    if (completedResult.error) throw completedResult.error;
    return responseFor(completedResult.data);
  } catch (error) {
    const code = error instanceof Error ? error.message : 'deliverable_creation_failed';
    await client.from('jarvis_deliverable_requests').update({
      status: 'failed', error_code: code.slice(0, 120), lease_expires_at: null,
    }).eq('id', request.id).eq('user_id', userId).eq('processing_token', request.processing_token);
    throw error;
  }
}
