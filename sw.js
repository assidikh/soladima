// Changez VERSION à chaque mise à jour du code de l'application (v1 -> v2 -> v3...).
// Changez VERSION_IMAGES seulement si une photo du dossier images/ est modifiée ou remplacée.
const VERSION = 'v10';
const VERSION_IMAGES = 'i1';
const PREFIX = 'soladima-';
const CACHE = PREFIX + VERSION;                              // code de l'application
const CACHE_IMAGES = PREFIX + 'images-' + VERSION_IMAGES;   // photos : gardées d'une version à l'autre
const FILES = ['./', './index.html', './app.js', './schema.js', './calcul.js', './climat.js', './donnees.js', './manifest.webmanifest'];
const IMAGES = ['./icon-192.png', './icon-512.png',
  './images/cable_ac.jpg', './images/cable_alu.jpg', './images/cable_dc.jpg', './images/cable_pv.jpg', './images/coffret.jpg', './images/convertisseur.jpg', './images/convertisseur_modifie.jpg', './images/disj_ac.jpg', './images/fusible_dc.jpg', './images/fusible_pv.jpg', './images/gel.jpg', './images/hybride.jpg', './images/installation.jpg', './images/lithium.jpg', './images/mppt.jpg', './images/panneau.jpg', './images/parafoudre_pv.jpg', './images/pwm.jpg', './images/sect_pv.jpg', './images/support.jpg', './images/terre.jpg', './images/transport.jpg'];

self.addEventListener('install', e => {
  e.waitUntil(Promise.all([
    caches.open(CACHE).then(c => c.addAll(FILES)),
    // Photos : on ne télécharge que celles qui ne sont pas déjà en cache (rien n'est retéléchargé à chaque mise à jour)
    caches.open(CACHE_IMAGES).then(c => Promise.all(IMAGES.map(u => c.match(u).then(hit => hit || c.add(u).catch(() => {})))))
  ]).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  // On ne supprime que les anciens caches de CETTE application (d'autres applis peuvent partager le même domaine)
  const garder = [CACHE, CACHE_IMAGES];
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith(PREFIX) && !garder.includes(k)).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
const estImage = req => req.destination === 'image' || /\.(jpe?g|png|webp|gif|svg)$/i.test(new URL(req.url).pathname);
self.addEventListener('fetch', e => {
  if(e.request.method !== 'GET' || !e.request.url.startsWith(self.location.origin)) return;
  if(estImage(e.request)){
    // Photos : le cache d'abord (affichage immédiat, même sans internet) ; téléchargées une seule fois
    e.respondWith(caches.open(CACHE_IMAGES).then(c => c.match(e.request, { ignoreSearch: true }).then(hit => hit ||
      fetch(e.request).then(rep => { if(rep && rep.ok) c.put(e.request, rep.clone()); return rep; }))));
    return;
  }
  // Code : le réseau d'abord (dernière version dès qu'il y a internet ; le serveur répond « inchangé » sans
  // renvoyer le fichier quand il n'a pas bougé), la copie en cache sans internet.
  e.respondWith(
    fetch(e.request, { cache: 'no-cache' }).then(rep => {
      if(rep && rep.ok){ const copie = rep.clone(); caches.open(CACHE).then(c => c.put(e.request, copie)); }
      return rep;
    }).catch(() => caches.open(CACHE).then(c => c.match(e.request, { ignoreSearch: true }))
      .then(hit => hit || caches.open(CACHE).then(c => c.match('./index.html'))))
  );
});
