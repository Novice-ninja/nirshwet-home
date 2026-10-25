# Sofa Goblin

A calm, personal home screen for LG webOS TVs. Five streaming apps, a soft pastel palette, an optional local photo carousel, and large, readable type. Everything runs on the TV after installation; no computer or server needs to stay on.

A tiny goblin for your big screen. Fork it and make it your own.

## Features

- YouTube, Netflix, Prime Video, Disney+, and Tubi, using the installed TV apps.
- D-pad and pointer navigation, clear focus rings, and saved app order.
- Optional local photos, with a gentle fade and timers that stop while hidden.
- **Soft Morning**: sage, dusty rose, lavender, cream, forest-green accents, and bundled Nunito Sans.
- On the tested rooted TV: automatic startup/wake and direct Home-button routing.
- On the tested rooted TV: two released presses within two seconds for Back, Home, Exit, Input, and supported shortcuts inside streaming apps. Arrows and playback controls work normally.

No ads, telemetry, streaming-account access, remote fonts, or runtime server. Continue Watching stays inside each streaming app; this project does not aggregate watch history or provide show-level resume links.

## Compatibility

Tested on **LG 50UP7670PUC · webOS 6.5.3 · firmware 03.53.45**. The web app targets Chromium 79. Optional TV helpers target Node 8.12 and Python 2.7, the runtimes on the tested TV.

| Feature | Developer Mode | Tested rooted/Homebrew TV |
| --- | --- | --- |
| Launcher, app order, theme, photos | Yes; app IDs may vary | Yes |
| Automatic Home/startup replacement | No | Yes |
| Protection inside streaming apps | No | Yes, calibrated input path |
| Developer Mode renewal | Required | Not used |

Root helpers are hardware-specific, not a universal remote remapper or rooting tool. Read [Installation](docs/INSTALLATION.md) before using them on another TV.

## Quick start

Requires **Node.js 22+**, npm, and Python 3 for tests. Photo import additionally needs macOS and Apple's command-line developer tools; normal launcher operation does not need macOS.

```sh
git clone https://github.com/Novice-ninja/sofa-goblin.git
cd sofa-goblin
npm ci --ignore-scripts
npm run check
npm test
npm run dev
```

Open **http://127.0.0.1:4173**. Browser tiles show a preview message instead of launching TV apps. A fresh clone contains no personal photos.

```sh
npm run package
```

The pinned webOS build tool has [documented dependency advisories](docs/TROUBLESHOOTING.md#build-tool-dependency-warnings).

Output: `build/com.sofagoblin.home_0.1.6_all.ipk`. Follow [Installation](docs/INSTALLATION.md) to install it. Packages built after importing photos contain those photos; keep personalized IPKs private.

## Documentation

- [Installation and updates](docs/INSTALLATION.md)
- [Architecture and event flow](docs/ARCHITECTURE.md)
- [Customization](docs/CUSTOMIZATION.md)
- [Troubleshooting and recovery](docs/TROUBLESHOOTING.md)
- [Validation history](docs/VALIDATION.md)
- [Contributing](CONTRIBUTING.md)
- [Changelog](CHANGELOG.md)

## Repository layout

```text
app/                    Packaged web app, font, and service logos
tv/                     Optional Home manager and physical remote filter
scripts/                Preview, build, photo import, SSH maintenance
tests/                  Policy/config regression tests and browser checks
docs/                   Setup, architecture, customization, recovery
tv-config.example.json  Example connection settings, never credentials
```

Local `.device/`, `photos/`, `output/`, `dist/`, and `build/` are ignored. No TV credentials, personal photos, account sessions, or private TV address are published. Your own connection settings go in `.device/tv.json`.

## License and credits

Original code/documentation: [MIT](LICENSE). Nunito Sans: [SIL Open Font License](app/fonts/OFL.txt). Service artwork and trademarks remain their owners' property and are excluded from MIT; see [third-party notices](THIRD_PARTY.md) and [artwork sources](app/logos/SOURCES.md).

Independent community project; not affiliated with LG or the streaming services. It launches installed apps, not streaming content or subscriptions.
