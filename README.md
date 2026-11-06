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
6. File → Save project downloads a small `.can` containing layout and photo references only. File → Save project with photos creates a portable `.canpack` containing the project plus each unique original photo currently used by a frame or page background.
7. Save layout downloads a reusable `.lca` file through the browser. Layouts → Your layouts can read a folder containing downloaded `.lca` files. No template files are written to the web server.
8. Export one JPG, all pages in an ordered ZIP, or one PDF with mixed single/spread page sizes.

Keyboard: Shift-click multi-select; I toggles the album-wide frame lock; Q swaps two selected frame photos or cycles three or more in visual top-to-bottom, left-to-right order; Shift-rotate snaps to 15 degrees; Space-drag pans; Ctrl-scroll zooms; Ctrl-Z/Ctrl-Shift-Z undo/redo; Ctrl-S saves; Delete removes selected elements. Q includes empty frames as slots, preserves each photo's focal point and adjustments while fitting its new frame, and records the whole cycle as one undo step. Photo usage is recalculated from the complete document after every edit or undo.

Lock Frame in the workspace toolbar is an album-wide mode and does not require a selection. It locks every frame on every page, including frames added later. Locked frames remain selectable and still allow photo assignment, crop, colour, border, layer and delete changes, while drag, resize, alignment, cutters, Division, Magic Spacer and Flip Side leave their geometry unchanged. Choose Unlock Frame to restore movement throughout the album. The mode survives project save/open, while reusable layout files stay neutral and follow the destination album's lock mode.

Auto-fill prioritizes portrait, landscape and square photos for matching empty frames, then chooses the closest aspect ratio to reduce cropping. Matching photos are reserved before filling unmatched frames with leftovers. Selected photos are used at most once; otherwise enabling duplicate photos allows reuse, preferring less-used candidates. Existing filled frames and photo eligibility rules remain unchanged.

The header reports browser autosave separately from the project-file status bar. The bar shows the last `.can` download request or completed `.canpack` save time (hover for its full date), and flags subsequent changes. A `.can` download cannot be confirmed on disk by the app, so check browser downloads. After 10 minutes of unsaved changes a non-blocking reminder offers Save project or another 10-minute snooze. Opening a project establishes a clean file baseline; undoing back to it clears the reminder. File status metadata persists locally alongside browser autosave and never includes photo bytes.

## Source organization

- `src/domain`: versioned schemas, browser-local cutting and division, physical-unit conversions, geometry, exact curved bounds and page conversion.
- `src/editor`: UI panels, canvas controls, undo/redo and user actions.
- `src/io`: local files, IndexedDB, photo worker and JPG/ZIP/PDF export.
- `src/render`: shared canvas scene used by the editor, page previews and exports.
- `src/print-shops/store.ts`: atomic persistent filesystem storage used by the admin catalogue and public template APIs.
- `next.config.ts`: production response security headers and build settings.

Coordinates are points (72 points per inch). DPI never changes layout geometry. A frame is a rectangle/ellipse intersected with a convex clip polygon; cut pieces rebase their local origin without flattening curved edges. Photo placement is a separate uniform-scale transform. Background clips preserve photos when moving a single page into one half of a spread.

## Print output and limits

JPG output uses quality 95%, exact pixel dimensions and JFIF density in inches at the chosen DPI. PDF pages use physical dimensions in points and embedded raster pages. The output is RGB; CMYK, PDF/X, vector PDF text and RAW/HEIC are outside this version.

The editor caps documents at 200 pages, 500 elements per page and 10,000 unique photos. Individual source photos are limited to 100 MB. A page export is limited to 16,384 pixels on either side and 64 megapixels total; a batch is limited to 350 MB of encoded images. Errors are surfaced rather than silently reducing DPI. Export cancellation is checked between rendering/encoding stages and pages.

Project/template JSON is limited to 10 MB and validated on import. Portable `.canpack` files are uncompressed ZIP containers limited to less than 2 GB; they are streamed directly to disk and include used originals only, so their size is approximately the total size of those photos. Opening a package validates its manifest, paths, sizes and photo hashes. Embedded photos remain available for the current browser session but are not copied into IndexedDB, so reopen the `.canpack` after a refresh. Missing photos display placeholders and block the affected export. Browser autosave is a convenience, not a replacement for project-file backups. Clearing browser storage removes autosave and remembered folder handles, but does not touch original photos or saved files.

