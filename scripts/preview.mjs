import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const base = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../app');
const photos = path.resolve(base, '../photos');
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.jpg':'image/jpeg', '.png':'image/png', '.svg':'image/svg+xml', '.ttf':'font/ttf' };
http.createServer(async (request, response) => {
  try {
    const name = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if (name === '/photos-config.js') {
      let files = [];
      try { files = JSON.parse(await readFile(path.join(photos, 'manifest.json'), 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
      if (!Array.isArray(files) || !files.every(file => /^photo-\d{2}\.jpg$/.test(file))) throw new Error('Invalid manifest');
      response.writeHead(200, {'Content-Type':'text/javascript','Cache-Control':'no-store'});
      response.end('window.HOME_PHOTOS = '+JSON.stringify(files.slice(0,24).map(file=>'photos/'+file))+';');
      return;
    }
    const isPhoto = name.startsWith('/photos/');
    const directory = isPhoto ? photos : base;
    const file = path.resolve(directory, '.' + (isPhoto ? name.slice(7) : (name === '/' ? '/index.html' : name)));
    if (!file.startsWith(directory + path.sep) || (isPhoto && !/^photo-\d{2}\.jpg$/.test(path.basename(file)))) { response.writeHead(403); response.end(); return; }
    const data = await readFile(file);
    response.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    response.end(data);
  } catch (error) { response.writeHead(404); response.end('Not found'); }
}).listen(4173, '127.0.0.1', () => console.log('Sofa Goblin preview: http://127.0.0.1:4173'));
