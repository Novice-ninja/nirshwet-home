# Make it yours

Fork, clone your fork, create a branch, and start in the browser preview. Validate packaged rendering on the actual TV.

## Branding and palette

Change visible names in `app/index.html`, `app/appinfo.json`, and `app/app.js`. Keep `com.sofagoblin.home` for a replacement installation on your own TV; a display name is different from a package ID.

Palette variables live in `app/styles.css`. Update matching literal RGB gradient stops too; these support the older TV engine. Generated icon colors are in `scripts/build.mjs`, with `iconColor` in app metadata. Header sizing uses `.brand`, `#clock`, and `#date` (about 43/55/26 pixels at 1080p). Preserve text contrast and visible focus. Static backgrounds/local fonts keep the design lightweight.

## Apps

The catalog at the top of `app/app.js` defines keys, exact installed app IDs, titles, and logo paths. Verify IDs on your TV/region. Adding guard coverage also requires adding the app ID to `APPS` in `tv/remote_guard.py`. A tile alone does not enable protection.

Changing the five-app count requires reviewing columns, navigation, and tests. Keep artwork proportional, record sources/terms, and remember third-party logos are not MIT licensed.

## Photos

On macOS with Apple's command-line developer tools:

```sh
npm run photos:import -- "/path/to/selected photos"
npm run package
```

Select up to 24 JPEG/PNG/HEIC/HEIF files directly in one folder. Import applies orientation and creates JPEG copies bounded to 1920 × 1080 without source EXIF/XMP/IPTC; originals are untouched. Preview before installing: restricted image-decoding environments have produced black images during development.

On other platforms, prepare ignored `photos/photo-01.jpg`, `photo-02.jpg`, etc., and `photos/manifest.json` containing an array of filenames. Strip metadata from your own copies. The build validates names and caps the list at 24. Remove the generated folder and rebuild for a photo-free package.

Interval: `app/photos.js`; fade: `app/styles.css`. Default 30 seconds. Preserve hidden-page suspension and reduced-motion handling.

## Remote behavior

`KEYS` and `Policy` in `tv/remote_guard.py` define Linux key codes and confirmation. Holding never counts as a second press. Back is also protected in streaming menus because the TV cannot reliably expose whether it would dismiss controls or exit.

Calibrate changes with independent SSH recovery access. Browser Back 461 and physical Linux Back 412 are different layers. Preserve Home's capability/heartbeat checks, fail-open behavior, and watchdog.

## Separate app ID

For a side-by-side package, update every `com.sofagoblin.home` reference across metadata, manager, tests, and installation instructions. Also review shared `/var/lib/sofa-goblin`, `/tmp/sofa-goblin-*`, hooks, process identity checks, and storage keys before running two helper installations. Changing only the visible name is simpler.
