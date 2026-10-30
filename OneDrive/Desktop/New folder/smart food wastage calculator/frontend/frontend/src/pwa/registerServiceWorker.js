export function registerServiceWorker() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return

  let reloadAfterUpdate = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloadAfterUpdate) window.location.reload()
  })

  window.addEventListener('foodwise:apply-update', async () => {
    const registration = await navigator.serviceWorker.getRegistration()
    if (!registration?.waiting) return
    reloadAfterUpdate = true
    registration.waiting.postMessage({ type: 'SKIP_WAITING' })
  })

  navigator.serviceWorker.register('/sw.js')
    .then((registration) => {
      if (registration.waiting && navigator.serviceWorker.controller) {
        window.dispatchEvent(new Event('foodwise:update-ready'))
      }
      registration.addEventListener('updatefound', () => {
        const worker = registration.installing
        worker?.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) {
            window.dispatchEvent(new Event('foodwise:update-ready'))
          }
        })
      })
    })
    .catch((error) => console.error('FoodWise service worker registration failed', error))
}