// @ts-nocheck — This file uses Service Worker globals not present in the app tsconfig.
//             It is compiled separately by vite-plugin-pwa via workbox-build.

import { precacheAndRoute } from 'workbox-precaching'
import { registerRoute } from 'workbox-routing'
import { CacheFirst, NetworkFirst, NetworkOnly } from 'workbox-strategies'

precacheAndRoute(self.__WB_MANIFEST)

// Google Fonts — CacheFirst, long TTL
registerRoute(
  /^https:\/\/fonts\.googleapis\.com\/.*/i,
  new CacheFirst({
    cacheName: 'google-fonts-cache',
    plugins: [
      { cacheableResponse: { statuses: [0, 200] } },
      { expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 } },
    ],
  }),
)

// Supabase API — always go to network
registerRoute(/^.*supabase\.co\/.*/i, new NetworkOnly())

// Everything else — NetworkFirst fallback
registerRoute(
  /^https?:\/\/.*/i,
  new NetworkFirst({
    cacheName: 'external-cache',
    plugins: [
      { expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 } },
      { networkTimeoutSeconds: 5 },
    ],
  }),
)

// ── Push notification handlers

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data?.json() ?? {}
  } catch {
    const text = event.data?.text()
    if (text) data = { body: text }
  }

  const title = data.title || 'Lecture-to-Mastery'
  const options = {
    body: data.body || 'You have flashcards due for review!',
    icon: '/icons/icon-192.svg',
    badge: '/icons/icon-192.svg',
    tag: 'lecture-review',
    vibrate: [200, 100, 200],
    data: { url: data.url || '/review' },
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const targetUrl = (event.notification).data?.url || '/review'

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client && client.url.includes(self.location.origin)) {
          return client.navigate(targetUrl).then(() => {
            client.focus()
          })
        }
      }
      return clients.openWindow(targetUrl)
    }),
  )
})

export {}
