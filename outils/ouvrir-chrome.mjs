// Ouvre SolaDima dans une fenêtre Chrome dédiée au test, et réutilise TOUJOURS le même onglet :
// au premier appel la fenêtre est lancée ; aux appels suivants l'onglet existant est rechargé et mis au premier plan.
// Usage : node outils/ouvrir-chrome.mjs [adresse]      (par défaut http://localhost:8080/)
// Le profil de cette fenêtre (données de test SolaDima) est gardé dans ~/.config/soladima-chrome.
import { spawn } from 'node:child_process';
import http from 'node:http';
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';

const PORT = 9223;                                     // port de pilotage de la fenêtre de test (local uniquement)
const ADRESSE = process.argv[2] || 'http://localhost:8080/';
const PROFIL = path.join(os.homedir(), '.config', 'soladima-chrome');
const pause = ms => new Promise(r => setTimeout(r, ms));
const onglets = async () => { try { return await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); } catch { return null; } };

// Envoi d'une commande au protocole de pilotage de Chrome (client WebSocket minimal, sans dépendance)
function commande(wsUrl, methode, params = {}){
  return new Promise((ok, ko) => {
    const u = new URL(wsUrl), cle = crypto.randomBytes(16).toString('base64');
    const req = http.request({ host: u.hostname, port: u.port, path: u.pathname,
      headers: { Connection: 'Upgrade', Upgrade: 'websocket', 'Sec-WebSocket-Key': cle, 'Sec-WebSocket-Version': '13' } });
    req.on('upgrade', (res, sock) => {
      const data = Buffer.from(JSON.stringify({ id: 1, method: methode, params }));
      const masque = crypto.randomBytes(4), entete = data.length < 126
        ? Buffer.from([0x81, 0x80 | data.length])
        : Buffer.from([0x81, 0x80 | 126, data.length >> 8, data.length & 255]);
      const corps = Buffer.from(data.map((b, i) => b ^ masque[i % 4]));
      sock.write(Buffer.concat([entete, masque, corps]));
      sock.once('data', () => { sock.end(); ok(); });
      setTimeout(() => { sock.destroy(); ok(); }, 1500);
    });
    req.on('error', ko); req.end();
  });
}

let liste = await onglets();
if(!liste){
  spawn('google-chrome', [`--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFIL}`, '--no-first-run', '--no-default-browser-check', '--new-window', ADRESSE],
        { detached: true, stdio: 'ignore' }).unref();
  for(let i = 0; i < 40 && !(liste = await onglets()); i++) await pause(250);
  console.log('Fenêtre de test ouverte :', ADRESSE);
  process.exit(0);
}
const pages = liste.filter(t => t.type === 'page');
const app = pages.find(t => t.url.startsWith(new URL(ADRESSE).origin)) || pages[0];
if(app){
  // Même onglet : on recharge (ou on navigue vers l'adresse demandée) puis on le met au premier plan
  if(app.url.split('#')[0] === ADRESSE.split('#')[0]) await commande(app.webSocketDebuggerUrl, 'Page.reload', { ignoreCache: true });
  else await commande(app.webSocketDebuggerUrl, 'Page.navigate', { url: ADRESSE });
  await fetch(`http://127.0.0.1:${PORT}/json/activate/${app.id}`);
  // Les autres onglets SolaDima éventuels de cette fenêtre sont fermés
  for(const t of pages) if(t.id !== app.id && t.url.startsWith(new URL(ADRESSE).origin)) await fetch(`http://127.0.0.1:${PORT}/json/close/${t.id}`);
  console.log('Onglet existant rechargé :', ADRESSE);
} else {
  await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURI(ADRESSE)}`, { method: 'PUT' });
  console.log('Onglet ouvert :', ADRESSE);
}
