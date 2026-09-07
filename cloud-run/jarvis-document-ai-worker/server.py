import base64
import hashlib
import hmac
import json
import os
import time
import urllib.error
import urllib.request
import uuid
from http.server import BaseHTTPRequestHandler, HTTPServer

PROJECT_ID = os.environ.get('GOOGLE_CLOUD_PROJECT_ID', 'xenon-lyceum-507716-f3')
PROCESSOR_ID = os.environ.get('DOCUMENT_AI_PROCESSOR_ID', 'e5f4924d6e461967')
LOCATION = os.environ.get('DOCUMENT_AI_LOCATION', 'us')
WORKER_SECRET = os.environ.get('JARVIS_DOCUMENT_WORKER_SECRET', '')
MAX_BYTES = 20 * 1024 * 1024
TOKEN_URL = 'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token'
PROCESSOR_NAME = f'projects/{PROJECT_ID}/locations/{LOCATION}/processors/{PROCESSOR_ID}'
PROCESS_URL = f'https://{LOCATION}-documentai.googleapis.com/v1/{PROCESSOR_NAME}:process'


def send_json(handler, data, status=200):
    body = json.dumps(data, ensure_ascii=False).encode('utf-8')
    handler.send_response(status)
    handler.send_header('Content-Type', 'application/json; charset=utf-8')
    handler.send_header('Content-Length', str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


def google_access_token():
    req = urllib.request.Request(TOKEN_URL, headers={'Metadata-Flavor': 'Google'})
    with urllib.request.urlopen(req, timeout=10) as response:
        return json.load(response)['access_token']


def verify_request(headers, body):
    if not WORKER_SECRET:
        raise ValueError('worker_secret_missing')
    timestamp = headers.get('X-Jarvis-Timestamp', '')
    user_id = headers.get('X-Jarvis-User-Id', '')
    file_id = headers.get('X-Jarvis-File-Id', '')
    content_sha = headers.get('X-Jarvis-Content-Sha256', '')
    signature = headers.get('X-Jarvis-Signature', '')
    if not all([timestamp, user_id, file_id, content_sha, signature]):
        raise PermissionError('signed_headers_missing')
    try:
        ts = int(timestamp)
    except ValueError as exc:
        raise PermissionError('invalid_timestamp') from exc
    if abs(int(time.time()) - ts) > 300:
        raise PermissionError('request_expired')
    actual_sha = hashlib.sha256(body).hexdigest()
    if not hmac.compare_digest(actual_sha, content_sha):
        raise PermissionError('content_hash_mismatch')
    canonical = f'{timestamp}\n{user_id}\n{file_id}\n{content_sha}'.encode('utf-8')
    expected = hmac.new(WORKER_SECRET.encode('utf-8'), canonical, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, signature):
        raise PermissionError('invalid_signature')


def decode_filename(value):
    if not value:
        return 'documento'
    try:
        return base64.b64decode(value).decode('utf-8')[:200]
    except Exception:
        return 'documento'


def process_document(body, mime_type, display_name):
    token = google_access_token()
    payload = {
        'rawDocument': {
            'content': base64.b64encode(body).decode('ascii'),
            'mimeType': mime_type,
            'displayName': display_name,
        },
        'fieldMask': 'text,pages.pageNumber',
        'imagelessMode': True,
    }
    req = urllib.request.Request(
        PROCESS_URL,
        data=json.dumps(payload).encode('utf-8'),
        headers={
            'Authorization': f'Bearer {token}',
            'Content-Type': 'application/json',
        },
        method='POST',
    )
    with urllib.request.urlopen(req, timeout=120) as response:
        result = json.load(response)
    document = result.get('document') or {}
    return {
        'text': document.get('text') or '',
        'page_count': len(document.get('pages') or []),
    }


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        send_json(self, {'ok': True, 'service': 'jarvis-document-ai-worker', 'processor': PROCESSOR_NAME})

    def do_POST(self):
        request_id = str(uuid.uuid4())
        try:
            length = int(self.headers.get('Content-Length', '0') or 0)
            if length <= 0:
                return send_json(self, {'ok': False, 'code': 'empty_body', 'error': 'Documento vazio'}, 400)
            if length > MAX_BYTES:
                return send_json(self, {'ok': False, 'code': 'document_too_large', 'error': 'Documento maior que 20 MB'}, 413)
            mime_type = (self.headers.get('Content-Type') or '').split(';', 1)[0].strip().lower()
            if mime_type not in {'application/pdf', 'image/jpeg', 'image/png'}:
                return send_json(self, {'ok': False, 'code': 'unsupported_document_mime', 'error': 'MIME nao suportado'}, 415)
            body = self.rfile.read(length)
            verify_request(self.headers, body)
            display_name = decode_filename(self.headers.get('X-Jarvis-Filename-B64', ''))
            result = process_document(body, mime_type, display_name)
            return send_json(self, {
                'ok': True,
                'request_id': request_id,
                'processor': PROCESSOR_NAME,
                'page_count': result['page_count'],
                'text': result['text'],
                'binary_persisted': False,
            })
        except PermissionError as exc:
            return send_json(self, {'ok': False, 'code': str(exc), 'error': 'Requisicao nao autorizada'}, 401)
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode('utf-8', errors='replace')[:1500]
            return send_json(self, {'ok': False, 'code': 'document_ai_http_error', 'error': f'Document AI {exc.code}', 'detail': detail, 'request_id': request_id}, 502)
        except Exception as exc:
            return send_json(self, {'ok': False, 'code': 'document_ai_worker_error', 'error': str(exc), 'request_id': request_id}, 500)

    def log_message(self, fmt, *args):
        return


if __name__ == '__main__':
    HTTPServer(('0.0.0.0', int(os.environ.get('PORT', '8080'))), Handler).serve_forever()
