# CustomAlboom.com

A desktop-first web album editor built with Next.js, React, TypeScript and Konva. User photos and projects stay on the user's computer. Published layout templates, previews, shop settings and logos are stored on the application's own VPS filesystem; Cloudflare and R2 are not required.

## Run locally

Node.js 22.13+ is required (developed with Node 24).

```sh
npm ci
npm run dev -- --hostname 127.0.0.1
```

Open the printed URL (normally http://127.0.0.1:3000) in desktop Chrome or Edge. File System Access requires HTTPS in production; localhost is allowed for development. The project uses Node.js/Next.js, not PHP, even when the source is stored inside a Laragon directory.

```sh
npm run typecheck
npm test
npm run build
npm start
```

`npm start` runs the production Next.js server on port 3000 by default.

## Hostinger VPS deployment

This app needs a VPS with Node.js 22.13+; ordinary PHP-only shared hosting is not enough. On the VPS, install dependencies, build, and run the Next.js server behind Nginx with HTTPS. Detailed commands and ready-to-edit service files are in `deploy/hostinger-vps`.

The required production variables are:

```dotenv
KINGKONG_USERNAME=admin
KINGKONG_PASSWORD=use-a-long-random-password
CUSTOMALBOOM_DATA_DIR=/var/lib/customalboom
PORT=3000
HOSTNAME=127.0.0.1
```

`KINGKONG_USERNAME` and `KINGKONG_PASSWORD` initialise the first admin account only. Afterwards the hashed credentials are stored in `/var/lib/customalboom/style.asp`. Template files and previews are stored below the same directory. Keep this directory outside `/var/www/customalboom`, give it write access to the service user, and include it in backups. Never replace or delete it during a code deployment.

No MySQL database, Cloudflare Worker, D1 or R2 binding is needed. If migrating existing R2 data, export `style.asp` and every object using its existing key, then reproduce the same directory tree below `CUSTOMALBOOM_DATA_DIR` before starting the new server.

## Editor workflow

1. Choose a photo folder. JPEG, PNG and WebP files in its subfolders are indexed in a worker. Identical file content is treated as one photo, regardless of filename.
2. Add rectangle/circle frames and text, or choose one of the six starter layouts. Select a photo after selecting a frame, drag it onto a frame, or Auto-fill the empty frames on the active page.
3. Double-click a filled frame to reposition and zoom its photo. The source aspect ratio is always preserved. Click Done to commit or Cancel/Escape to discard the crop.
4. Use Page settings for height × width, inch/cm display, 150/300 DPI, page background, inner padding and single/spread mode. A 12 × 18 inch single becomes a 12 × 36 inch spread.
5. The cutter only accepts one empty frame. Set its gap and drag a straight line across it. Cuts preserve ellipse curves and remain independently editable.
6. File → Save project downloads `.album-project.json`. It contains layout and relative photo references, not image bytes. Reopen the photo folder when reconnecting a saved project.
7. Save layout downloads a reusable `.lca` file through the browser. Layouts → Your layouts can read a folder containing downloaded `.lca` files. No template files are written to the web server.
8. Export one JPG, all pages in an ordered ZIP, or one PDF with mixed single/spread page sizes.

Keyboard: Shift-click multi-select; Shift-rotate snaps to 15 degrees; Space-drag pans; Ctrl-scroll zooms; Ctrl-Z/Ctrl-Shift-Z undo/redo; Ctrl-S saves; Delete removes selected elements. Photo usage is recalculated from the complete document after every edit or undo.

## Source organization

- `src/domain`: versioned schemas, physical-unit conversions, geometry, exact curved bounds and page conversion.
- `src/editor`: UI panels, canvas controls, undo/redo and user actions.
- `src/io`: local files, IndexedDB, photo worker and JPG/ZIP/PDF export.
- `src/render`: shared canvas scene used by the editor, page previews and exports.
- `src/server/cutter.ts` and `app/api/geometry/cut/route.ts`: server-only cut orchestration and validated same-origin JSON endpoint.
- `src/print-shops/store.ts`: atomic persistent filesystem storage used by the admin catalogue and public template APIs.
- `next.config.ts`: production response security headers and build settings.

Coordinates are points (72 points per inch). DPI never changes layout geometry. A frame is a rectangle/ellipse intersected with a convex clip polygon; cut pieces rebase their local origin without flattening curved edges. Photo placement is a separate uniform-scale transform. Background clips preserve photos when moving a single page into one half of a spread.

## Print output and limits

JPG output uses quality 95%, exact pixel dimensions and JFIF density in inches at the chosen DPI. PDF pages use physical dimensions in points and embedded raster pages. The output is RGB; CMYK, PDF/X, vector PDF text and RAW/HEIC are outside this version.

The editor caps documents at 200 pages, 500 elements per page and 10,000 unique photos. Individual source photos are limited to 100 MB. A page export is limited to 16,384 pixels on either side and 64 megapixels total; a batch is limited to 350 MB of encoded images. Errors are surfaced rather than silently reducing DPI. Export cancellation is checked between rendering/encoding stages and pages.

Project/template JSON is limited to 10 MB and validated on import. Missing photos display placeholders and block the affected export. Browser autosave is a convenience, not a replacement for project-file backups. Clearing browser storage removes autosave and remembered folder handles, but does not touch original photos or saved files.

## Security and privacy

The geometry API accepts bounded JSON and does not accept photo bytes or local filesystem paths. Admin catalogue mutations require the existing Kingkong session, same-origin requests and the latest metadata revision. Public APIs expose only Published templates. Read permission is requested for local photo/layout folders; saved layouts are downloaded as files. Fonts are bundled locally.

Production has HTTPS, CSP, nosniff and restrictive camera/microphone/geolocation policies. CSP permits inline bootstrap scripts/styles required by the framework but does not permit eval, remote scripts or arbitrary remote image sources. Imported text is rendered as text, never HTML. Source maps are disabled and server cutter orchestration is absent from the browser bundle.

Splitting/minifying browser code is not copy protection. Anyone can inspect client code delivered to a public browser. Server code remains private, and a downloaded HTML file is not a self-contained working application.

`work/`, `outputs/`, browser fixtures, local state, environment files and dependencies are excluded from source publication. No credentials belong in the source tree.

## Verification

`npm test` covers units, DPI metadata, straight/rotated/curved/repeated cuts, invalid cuts, padding, image aspect ratio, both page conversions, background preservation, usage counts, template privacy, import validation and API request boundaries.

The browser integration fixture is `tests/BrowserCheck.tsx`. To run it locally, use `npm run qa:enable`, start the dev server, open `/qa` and press Run verification. It uses synthetic images and checks worker hashing, original-quality rendering, 2700 × 1800 and 10800 × 3600 output, PDF page dimensions, ZIP ordering, template privacy and missing/oversized-image failures. It downloads two synthetic proof files. Run `npm run qa:disable` before a production build; the temporary route is gitignored and refuses production access.

Verified during implementation: TypeScript, 20 domain/API tests, 12 browser integration checks, layout gallery application and a production build. Native folder-picker interaction was not fully verified because Windows computer automation stopped when it could not validate the Chrome window URL. Test read/write/revoked permission dialogs in desktop Chrome/Edge on the target machine.
