/* Imported into the Workbox-generated service worker (vite.config.ts → workbox.importScripts).
 * Payload shape sent by backend/src/services/push.ts: { title, body, url }. */
self.addEventListener("push", (event) => {
  let data = { title: "Resin Art Assistant", body: "", url: "/escalations" };
  try {
    if (event.data) data = Object.assign(data, event.data.json());
  } catch (_err) {
    if (event.data) data.body = event.data.text();
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { url: data.url },
      tag: "escalation",
      renotify: true,
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/escalations";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          client.navigate(target).catch(() => undefined);
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});
