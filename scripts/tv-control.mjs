import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {loadDeviceConfig, sshArguments} from './tv-config.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const config = await loadDeviceConfig(root);
const sshArgs = sshArguments(config);
function ssh(command, input = '') {
  return new Promise((resolve, reject) => {
    const child = spawn('ssh', [...sshArgs, command], {cwd: root, stdio: ['pipe', 'inherit', 'inherit']});
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve() : reject(new Error(`TV command exited ${code}`)));
    child.stdin.on('error', () => {});
    child.stdin.end(input);
  });
}
const stop = `if [ -f /tmp/sofa-goblin.pid ]; then p=$(cat /tmp/sofa-goblin.pid); case "$p" in ''|*[!0-9]*) exit 1;; esac; if grep -q '/var/lib/sofa-goblin/home-manager.js' /proc/$p/cmdline 2>/dev/null; then kill "$p"; fi; fi`;
const action = process.argv[2] || 'status';
if (action === 'install') {
  await ssh('mkdir -p /var/lib/sofa-goblin /var/lib/webosbrew/init.d; chmod 755 /var/lib/sofa-goblin');
  await ssh(stop);
  for (const file of ['luna.js', 'home-manager.js']) {
    await ssh(`cat > /var/lib/sofa-goblin/${file}.new && chmod 644 /var/lib/sofa-goblin/${file}.new && mv /var/lib/sofa-goblin/${file}.new /var/lib/sofa-goblin/${file}`, await fs.readFile(path.join(root, 'tv', file)));
  }
  await ssh('cat > /var/lib/webosbrew/init.d/50-sofa-goblin && chmod 755 /var/lib/webosbrew/init.d/50-sofa-goblin', await fs.readFile(path.join(root, 'tv/50-sofa-goblin')));
  await ssh('touch /var/lib/sofa-goblin/enabled; /var/lib/webosbrew/init.d/50-sofa-goblin');
} else if (action === 'guard-install') {
  await ssh('if [ -f /var/lib/sofa-goblin/guard-control.sh ]; then /bin/sh /var/lib/sofa-goblin/guard-control.sh off; elif [ -f /tmp/sofa-goblin-guard.pid ]; then p=$(cat /tmp/sofa-goblin-guard.pid); case "$p" in \'\'|*[!0-9]*) exit 1;; esac; if grep -q remote_guard.py /proc/$p/cmdline 2>/dev/null; then kill "$p"; sleep 1; fi; fi');
  for (const file of ['remote_guard.py', 'guard-control.sh']) {
    await ssh(`cat > /var/lib/sofa-goblin/${file}.new && chmod 644 /var/lib/sofa-goblin/${file}.new && mv /var/lib/sofa-goblin/${file}.new /var/lib/sofa-goblin/${file}`, await fs.readFile(path.join(root, 'tv', file)));
  }
  await ssh('cat > /var/lib/webosbrew/init.d/55-sofa-goblin-guard && chmod 755 /var/lib/webosbrew/init.d/55-sofa-goblin-guard', await fs.readFile(path.join(root, 'tv/55-sofa-goblin-guard')));
  await ssh('/bin/sh /var/lib/sofa-goblin/guard-control.sh on');
} else if (['guard-on', 'guard-off', 'guard-status'].includes(action)) {
  await ssh('/bin/sh /var/lib/sofa-goblin/guard-control.sh ' + action.slice(6));
} else if (action === 'disable') {
  await ssh('rm -f /var/lib/sofa-goblin/enabled; ' + stop);
  await ssh(`/usr/bin/node /var/lib/sofa-goblin/luna.js luna://com.webos.applicationManager/launch '{"id":"com.webos.app.home"}'`);
} else if (action === 'enable') {
  await ssh('touch /var/lib/sofa-goblin/enabled; /var/lib/webosbrew/init.d/50-sofa-goblin');
} else if (action === 'status') {
  await ssh(`if [ -f /var/lib/sofa-goblin/enabled ]; then echo 'Automatic Home: enabled'; else echo 'Automatic Home: disabled'; fi; if [ -f /tmp/sofa-goblin.pid ]; then p=$(cat /tmp/sofa-goblin.pid); ps -p "$p"; fi; tail -n 12 /tmp/sofa-goblin.log`);
} else throw new Error('Use install, status, disable, enable, guard-install, guard-on, guard-off, or guard-status.');
