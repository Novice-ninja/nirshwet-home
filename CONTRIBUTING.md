# Contributing

Fork the repository and open a PR describing the problem, final behavior, and validation. Keep normal operation entirely on the TV.

```sh
npm ci --ignore-scripts
npm run check
npm test
npm run package
```

Build tools use Node 22+. Web code targets Chromium 79; TV JavaScript targets Node 8; the filter stays Python 2.7-compatible despite Python 3 tests.

UI changes should check 1080p/720p, D-pad boundaries, dialog focus, and photo suspension. Validate `file:` packaging on the TV before claiming support. Guard changes must preserve watchdog recovery, held-key handling, stale-context fail-open, and explicit LG Home access.

For bugs, include model, firmware, installation type, remote/input path, steps, and expected/actual behavior. Remove personal data from logs/screenshots. Never commit `.device/`, imported photos, generated packages, or account sessions. Public builds start from a clean, photo-free clone.

Contributions to original code/docs are MIT licensed. Existing font and logo rights stay separate; record sources/terms for new assets.
