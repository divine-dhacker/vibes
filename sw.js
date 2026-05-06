// ═══════════════════════════════════════════════
//  GhostRoom — Service Worker (sw.js)
//  Place this file in the ROOT of your GitHub repo
//  (same folder as index.html)
// ═══════════════════════════════════════════════

importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyCEUDD0iB4iGFSDoC0a3wCXF8PT098Su3w",
  authDomain: "anonymous-messaging-f93c0.firebaseapp.com",
  projectId: "anonymous-messaging-f93c0",
  storageBucket: "anonymous-messaging-f93c0.firebasestorage.app",
  messagingSenderId: "990716606250",
  appId: "G-GBMJM3GM3B"
});

const messaging = firebase.messaging();

// ── Handle push when app is in the BACKGROUND or CLOSED ──
// (When app is open, the foreground handler in index.html takes over instead)
messaging.onBackgroundMessage(payload => {
  const title  = payload.notification?.title || '👻 GhostRoom';
  const body   = payload.notification?.body  || 'Something happened in your room';
  const roomId = payload.data?.roomId || '';

  self.registration.showNotification(title, {
    body,
    icon: 'https://raw.githubusercontent.com/divine-dhacker/vibes/main/ghostrooms.png',
    badge: 'https://raw.githubusercontent.com/divine-dhacker/vibes/main/ghostrooms.png',
    tag: 'ghostroom-' + roomId,  // groups notifications per room so they don't stack up
    renotify: true,
    vibrate: [200, 100, 200],
    data: { roomId }
  });
});

// ── When user TAPS the notification ──
// Opens the app and jumps straight into the correct room
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const roomId = e.notification.data?.roomId;
  const url = roomId
    ? 'https://ghoostroom.vercel.app/#' + roomId
    : 'https://ghoostroom.vercel.app/';

  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      // If app is already open in a tab, focus it and go to room
      for (const client of list) {
        if (client.url.includes('ghoostroom.vercel.app') && 'focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      // Otherwise open a fresh tab
      return clients.openWindow(url);
    })
  );
});
