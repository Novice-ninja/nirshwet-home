import { mkdirSync, readdirSync, writeFileSync, rmSync, renameSync, mkdtempSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
if (!process.argv[2]) throw new Error('Usage: npm run photos:import -- "/path/to/selected photos"');
const source = realpathSync(process.argv[2]);
const destination = path.join(root, 'photos');
if (source === destination || source.startsWith(destination + path.sep)) throw new Error('Choose the original photo folder, not the generated photos folder.');
const names = readdirSync(source, { withFileTypes:true }).filter(file => file.isFile() && /\.(jpe?g|png|heic|heif)$/i.test(file.name)).map(file => file.name).sort();
if (!names.length) throw new Error('No JPEG, PNG, or HEIC photos found directly in that folder.');
if (names.length > 24) throw new Error('Please choose a folder with up to 24 photos. No files have been changed.');
mkdirSync(path.join(root, '.device'), {recursive:true,mode:0o700});
const temporary = mkdtempSync(path.join(root, '.device/photo-import-'));
try {
  // ImageIO applies phone orientation before resizing; source metadata is not copied.
  const helper = path.join(root, '.device/prepare-photos');
  const compilation = spawnSync('/usr/bin/clang', [path.join(root,'scripts/prepare-photos.c'), '-framework','ImageIO','-framework','CoreGraphics','-framework','CoreFoundation','-o',helper], {encoding:'utf8'});
  if (compilation.status !== 0) throw new Error('Photo tool build failed: ' + compilation.stderr);
  const result = spawnSync(helper, [temporary].concat(names.map(name => path.join(source, name))), {encoding:'utf8'});
  if (result.status !== 0) throw new Error('Photo conversion failed: ' + result.stderr);
  const manifest = names.map((name, index) => 'photo-' + String(index + 1).padStart(2, '0') + '.jpg');
  writeFileSync(path.join(temporary, 'manifest.json'), JSON.stringify(manifest, null, 2), {mode:0o600});
  rmSync(destination, {recursive:true,force:true});
  renameSync(temporary, destination);
  console.log(`Prepared ${manifest.length} local photos, bounded to 1920 × 1080. Originals unchanged.`);
} finally { rmSync(temporary, {recursive:true,force:true}); }
