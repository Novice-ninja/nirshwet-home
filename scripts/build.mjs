import { cpSync, mkdirSync, rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
rmSync(dist, { recursive: true, force: true });
cpSync(path.join(root, 'app'), dist, { recursive: true });
const photoDir = path.join(root, 'photos');
if (existsSync(path.join(photoDir, 'manifest.json'))) {
  const files = JSON.parse(readFileSync(path.join(photoDir, 'manifest.json'), 'utf8'));
  if (!Array.isArray(files) || files.length > 24 || !files.every(file => /^photo-\d{2}\.jpg$/.test(file))) throw new Error('Invalid photo manifest');
  mkdirSync(path.join(dist, 'photos'), {recursive:true});
  for (const file of files) cpSync(path.join(photoDir, file), path.join(dist, 'photos', file));
  writeFileSync(path.join(dist, 'photos-config.js'), 'window.HOME_PHOTOS = ' + JSON.stringify(files.map(file => 'photos/' + file)) + ';\n');
}
mkdirSync(path.join(root, 'build'), { recursive: true });
// Generate a simple original house icon, without remote assets or build-time fonts.
function crc32(data) {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(name, data) {
  const type = Buffer.from(name), length = Buffer.alloc(4), crc = Buffer.alloc(4);
  length.writeUInt32BE(data.length); crc.writeUInt32BE(crc32(Buffer.concat([type, data])));
  return Buffer.concat([length, type, data, crc]);
}
function icon(size) {
  const raw = Buffer.alloc(size * (size * 3 + 1));
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size, v = y / size;
    const roof = Math.abs(v - (.22 + Math.abs(u - .5) * .85)) < .035 && u > .2 && u < .8;
    const walls = v > .47 && v < .78 && ((u > .25 && u < .31) || (u > .69 && u < .75));
    const floor = v > .72 && v < .78 && ((u > .25 && u < .43) || (u > .57 && u < .75));
    const door = v > .56 && v < .78 && ((u > .39 && u < .44) || (u > .56 && u < .61));
    const lintel = v > .56 && v < .61 && u > .39 && u < .61;
    const color = roof || walls || floor || door || lintel ? [41,78,59] : [171,198,180];
    const at = y * (size * 3 + 1) + 1 + x * 3;
    color.forEach((value, i) => raw[at + i] = value);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size); header.writeUInt32BE(size, 4); header[8] = 8; header[9] = 2;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);
}
writeFileSync(path.join(dist, 'icon.png'), icon(80));
writeFileSync(path.join(dist, 'largeIcon.png'), icon(130));
const metadata = JSON.parse(readFileSync(path.join(dist, 'appinfo.json')));
console.log(`Built ${metadata.title} ${metadata.version} for webOS 6 / Chromium 79.`);
