// Changez ce numéro à chaque mise à jour de l'application (v1 -> v2 -> v3...)
const VERSION = 'v8';
const PREFIX = 'soladima-';
const CACHE = PREFIX + VERSION;
const FILES = ['./', './index.html', './app.js', './schema.js', './calcul.js', './climat.js', './donnees.js', './manifest.webmanifest', './icon-192.png', './icon-512.png',
  './images/cable_ac.jpg', './images/cable_alu.jpg', './images/cable_dc.jpg', './images/cable_pv.jpg', './images/coffret.jpg', './images/convertisseur.jpg', './images/convertisseur_modifie.jpg', './images/disj_ac.jpg', './images/fusible_dc.jpg', './images/fusible_pv.jpg', './images/gel.jpg', './images/hybride.jpg', './images/installation.jpg', './images/lithium.jpg', './images/mppt.jpg', './images/panneau.jpg', './images/parafoudre_pv.jpg', './images/pwm.jpg', './images/sect_pv.jpg', './images/support.jpg', './images/terre.jpg', './images/transport.jpg'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => {
  // On ne supprime que les anciens caches de CETTE application (d'autres applis peuvent partager le même domaine)
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith(PREFIX) && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// Réseau d'abord : avec internet, l'utilisateur a toujours la dernière version (et le cache est rafraîchi) ;
// sans internet, la copie en cache prend le relais.
self.addEventListener('fetch', e => {
  if(e.request.method !== 'GET' || !e.request.url.startsWith(self.location.origin)) return;
  e.respondWith(
    fetch(e.request, { cache: 'no-store' }).then(rep => {
      if(rep && rep.ok){ const copie = rep.clone(); caches.open(CACHE).then(c => c.put(e.request, copie)); }
      return rep;
    }).catch(() => caches.open(CACHE).then(c => c.match(e.request, { ignoreSearch: true }))
      .then(hit => hit || caches.open(CACHE).then(c => c.match('./index.html'))))
  );
});
