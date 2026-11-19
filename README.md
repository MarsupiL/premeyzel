# Prémeyzel · Entre voisins

French, mobile-first PWA pilot for village events, shared rides, advertisements and walking/MTB routes. The frontend is hosted on GitHub Pages. GPX routes use a shared D1/R2 backend; events, rides, ads, messages and demo profiles remain browser-local simulations. No analytics or external fonts are loaded.

## Try it

Switch between the resident demo profiles, Camille (admin), and Visitor using the profile button. Publish an event, request a ride, contact an advertiser, or manage reports. Switch to the other demo resident to respond. Outside the Balades section, changes persist only in this browser. Reset restores the examples, including La fête du four on 31 October 2026. Published content additions are merged once into existing browser data without overwriting edits, deletions or activity.

Visitors see events and trails; members also see rides and ads. This is a **UI simulation, not authentication or access control**: all demo data is included in the static source. Do not enter real personal data.

## Product rules

- All members publish immediately. Authors edit/delete their own posts; admins edit/delete any post. Reports do not hide posts.
- Events may have a date with the time still to be confirmed. La fête du four directs bread orders and offers of help to JP or Marie; demo registrations do not place an order. Events support household registrations, capacity, and a strict FIFO whole-group waiting list. Cancelling a registration promotes waiting groups when sufficient room is available.
- Drivers confirm requests; pending requests do not consume capacity. Acceptance checks available seats. Only the driver decides bookings. Weekly trip creation generates four individually bookable departures. Cancel one departure or all future departures in the series.
- Deleting a booked event/trip cancels affected registrations/requests and creates local notifications; cancellation history remains in My activity.
- Publications accept one optional JPEG, PNG or WebP photo (up to 10 MiB). Photos are resized to at most 1280 pixels and re-encoded locally, without source metadata, to fit the browser storage budget. The current illustrations act as sample photos; removing a photo restores an automatic illustration. Event/ad photos persist only in this browser, including offline. Shared-route photos are uploaded to R2. If storage is full or unavailable, publishing fails visibly and keeps the draft open without altering the saved post. Reset removes local photos along with other local changes.
- Ads include renting, lending, gifts, barter, services, selling, and lost/found. Rentals show a rate; dates, conditions, and any payment are arranged between people. No payments in the pilot.
- Conversations are displayed only to their participants, including when using the admin profile. Event registration lists and ride request identities are shown to the organiser/driver.
- Balades imports GPX tracks/routes up to 5 MiB and 20,000 points. Choose Randonnée or VTT; publication is immediately saved for all visitors. Les châtaignes is a randonnée with 367 points, 9.11 km and 343 m ascent, calculated from the supplied elevations. Its 313 m endpoint gap is preserved.
- Maps use bundled Leaflet 1.9.4 and IGN Plan + contour-line tiles. Click a route to open the full-screen map, export/share GPX or explicitly enable location tracking. GPS remains on-device and stops when the view closes. Map tiles require Internet.
- Each anonymous author has a random management key stored in their browser. Others cannot edit/delete their routes. Clearing browser storage or switching devices loses this ownership access; Mathias can manage any route through the backend’s authenticated administrator page. Demo Camille has no backend privileges.
- Route lists refresh every 10 seconds while visible; previously consulted full tracks can be exported offline. Recording times and extra GPX metadata are not published. Named waypoints, geometry, segment boundaries and elevations are retained.
- Installation and offline app shell work through a manifest and service worker. There are no real email, SMS or push notifications. Only routes have cross-device updates.

## Development

Requires Node 22+ and Python 3 for the convenience preview command. No npm dependencies are required.

```sh
npm test
npm run build
npm run dev
```

Open http://localhost:4177/dist/. Browser-native GPX parser checks are at http://localhost:4177/tests/browser-gpx.html. Static production files are written to `dist/`. URLs are relative so deployment works at a GitHub project path.

The GitHub Actions workflow builds, tests and deploys `dist/`. Set repository **Settings → Pages → Source → GitHub Actions**. Village artwork is original local code; Leaflet is distributed under its bundled BSD license and maps are attributed to IGN. No source license is granted by this prototype; commercial licensing can be decided separately.

## Structure and future service

- `model.js`: demo seed data, business rules, configurable village identity and storage key.
- `app.js`: UI, local persistence, routes, notifications and form interactions.
- `photos.js`: photo validation, local resizing and sample image sources.
- `art.js`: original SVG illustrations.
- `gpx.js`, `trail-map.js`, `trail-location.js`: GPX geometry, IGN maps and location lifecycle.
- `trail-api.js`, `trails-ui.js`: shared-route storage client and interfaces.
- `assets/trails/`: canonical seed GPX and JSON.
- `vendor/leaflet/`: bundled map library and license.
- `style.css`: responsive layout and visual design.
- `sw.js`: offline shell; build generates a content-based cache version.
- `tests/`: model invariants and lifecycle regression checks.

The shared-route backend is https://premeyzel-parcours.mathias790372.chatgpt.site (administration at `/admin`). Its source is maintained in the separate `premeyzel-api` checkout. Migrating the other sections requires real resident accounts, server-side booking transactions, privacy/retention decisions and automated backups. Routes are supplied by contributors and have no independent terrain verification. Future villages can be supported through configuration and deployment; no multi-village accounts or billing are implemented.

Prémeyzel uses the service free of charge. Selling a future version to other villages remains an option. This prototype is independent and is not presented as an official municipal service.
