# Troubleshooting and recovery

## Picking up the project later

1. Read the changelog and validation history for known behavior/hardware limits.
2. Run `git status`, `npm ci --ignore-scripts`, `npm run check`, and `npm test`.
3. Use `npm run dev` to separate UI problems from TV-only issues.
4. Restore your private `.device/tv.json`, SSH key, and verified host-key file from your own backup; GitHub does not contain them.
5. Run `status` and `guard-status` before changing the TV. IPK and helper updates are separate.

## Recovery commands

| Command | Effect |
| --- | --- |
| `node scripts/tv-control.mjs guard-status` | Filter enabled/running state |
| `node scripts/tv-control.mjs guard-off` | Stops filter, releases input grab |
| `node scripts/tv-control.mjs disable` | Stops automatic Home, opens LG Home |
| `node scripts/tv-control.mjs enable` | Restarts automatic Home |
| `node scripts/tv-control.mjs guard-on` | Restarts protection |

Guard and Home are independent switches. The launcher also provides Guard On/Off and an explicit LG Home action.

## Common issues

**LG/Sofa Goblin flashing:** update both `home-manager.js` and `remote_guard.py`. Accepted Home must go directly to the existing manager, not through native LG Home. Logs should say `Requested Sofa Goblin directly`. Check one manager, one filter plus watchdog, fresh context, advertised `homeRouting`, and the current manager PID. Preserve the intentional LG Home bypass; do not restore the old launch-close-launch sequence.

**Black installed app:** keep CSP's explicit `file:` allowances for local scripts/styles/fonts/images. The original HTTP preview did not expose this packaged-app problem. Inspect actual TV console errors, decoded images, and packaged assets.

**Protection inactive:** check enabled/running state, app ID, input names, and context timestamp. Context older than six seconds intentionally passes buttons normally. Phone remotes/HDMI-CEC are not covered. The app must be in `APPS`.

**Stuck input / Guard Paused:** use `guard-off` through SSH, then inspect logs. The watchdog should release a stalled filter within four seconds. A held key during startup or unsupported capabilities can prevent startup; release keys and check calibration rather than weakening checks.

**Automatic Home paused:** three consecutive launch failures stop routing for that process. Correct the app/package issue and restart with `enable`. Closing LG's overlay may report `no app matched by pid`; current code treats that as nonfatal and still launches the app.

**SSH error:** verify the TV address against local configuration. A changed host key requires independent verification before updating the saved key. Do not disable strict verification. Credentials never belong in public issues.

**Developer-installed app disappeared:** check Developer Mode expiry on unrooted TVs. On the original rooted installation, do not reinstall Developer Mode as repair; check Homebrew startup/package state instead.

## TV logs

Read through your trusted SSH connection:

```text
/tmp/sofa-goblin.log
/tmp/sofa-goblin-errors.log
/tmp/sofa-goblin-guard.log
/tmp/sofa-goblin-guard-errors.log
/tmp/sofa-goblin-guard-context.json
```

Logs are bounded and temporary; collect relevant lines before rebooting. Report model/firmware, exact app/button sequence, expected/actual behavior, and short redacted excerpts. Never upload `.device/`, session storage, personal screenshots, or photo-bearing IPKs.

## Verification boundaries

`npm test` exercises Home/guard/config policies without contacting a TV. `tests/browser-check.js` is a Playwright function for deeper browser checks, historically run with a simulated bridge; it is not part of CI or proof of hardware compatibility. See [Validation](VALIDATION.md) for actual-device observations. Do not infer support for every LG model or future firmware.

## Build-tool dependency warnings

On October 25, 2026, `npm audit` reported six advisories in the locked webOS CLI development tree: one critical, four high, and one moderate. The registry's latest CLI was still 3.2.6. A compatible lockfile-only audit fix did not resolve them; the suggested forced fix would downgrade the CLI. The known-working CLI remains pinned, and this is an outstanding development-tool limitation, not a clean security audit.

These npm packages are not included in the TV runtime or the project's loopback-only preview server. Use the CLI with trusted local project inputs and do not expose its development/debugging servers publicly. Recheck upstream updates before future toolchain maintenance. The normal check/test/package CI does not enforce a passing npm audit.
