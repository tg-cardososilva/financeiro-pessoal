const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events';
const DRIVE_FOLDER_MIME = 'application/vnd.google-apps.folder';
export const GOOGLE_DOC_MIME = 'application/vnd.google-apps.document';
export const GOOGLE_SHEET_MIME = 'application/vnd.google-apps.spreadsheet';

function appError(code: string, message = code) {
  return Object.assign(new Error(code), { publicMessage: message });
}

function requiredGoogleConfig() {
  const clientId = Deno.env.get('GOOGLE_CLIENT_ID') || '';
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET') || '';
  if (!clientId || !clientSecret) throw appError('google_oauth_not_configured');
  return { clientId, clientSecret };
}

export async function googleConnection(admin: any, userId: string, provider: 'google_drive' | 'google_calendar') {
  const { data, error } = await admin.from('jarvis_connections')
    .select('id,user_id,provider,status,display_name,scopes,metadata,updated_at')
    .eq('user_id', userId).eq('provider', provider)
    .order('updated_at', { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  if (!data || data.status !== 'connected') {
    throw appError(provider === 'google_drive' ? 'google_drive_not_connected' : 'google_calendar_not_connected');
  }
  const requiredScope = provider === 'google_drive' ? DRIVE_FILE_SCOPE : CALENDAR_SCOPE;
  if (!Array.isArray(data.scopes) || !data.scopes.includes(requiredScope)) {
    throw appError(provider === 'google_drive' ? 'google_drive_scope_missing' : 'google_calendar_scope_missing');
  }
  return data;
}

export async function googleAccess(admin: any, userId: string, provider: 'google_drive' | 'google_calendar') {
  const connection = await googleConnection(admin, userId, provider);
  const { data: secret, error } = await admin.from('jarvis_connection_secrets')
    .select('access_token,refresh_token,token_type,expires_at,scope')
    .eq('connection_id', connection.id).eq('user_id', userId).maybeSingle();
  if (error || !secret) throw appError('google_credentials_missing');
  const expiresAt = secret.expires_at ? new Date(secret.expires_at).getTime() : 0;
  if (secret.access_token && expiresAt > Date.now() + 120000) {
    return { accessToken: String(secret.access_token), connection };
  }
  if (!secret.refresh_token) throw appError('google_refresh_token_missing');
  const { clientId, clientSecret } = requiredGoogleConfig();
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: String(secret.refresh_token),
      grant_type: 'refresh_token',
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.access_token) {
    await admin.from('jarvis_connections').update({ status: 'error' })
      .eq('id', connection.id).eq('user_id', userId);
    throw appError('google_token_refresh_failed');
  }
  const expiry = payload.expires_in
    ? new Date(Date.now() + Number(payload.expires_in) * 1000).toISOString()
    : null;
  const { error: updateError } = await admin.from('jarvis_connection_secrets').update({
    access_token: payload.access_token,
    token_type: payload.token_type || secret.token_type || 'Bearer',
    expires_at: expiry,
    scope: payload.scope || secret.scope || null,
    updated_at: new Date().toISOString(),
  }).eq('connection_id', connection.id).eq('user_id', userId);
  if (updateError) throw updateError;
  return { accessToken: String(payload.access_token), connection };
}

export function jarvisRoot(connection: any) {
  const id = String(connection?.metadata?.drive_root_folder_id || '').trim();
  const name = String(connection?.metadata?.drive_root_folder_name || 'JARVIS').trim();
  const mode = String(connection?.metadata?.drive_scope_mode || '');
  if (!id || mode !== 'root_folder_tree') throw appError('jarvis_root_missing');
  return { id, name };
}

async function googleJson(url: string, accessToken: string, init: RequestInit = {}) {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const code = response.status === 401 ? 'google_token_invalid'
      : response.status === 403 ? 'google_permission_denied' : 'google_api_failed';
    throw appError(code, payload?.error?.message || code);
  }
  return payload;
}

export async function validateJarvisRoot(accessToken: string, connection: any) {
  const root = jarvisRoot(connection);
  const fields = encodeURIComponent('id,name,mimeType,trashed,ownedByMe,driveId');
  const file = await googleJson(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(root.id)}?fields=${fields}&supportsAllDrives=false`,
    accessToken,
  );
  if (file.trashed || file.mimeType !== DRIVE_FOLDER_MIME || file.driveId || file.ownedByMe === false) {
    throw appError('jarvis_root_invalid');
  }
  return { ...root, remote: file };
}

export async function createDriveNativeFile(accessToken: string, rootId: string, title: string, mimeType: string) {
  return googleJson(
    'https://www.googleapis.com/drive/v3/files?fields=id,name,mimeType,parents,webViewLink,createdTime,modifiedTime&supportsAllDrives=false',
    accessToken,
    {
      method: 'POST',
      body: JSON.stringify({ name: title, mimeType, parents: [rootId] }),
    },
  );
}

export async function getDriveFile(accessToken: string, fileId: string) {
  const fields = encodeURIComponent('id,name,mimeType,parents,webViewLink,createdTime,modifiedTime,trashed,size');
  return googleJson(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=${fields}&supportsAllDrives=false`,
    accessToken,
  );
}

