const CACHE_NAME = 'smart-drainage-v1';

// Install event
self.addEventListener('install', event => {
  self.skipWaiting();
});

// Activate event
self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});

// Push notification event
self.addEventListener('push', function(event) {
  let data = {};

  try {
    // Try to parse as JSON first
    data = event.data.json();
  } catch (e) {
    // If not JSON, use as text
    data = {
      title: 'Smart Drainage Alert',
      body: event.data.text() || 'Alert received'
    };
  }

  const title = data.title || 'Smart Drainage Alert';
  const options = {
    body: data.body || 'New alert from Smart Drainage',
    icon: data.icon || '/favicon.svg',
    badge: data.badge || '/favicon.svg',
    tag: data.tag || 'drainage-alert',
    requireInteraction: true,
    vibrate: [200, 100, 200, 100, 200],
    renotify: true,
    actions: data.actions || [
      { action: 'open', title: 'Open App' },
      { action: 'dismiss', title: 'Dismiss' }
    ],
    data: {
      url: data.url || '/'
    }
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// Notification click event
self.addEventListener('notificationclick', function(event) {
  event.notification.close();

  if (event.action === 'dismiss') {
    return;
  }

  // Open the app when clicked
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      // If app is already open, focus it
      for (const client of clientList) {
        if (client.url.includes('smart-drainage') && 'focus' in client) {
          return client.focus();
        }
      }
      // Otherwise open new window
      if (clients.openWindow) {
        return clients.openWindow(event.notification.data?.url || '/');
      }
    })
  );
});

// Handle notification close
self.addEventListener('notificationclose', function(event) {
  console.log('Notification closed:', event);
});