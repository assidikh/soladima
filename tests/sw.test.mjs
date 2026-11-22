// Tests du service worker (sw.js) avec un faux réseau et un faux cache. Lancer : node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const ORIGINE = 'https://exemple.test/soladima/';
function environnement(enLigne = true){
  const stores = new Map(), ecouteurs = {}, appels = [];
  const cle = r => new URL(typeof r === 'string' ? r : r.url, ORIGINE).href.split('?')[0];
  const cache = nom => {
    if(!stores.has(nom)) stores.set(nom, new Map());
    const m = stores.get(nom);
    return {
      match: async r => m.get(cle(r)),
      put: async (r, rep) => { m.set(cle(r), rep); },
      add: async r => { const rep = await sandbox.fetch(r); m.set(cle(r), rep); },
      addAll: async L => { for(const r of L) m.set(cle(r), await sandbox.fetch(r)); },
      keys: async () => [...m.keys()]
    };
  };
  const sandbox = {
    URL, Promise, console,
    self: { location: { origin: 'https://exemple.test' }, addEventListener: (t, f) => ecouteurs[t] = f, skipWaiting: () => {}, clients: { claim: () => {} } },
    caches: { open: async n => cache(n), keys: async () => [...stores.keys()], delete: async n => stores.delete(n) },
    fetch: async r => { const u = cle(r); appels.push(u); if(!enLigne) throw new Error('hors ligne'); return { ok: true, url: u, clone(){ return this; } }; }
  };
  vm.createContext(sandbox);
  vm.runInContext(readFileSync(new URL('../sw.js', import.meta.url), 'utf8'), sandbox);
  const evenement = async (type, extra = {}) => { let p, rep; await ecouteurs[type]({ ...extra, waitUntil: x => p = x, respondWith: x => rep = x }); await p; return rep; };
  const requete = (chemin, destination = '') => ({ method: 'GET', url: new URL(chemin, ORIGINE).href, destination });
  return { sandbox, stores, appels, evenement, requete, set enLigne(v){ enLigne = v; } };
}

test('installation : code et photos mis en cache, photos dans un cache séparé', async () => {
  const E = environnement();
  await E.evenement('install');
  const noms = [...E.stores.keys()];
  assert.equal(noms.length, 2);
  const photos = [...E.stores.get(noms.find(n => n.includes('images'))).keys()];
  assert.ok(photos.filter(u => u.includes('/images/')).length >= 22);
});

test('photos : servies depuis le cache, sans nouveau téléchargement', async () => {
  const E = environnement();
  await E.evenement('install');
  const avant = E.appels.length;
  const rep = await E.evenement('fetch', { request: E.requete('images/panneau.jpg', 'image') });
  assert.ok((await rep).url.endsWith('images/panneau.jpg'));
  assert.equal(E.appels.length, avant, 'la photo ne doit pas être retéléchargée');
});

test('photos : disponibles hors ligne', async () => {
  const E = environnement();
  await E.evenement('install');
  E.enLigne = false;
  const rep = await (await E.evenement('fetch', { request: E.requete('images/gel.jpg', 'image') }));
  assert.ok(rep && rep.url.endsWith('images/gel.jpg'));
});

test('code : réseau d\'abord avec internet, cache sans internet', async () => {
  const E = environnement();
  await E.evenement('install');
  const avant = E.appels.length;
  await (await E.evenement('fetch', { request: E.requete('app.js', 'script') }));
  assert.equal(E.appels.length, avant + 1, 'le code est redemandé au serveur');
  E.enLigne = false;
  const rep = await (await E.evenement('fetch', { request: E.requete('app.js', 'script') }));
  assert.ok(rep && rep.url.endsWith('app.js'));
});

test('mise à jour : le cache des photos est conservé, l\'ancien cache de code supprimé', async () => {
  const E = environnement();
  await E.evenement('install');
  const nomCode = [...E.stores.keys()].find(n => !n.includes('images'));
  E.stores.set('soladima-v1', new Map());                    // ancienne version
  E.stores.set('autre-appli-v1', new Map());                 // cache d'une autre application du même domaine
  await E.evenement('activate');
  const reste = [...E.stores.keys()];
  assert.ok(reste.includes(nomCode) && reste.some(n => n.includes('images')) && reste.includes('autre-appli-v1'));
  assert.ok(!reste.includes('soladima-v1'));
});