export async function writeGoogleDoc(accessToken: string, documentId: string, content: string, headings: Array<{ start: number; end: number; level: number }> = []) {
  const text = String(content || '').slice(0, 500000);
  const requests: any[] = [{ insertText: { location: { index: 1 }, text } }];
  for (const heading of headings.slice(0, 100)) {
    const namedStyleType = heading.level <= 1 ? 'HEADING_1' : heading.level === 2 ? 'HEADING_2' : 'HEADING_3';
    requests.push({
      updateParagraphStyle: {
        range: { startIndex: 1 + heading.start, endIndex: 1 + heading.end },
        paragraphStyle: { namedStyleType },
        fields: 'namedStyleType',
      },
    });
  }
  return googleJson(
    `https://docs.googleapis.com/v1/documents/${encodeURIComponent(documentId)}:batchUpdate`,
    accessToken,
    { method: 'POST', body: JSON.stringify({ requests }) },
  );
}

export async function googleDocIsEmpty(accessToken: string, documentId: string) {
  const document = await googleJson(
    `https://docs.googleapis.com/v1/documents/${encodeURIComponent(documentId)}?fields=${encodeURIComponent('body.content.endIndex')}`,
    accessToken,
  );
  const endIndex = Number(document?.body?.content?.at?.(-1)?.endIndex || 1);
  return endIndex <= 2;
}

export async function writeGoogleSheet(accessToken: string, spreadsheetId: string, rows: unknown[][]) {
  const spreadsheet = await googleJson(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}?fields=sheets.properties(title,sheetId)`,
    accessToken,
  );
  const title = String(spreadsheet?.sheets?.[0]?.properties?.title || 'Sheet1');
  const escaped = title.replace(/'/g, "''");
  const values = rows.slice(0, 1000).map((row) =>
    (Array.isArray(row) ? row : []).slice(0, 50).map((cell) =>
      typeof cell === 'number' || typeof cell === 'boolean' ? cell : String(cell ?? '').slice(0, 10000)
    )
  );
  await googleJson(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(`'${escaped}'!A1`)}?valueInputOption=USER_ENTERED`,
    accessToken,
    { method: 'PUT', body: JSON.stringify({ range: `'${title}'!A1`, majorDimension: 'ROWS', values }) },
  );
  if (values.length && values[0]?.length) {
    await googleJson(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}:batchUpdate`,
      accessToken,
      {
        method: 'POST',
        body: JSON.stringify({ requests: [{
          repeatCell: {
            range: { sheetId: spreadsheet.sheets[0].properties.sheetId, startRowIndex: 0, endRowIndex: 1 },
            cell: { userEnteredFormat: { textFormat: { bold: true }, backgroundColor: { red: 0.90, green: 0.93, blue: 0.90 } } },
            fields: 'userEnteredFormat(textFormat,backgroundColor)',
          },
        }, {
          autoResizeDimensions: {
            dimensions: { sheetId: spreadsheet.sheets[0].properties.sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: values[0].length },
          },
        }] }),
      },
    );
  }
}

export async function googleSheetIsEmpty(accessToken: string, spreadsheetId: string) {
  const spreadsheet = await googleJson(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}?fields=sheets.properties(title)`,
    accessToken,
  );
  const title = String(spreadsheet?.sheets?.[0]?.properties?.title || 'Sheet1');
  const escaped = title.replace(/'/g, "''");
  const values = await googleJson(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(`'${escaped}'!A1`)}`,
    accessToken,
  );
  return !Array.isArray(values?.values) || values.values.length === 0;
}

export async function listCalendarEvents(admin: any, userId: string, start: Date, end: Date) {
  const { accessToken } = await googleAccess(admin, userId, 'google_calendar');
  const params = new URLSearchParams({
    singleEvents: 'true', orderBy: 'startTime', showDeleted: 'false',
    timeZone: 'America/Sao_Paulo', timeMin: start.toISOString(), timeMax: end.toISOString(),
    maxResults: '100',
    fields: 'items(id,status,summary,description,location,htmlLink,start,end,eventType,recurringEventId)',
  });
  const payload = await googleJson(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params.toString()}`,
    accessToken,
  );
  return (Array.isArray(payload.items) ? payload.items : [])
    .filter((event: any) => event?.id && event?.status !== 'cancelled')
    .map((event: any) => ({
      id: event.id,
      title: event.summary || 'Sem titulo',
      start: event?.start?.dateTime || event?.start?.date || null,
      end: event?.end?.dateTime || event?.end?.date || null,
      all_day: Boolean(event?.start?.date && !event?.start?.dateTime),
      location: event.location || null,
      description: event.description || null,
      html_link: event.htmlLink || null,
      source: 'google_calendar',
    }));
}
