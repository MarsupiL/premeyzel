# Prémeyzel · Entre voisins

French, mobile-first PWA pilot for village events, shared rides, advertisements and walking/MTB routes. Sample data plus village publications supplied by the project owner; all accounts and interactions are simulated. Designed for GitHub Pages without a backend, runtime dependencies, external fonts, analytics, or remote map tiles.

## Try it

Switch between the resident demo profiles, Camille (admin), and Visitor using the profile button. Publish an event, request a ride, contact an advertiser, or manage reports. Switch to the other demo resident to respond. Changes persist only in this browser. Reset restores the examples, including La fête du four on 31 October 2026. Published content additions are merged once into existing browser data without overwriting edits, deletions or activity.

Visitors see events and trails; members also see rides and ads. This is a **UI simulation, not authentication or access control**: all demo data is included in the static source. Do not enter real personal data.

## Product rules

- All members publish immediately. Authors edit/delete their own posts; admins edit/delete any post. Reports do not hide posts.
- Events may have a date with the time still to be confirmed. La fête du four directs bread orders and offers of help to JP or Marie; demo registrations do not place an order. Events support household registrations, capacity, and a strict FIFO whole-group waiting list. Cancelling a registration promotes waiting groups when sufficient room is available.
- Drivers confirm requests; pending requests do not consume capacity. Acceptance checks available seats. Only the driver decides bookings. Weekly trip creation generates four individually bookable departures. Cancel one departure or all future departures in the series.
- Deleting a booked event/trip cancels affected registrations/requests and creates local notifications; cancellation history remains in My activity.
- Publications accept one optional JPEG, PNG or WebP photo (up to 10 MiB). Photos are resized to at most 1280 pixels and re-encoded locally, without source metadata, to fit the browser storage budget. The current illustrations act as sample photos; removing a photo restores an automatic illustration. Photos persist only in this browser, including offline, and are not uploaded to GitHub or shared. If storage is full or unavailable, publishing fails visibly and keeps the draft open without altering the saved post. Reset removes local photos along with other local changes.
- Ads include renting, lending, gifts, barter, services, selling, and lost/found. Rentals show a rate; dates, conditions, and any payment are arranged between people. No payments in the pilot.
- Conversations are displayed only to their participants, including when using the admin profile. Event registration lists and ride request identities are shown to the organiser/driver.
- Trail geometry is illustrative and fictional, explicitly unsuitable for navigation. Residents can publish demo trail cards and select an illustrative route.
- Installation and offline app shell work through a manifest and service worker. There are no real email, SMS, push, or cross-device updates.

## Development

Requires Node 22+ and Python 3 for the convenience preview command. No npm dependencies are required.

```sh
npm test
npm run build
npm run dev
```

Open http://127.0.0.1:4177. Static production files are written to `dist/`. URLs are relative so deployment works at a GitHub project path.

The GitHub Actions workflow builds, tests and deploys `dist/`. Set repository **Settings → Pages → Source → GitHub Actions**. All site content and art are original local code. No source license is granted by this prototype; commercial licensing can be decided separately.

## Structure and future service

- `model.js`: demo seed data, business rules, configurable village identity and storage key.
- `app.js`: UI, local persistence, routes, notifications and form interactions.
- `photos.js`: photo validation, local resizing and sample image sources.
- `art.js`: original SVG illustrations and illustrative route map.
- `style.css`: responsive layout and visual design.
- `sw.js`: offline shell; build generates a content-based cache version.
- `tests/`: model invariants and lifecycle regression checks.

A production version needs a shared backend, real authentication, server-enforced permissions, transactions for seat allocation, privacy/retention decisions and verified licensed trail data. This pilot does not demonstrate shared community activity. Future villages can be supported through configuration and deployment; no multi-village accounts or billing are implemented.

Prémeyzel uses the service free of charge. Selling a future version to other villages remains an option. This prototype is independent and is not presented as an official municipal service.
