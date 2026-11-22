// Serveur de développement local, sans dépendance (Node.js).
// Usage : node outils/serveur-dev.mjs [port]   → http://localhost:8080
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PORT = Number(process.argv[2]) || 8080;
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon'
};

createServer(async (req, res) => {
  let chemin = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (chemin.endsWith('/')) chemin += 'index.html';
  const fichier = normalize(join(RACINE, chemin));
  if (!fichier.startsWith(RACINE)) { res.writeHead(403).end(); return; }
  try {
    const contenu = await readFile(fichier);
    res.writeHead(200, {
      'Content-Type': TYPES[extname(fichier)] || 'application/octet-stream',
      'Cache-Control': 'no-store'
    });
    res.end(contenu);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Introuvable');
  }
}).listen(PORT, '127.0.0.1', () => console.log(`SolaDima → http://localhost:${PORT}`));
