# Installation and updates

Build on a computer with Node.js 22+, npm, and Python 3:

```sh
npm ci --ignore-scripts
npm run check
npm test
npm run package
```

Output: `build/com.sofagoblin.home_0.1.6_all.ipk`. Imported photos are bundled; do not publish a personalized package.

## Ordinary TV: launcher only

Follow [LG Developer Mode instructions](https://webostv.developer.lge.com/develop/getting-started/developer-mode-app): install Developer Mode from LG Apps, sign in, enable Dev Mode Status, restart, then enable Key Server. Substitute your TV address for the documentation-only example:

```sh
npx ares-setup-device --add my-tv --info 'host=192.0.2.10' --info 'port=9922' --info 'username=prisoner'
npx ares-novacom --device my-tv --getkey
npx ares-device --device my-tv --system-info
npx ares-install --device my-tv build/com.sofagoblin.home_0.1.6_all.ipk
npx ares-launch --device my-tv com.sofagoblin.home
```

Enter the displayed key-server passphrase when prompted, not your LG password. Modify an existing device entry rather than duplicating it.

Developer Mode sessions expire; extend them before expiry. LG documents removal of developer-installed apps when Developer Mode is disabled. This mode provides the launcher/photos, not system-wide Home routing or protection inside other apps.

## Already-rooted TV: optional helpers

This project does not root a TV. Model/firmware compatibility must be assessed separately through [webOS Homebrew](https://www.webosbrew.org/rooting/). The following assumes root SSH and persistent Homebrew startup already work.

Original environment: Homebrew Channel 0.7.3, Node 8.12, Python 2.7, `flock`, `luna-send`, writable `/var/lib/webosbrew/init.d`. On the original rooted installation, Developer Mode was removed because session management conflicts with persistent homebrew; do not reinstall it as a maintenance step.

1. Install the IPK with an existing root-compatible installer such as [webOS Dev Manager](https://github.com/webosbrew/dev-manager-desktop). Verify actual TV rendering before enabling helpers.
2. Create local configuration:

   ```sh
   mkdir -p .device
   cp tv-config.example.json .device/tv.json
   ```

   Edit the host, port, username, private-key path, and known-hosts path. Paths may be absolute or relative to the repository. Put your existing SSH private key and independently verified host key at those paths. The maintenance tool never disables host verification or automatically accepts a new key.
3. Confirm the intended TV and install the manager:

   ```sh
   node scripts/tv-control.mjs install
   node scripts/tv-control.mjs status
   ```

4. Before guard installation on another TV, calibrate its input names and supported key codes, keeping independent SSH recovery access. The code targets `LGE RCU` → `IoT keypad`. Physical Source/Input (241) and alternative remote paths are not all individually verified. Do not assume another model shares these mappings.
5. On calibrated hardware:

   ```sh
   npm run test:guard
   node scripts/tv-control.mjs guard-install
   node scripts/tv-control.mjs guard-status
   ```

   Test arrows, OK, volume, Back, Home, and Exit physically. In a streaming app, first protected press stays; second released press performs the action. The original remote's square with outward arrow is **Exit**, not Input; native Exit can leave an app for Home.
6. Test power off/on and use without the computer. **LG Home → Open LG Home** remains an intentional escape route.

## Existing installations under another name

Sofa Goblin uses `com.sofagoblin.home` and `/var/lib/sofa-goblin`. A differently named installation is not automatically migrated. Do not run two Home managers or physical input filters together; stop the previous helpers and plan package IDs, hooks, paths, and preference migration before replacing an existing setup.

## Updating later

Review local changes and the changelog. Back up ignored `.device/` and `photos/` separately.

```sh
git status
git pull --ff-only
npm ci --ignore-scripts
npm run check
npm test
npm run package
```

- UI/photos: reinstall the new IPK with the same package ID.
- Home manager: `node scripts/tv-control.mjs install`.
- Guard: `node scripts/tv-control.mjs guard-install`. Install changed manager code first if both sides of their protocol change.
- Connection changes belong in `.device/tv.json`; no address for another person's TV is embedded in source.

Changing package ID requires coordinated helper changes. Firmware changes can affect root/compatibility and are not validated here.

## Recovery

```sh
node scripts/tv-control.mjs guard-off
node scripts/tv-control.mjs disable
```

These independently release the filter and restore ordinary Home behavior. Restore with `enable` and `guard-on`. See [Troubleshooting](TROUBLESHOOTING.md).