## Security and privacy

Cut, Divide, Magic Spacer and `.canpack` save/open run entirely in the browser and do not send frame geometry, photo bytes or local filesystem paths to the server. Admin catalogue mutations require the existing Kingkong session, same-origin requests and the latest metadata revision. Public APIs expose only Published templates. Read permission is requested for local photo/layout folders; saved layouts and projects are written directly to user-selected files. Inter, Lora and DM Sans are bundled locally. Google Fonts added from Kingkong Settings are validated by the server and loaded from `fonts.googleapis.com` / `fonts.gstatic.com` in the user's browser; no photo data is sent with those requests.

Production has HTTPS, CSP, nosniff and restrictive camera/microphone/geolocation policies. CSP permits inline bootstrap scripts/styles required by the framework but does not permit eval, remote scripts or arbitrary remote image sources. Imported text is rendered as text, never HTML. Source maps are disabled. The client bundle includes the local geometry engine used by Cut, Divide and Magic Spacer.

Splitting/minifying browser code is not copy protection. Anyone can inspect client code delivered to a public browser. Server code remains private, and a downloaded HTML file is not a self-contained working application.

`work/`, `outputs/`, browser fixtures, local state, environment files and dependencies are excluded from source publication. No credentials belong in the source tree.

## Verification

`npm test` covers units, DPI metadata, browser-local straight/rotated/curved/repeated cuts, 20-part Division, invalid cuts, Magic Spacer, padding, image aspect ratio, both page conversions, background preservation, usage counts, template privacy, import validation and `.canpack` streaming/validation/round trips.

The browser integration fixture is `tests/BrowserCheck.tsx`. To run it locally, use `npm run qa:enable`, start the dev server, open `/qa` and press Run verification. It uses synthetic data and checks browser-local Cut and 20-part Division, worker hashing, original-quality rendering, 2700 × 1800 and 10800 × 3600 output, PDF page dimensions, ZIP ordering, template privacy and missing/oversized-image failures. It downloads two synthetic proof files. Run `npm run qa:disable` before a production build; the temporary route is gitignored and refuses production access.

Use `npm run qa:enable -- --productivity` for the synthetic Auto-fill and save-reminder UI fixture. It exercises mixed orientations, selected-only filling, duplicate reuse, undo/redo, and reminder snoozing without reading or writing the user's album storage. Its Save project button simulates file-status updates only; actual download and refresh persistence can be checked in the editor.

Verified during implementation: TypeScript, automated domain tests, browser integration checks, layout gallery application and a production build. Native folder-picker interaction was not fully verified because Windows computer automation stopped when it could not validate the Chrome window URL. Test read/write/revoked permission dialogs in desktop Chrome/Edge on the target machine.
# Info page and banners

Kingkong's coffee support section accepts an optional creator portrait (PNG, JPEG or WebP, maximum 3 MB). Upload, replace or remove it using “Gambar Belanja saya kopi”. The same public image appears to the left of the message in the coffee popup and on `/tips`; without an image, both remain text-only. Image changes save immediately and use the existing authenticated, same-origin, revision-checked storage workflow.

`/info` explains local folder photos, `.can` versus `.canpack` (with analogies and trade-offs), and what happens when projects open. English is the default; visitors can switch to Malay. The editor’s left panel links here through See Info. Album photos stay local; saving `.canpack` intentionally includes used originals in the user-selected local file.

Kingkong → Settings → Banner halaman Info manages up to five banners. Upload PNG/JPEG/WebP (up to 3 MB), enter an accessible title and optional HTTP(S) CTA URL, edit metadata or remove a banner. All available banners display in insertion order, without rotation, in a responsive grid. Frames use width:height 1:1.5 (recommended 600 × 900 px) and contain the image without cropping. No empty ad placeholders appear before banners are added. Banner images are public server assets, separate from users' private album photos. Metadata uses the existing revision-checked store; old stores default to no banners.
