const CACHE_VERSION = 'jarvis-shell-1.0.0-rc.3'
const SHELL = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './attention-rules.js',
  './domain-ui.js',
  './jarvis-domain-client.js',
  './jarvis-files-client.js',
  './files-ui.js',
  './document-intelligence.js',
  './document-intelligence-core.js',
  './document-intelligence.css',
  './jarvis-avatar.png',
  './manifest.webmanifest',
  './icons/jarvis-192.png',
  './icons/jarvis-512.png',
  './icons/jarvis-maskable-512.png',
  './supabase/functions/_shared/attention-core.js',
]

const SAFE_PATHS = new Set(SHELL.map((entry) => new URL(entry, self.registration.scope).pathname))
const SENSITIVE_QUERY_KEYS = new Set(['code','token','access_token','refresh_token','error_description'])

function isSensitiveUrl(url) {
  for (const key of SENSITIVE_QUERY_KEYS) if (url.searchParams.has(key)) return true
  return false
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) =>
      Promise.all(SHELL.map((asset) =>
        fetch(new Request(asset, { cache: 'reload' })).then((response) => {
          if (!response.ok) throw new Error(`shell_asset_failed:${asset}`)
          return cache.put(asset, response)
        })
      ))
    )
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith('jarvis-shell-') && key !== CACHE_VERSION).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting()
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  if (request.headers.has('authorization') || request.headers.has('apikey') || isSensitiveUrl(url)) return

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('./index.html'))
    )
    return
  }

  if (!SAFE_PATHS.has(url.pathname)) return
  event.respondWith(
    caches.match(request, { ignoreSearch: true }).then((cached) =>
      cached || fetch(request).then((response) => {
        if (response.ok && response.type === 'basic') {
          const copy = response.clone()
          caches.open(CACHE_VERSION).then((cache) => cache.put(url.pathname, copy))
        }
        return response
      })
    )
  )
})
