import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync, statSync } from 'node:fs'

const manifest = JSON.parse(readFileSync(new URL('../manifest.webmanifest', import.meta.url), 'utf8'))
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8')
const sw = readFileSync(new URL('../sw.js', import.meta.url), 'utf8')
const pwa = readFileSync(new URL('../pwa.js', import.meta.url), 'utf8')
const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8')
const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8')

test('manifest is installable and uses standalone mode', () => {
  assert.equal(manifest.display, 'standalone')
  assert.equal(manifest.name.includes('Jarvis'), true)
  assert.equal(manifest.theme_color, '#102535')
  assert.equal(manifest.background_color, '#f3f4f1')
  assert.ok(manifest.icons.some((icon) => icon.sizes === '192x192'))
  assert.ok(manifest.icons.some((icon) => icon.sizes === '512x512'))
  assert.ok(manifest.icons.some((icon) => icon.purpose === 'maskable'))
  for (const icon of manifest.icons) assert.ok(statSync(new URL(`..${icon.src.slice(1)}`, import.meta.url)).size > 1000)
})

test('iPhone metadata, safe areas and mobile layouts are present', () => {
  assert.match(html, /apple-mobile-web-app-capable/)
  assert.match(html, /viewport-fit=cover/)
  assert.match(html, /apple-touch-icon/)
  assert.match(css, /safe-area-inset-top/)
  assert.match(css, /safe-area-inset-bottom/)
  assert.match(css, /100dvh/)
  assert.match(css, /@media\(max-width:620px\)/)
})

test('service worker caches only explicit same-origin shell assets', () => {
  assert.equal(existsSync(new URL('../.nojekyll', import.meta.url)), true)
  assert.match(sw, /const SHELL = \[/)
  assert.match(sw, /\.\/supabase\/functions\/_shared\/attention-core\.js/)
  assert.match(sw, /url\.origin !== self\.location\.origin/)
  assert.match(sw, /request\.headers\.has\('authorization'\)/)
  assert.match(sw, /request\.headers\.has\('apikey'\)/)
  assert.match(sw, /SENSITIVE_QUERY_KEYS/)
  assert.doesNotMatch(sw, /supabase\.co/)
  assert.doesNotMatch(sw, /api\.openai\.com/)
  assert.doesNotMatch(sw, /googleapis\.com/)
})

test('PWA update flow cannot pin users to an old cache', () => {
  assert.match(sw, /CACHE_VERSION/)
  assert.match(sw, /caches\.delete/)
  assert.match(sw, /SKIP_WAITING/)
  assert.match(pwa, /updateViaCache: 'none'/)
  assert.match(pwa, /controllerchange/)
  assert.match(pwa, /registration\.update/)
})

test('the frontend uses one canonical Jarvis endpoint', () => {
  assert.match(app, /functions\.invoke\('jarvis-core'/)
  assert.doesNotMatch(app, /function shouldUseFileRead/)
  assert.doesNotMatch(app, /function shouldUseCalendarRead/)
})
