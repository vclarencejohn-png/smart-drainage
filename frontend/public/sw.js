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
self.addEventListener('push', event => {
  const data = event.data.json();
  
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/favicon.svg',
      tag: 'drainage-alert',
      requireInteraction: true,
      actions: [
        { action: 'open', title: 'Open App' },
        { action: 'dismiss', title: 'Dismiss' }
      ]
    })
  );
});

// Notification click event
self.addEventListener('notificationclick', event => {
  event.notification.close();
  if (event.action === 'open' || !event.action) {
    event.waitUntil(clients.openWindow('/'));
  }
});