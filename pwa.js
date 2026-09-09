const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true
const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent)
let deferredInstallPrompt = null
let reloading = false

function showUpdate(registration) {
  if (document.getElementById('pwaUpdate')) return
  const host = document.getElementById('toastHost') || document.body
  const notice = document.createElement('div')
  notice.id = 'pwaUpdate'
  notice.className = 'toast pwa-update'
  notice.innerHTML = '<span>Uma atualização do Jarvis está pronta.</span><button type="button">Atualizar agora</button>'
  notice.querySelector('button').addEventListener('click', () => {
    registration.waiting?.postMessage({ type: 'SKIP_WAITING' })
  })
  host.appendChild(notice)
}

function installButton() {
  let button = document.getElementById('pwaInstall')
  if (button) return button
  const anchor = document.querySelector('.nav-technical')
  if (!anchor) return null
  button = document.createElement('button')
  button.id = 'pwaInstall'
  button.type = 'button'
  button.className = 'nav-button nav-technical pwa-install'
  button.innerHTML = '<span class="nav-icon">⇩</span><span>Instalar Jarvis</span>'
  anchor.insertAdjacentElement('beforebegin', button)
  return button
}

function configureInstallExperience() {
  if (isStandalone()) return
  const button = installButton()
  if (!button) return
  button.addEventListener('click', async () => {
    if (deferredInstallPrompt) {
      deferredInstallPrompt.prompt()
      await deferredInstallPrompt.userChoice
      deferredInstallPrompt = null
      button.remove()
      return
    }
    if (isIos) {
      window.alert('No Safari, toque em Compartilhar e depois em “Adicionar à Tela de Início”.')
      return
    }
    window.alert('Abra o menu do navegador e escolha “Instalar app” ou “Adicionar à tela inicial”.')
  })
}

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault()
  deferredInstallPrompt = event
  configureInstallExperience()
})

window.addEventListener('appinstalled', () => {
  document.getElementById('pwaInstall')?.remove()
})

window.addEventListener('load', async () => {
  configureInstallExperience()
  if (!('serviceWorker' in navigator) || !(location.protocol === 'https:' || location.hostname === 'localhost')) return
  try {
    const registration = await navigator.serviceWorker.register('./sw.js', { scope: './', updateViaCache: 'none' })
    if (registration.waiting && navigator.serviceWorker.controller) showUpdate(registration)
    registration.addEventListener('updatefound', () => {
      const worker = registration.installing
      worker?.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) showUpdate(registration)
      })
    })
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloading) return
      reloading = true
      location.reload()
    })
    window.setInterval(() => registration.update(), 60 * 60 * 1000)
  } catch (error) {
    console.warn('PWA_REGISTRATION', { ok: false, code: error?.name || 'registration_failed' })
  }
})
