self.addEventListener('push', e => {
  const data = e.data ? e.data.json() : {};
  e.waitUntil(self.registration.showNotification(
    data.title || 'Pick a Bank 🏦',
    { body: data.body || '', icon: '/favicon.ico', badge: '/favicon.ico', tag: data.tag || 'pab' }
  ));
});

self.addEventListener('message', e => {
  if (e.data?.type === 'SHOW_NOTIFICATION') {
    self.registration.showNotification(
      e.data.title || 'Pick a Bank 🏦',
      { body: e.data.body || '', icon: '/favicon.ico', tag: e.data.tag || 'pab' }
    );
  }
});
