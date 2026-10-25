import fs from 'node:fs/promises';
import path from 'node:path';
import {isIP} from 'node:net';

export function deviceConfig(value, root) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('TV config must be a JSON object.');
  const host = value.host;
  if (typeof host !== 'string' || !(isIP(host) || /^(?=.{1,253}$)[a-zA-Z0-9](?:[a-zA-Z0-9.-]*[a-zA-Z0-9])?$/.test(host))) {
    throw new Error('Set host to your TV IP address or hostname in .device/tv.json.');
  }
  const username = value.username ?? 'root';
  if (typeof username !== 'string' || !/^[a-zA-Z_][a-zA-Z0-9_-]*$/.test(username)) throw new Error('Invalid SSH username.');
  const port = value.port ?? 22;
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid SSH port.');
  function localPath(key, fallback) {
    const candidate = value[key] ?? fallback;
    if (typeof candidate !== 'string' || !candidate.trim() || /[\0\r\n]/.test(candidate)) throw new Error('Invalid ' + key + ' path.');
    return path.resolve(root, candidate);
  }
  return {host, username, port,
    privateKey: localPath('privateKey', '.device/tv_root'),
    knownHostsFile: localPath('knownHostsFile', '.device/root-known-hosts')};
}

export async function loadDeviceConfig(root) {
  let value;
  try { value = JSON.parse(await fs.readFile(path.join(root, '.device/tv.json'), 'utf8')); }
  catch (error) {
    if (error.code === 'ENOENT') throw new Error('Create .device/tv.json from tv-config.example.json and enter your TV connection details.');
    throw error;
  }
  const config = deviceConfig(value, root);
  await fs.access(config.privateKey);
  await fs.access(config.knownHostsFile);
  return config;
}

export function sshArguments(config) {
  // OpenSSH parses -o values itself: quote paths so spaces stay in one filename.
  const knownHosts = '"' + config.knownHostsFile.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
  return ['-T', '-p', String(config.port), '-i', config.privateKey,
    '-o', 'IdentitiesOnly=yes', '-o', 'BatchMode=yes', '-o', 'LogLevel=ERROR',
    '-o', 'ConnectTimeout=8', '-o', 'UserKnownHostsFile=' + knownHosts,
    '-o', 'StrictHostKeyChecking=yes', config.username + '@' + config.host];
}
