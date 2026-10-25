import test from 'node:test';
import assert from 'node:assert/strict';
import {deviceConfig, loadDeviceConfig, sshArguments} from '../scripts/tv-config.mjs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test('device credentials are local, with strict host verification and safe path arguments', () => {
  const config = deviceConfig({host:'192.0.2.10'}, '/a folder/project');
  const args = sshArguments(config);
  assert.ok(args.includes('/a folder/project/.device/tv_root'));
  assert.ok(args.includes('UserKnownHostsFile="/a folder/project/.device/root-known-hosts"'));
  assert.ok(args.includes('StrictHostKeyChecking=yes'));
  assert.ok(args.includes('BatchMode=yes'));
  assert.equal(args.at(-1), 'root@192.0.2.10');
});
test('reject SSH option injection, invalid ports and multiline config paths', () => {
  for (const host of ['-oProxyCommand=anything', 'tv;command', 'root@tv', '', null]) {
    assert.throws(() => deviceConfig({host}, '/tmp'));
  }
  for (const patch of [{port:0},{port:65536},{port:'22'},{username:'root -oX'}, {knownHostsFile:'one\ntwo'}]) {
    assert.throws(() => deviceConfig({host:'192.0.2.10', ...patch}, '/tmp'));
  }
});
test('missing private configuration fails before attempting a TV connection', async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'sofa-goblin-config-'));
  try { await assert.rejects(loadDeviceConfig(temp), /Create .device\/tv.json/); }
  finally { await fs.rm(temp, {recursive:true, force:true}); }
});
