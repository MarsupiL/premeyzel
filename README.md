# Prémeyzel · Entre voisins

A community PWA for Prémeyzel, hosted at https://marsupil.github.io/premeyzel/.
The static frontend connects to the separate `premeyzel-api` Worker. Supabase handles
Google and email/password authentication; the backend owns roles and shared data.

## Current features

- Public events and hiking/MTB trails; ads and resident profiles require sign-in.
- Events support household registration, capacity limits and a FIFO whole-group waitlist.
- Ads support renting, lending, gifts, exchanges, services, wanted items, sales and lost/found.
- Profiles contain a name and optional photo. Contact details are not public profile fields.
- Private conversations are accessible only to their two participants, including when an
  administrator signs in. Optional push alerts hide message text and sender identity.
- Mon compte offers per-device notification opt-in and opt-out. Unread messages update the Home
  Screen badge where supported; reading messages and signing out clear it as appropriate.
- Members manage their own content. Administrators manage all content and roles; the
  owner's role is protected. All authorization is checked again on the server.
- GPX import/export, IGN maps with contours, fullscreen viewing and opt-in GPS tracking.
  GPS stays on the device. Maps can be downloaded before departure for offline use; publishing still requires Internet.
- Signed-in residents can offer or request a ride with a destination, date and time.
  Trips use Europe/Paris time, sort upcoming departures first and link to private messages.
  Ride offers display 0–8 available passenger seats, updated by the author or an admin;
  0 is shown as full. The count applies to every departure of a recurring offer.
  Expired rides disappear. Regular rides have a weekly or fortnightly rule per weekday,
  anchored to their start date, with an optional end date; the server returns the next departure.
- Apple login is not currently offered.

## Development and checks

Use Node 24 or later, and install the exact lockfile before working:

```sh
npm ci
npm run check
npm run dev
```

Open http://localhost:4177/dist/ after building. `npm run dev` uses Python 3 and binds
only to loopback. Browser-native GPX parser checks are in `tests/browser-gpx.html`.
Do not use a production account for automated mutation tests.

`npm run check` runs ESLint, formatting checks, regression tests and the production
build. `npm run format` applies the shared style. Tests cover authentication flows,
session changes, message pagination, push privacy, photo handling and GPS lifecycle.
Some model/photo tests retain historical pilot scenarios; those do not exercise the
production API. Server permissions and transactions are tested in `premeyzel-api`.

GitHub Actions runs these checks before deploying `dist/` to Pages. Source changes to
both repositories must deploy the backend first when new API capabilities are needed.
The message catch-up cursor introduced in this review is one such capability.

## Source map

- `start.js`: service-worker update coordination and resident-app startup.
- `resident-app.js`: navigation, profiles, posts, event registration and administration.
- `auth.js`, `auth-ui.js`: Supabase integration and account forms. The SDK is bundled
  locally; provider secrets and passwords are never stored in application source.
- `api-client.js`: session-scoped requests, cancellation, timeouts and pagination.
- `messages-ui.js`, `push-ui.js`: messaging and per-device notification opt-in.
- `gpx.js`, `trail-map.js`, `trail-location.js`: geometry, maps and GPS lifecycle.
- `trail-api.js`, `trails-ui.js`: shared-trail API adapters and interface.
- `html.js`, `search.js`, `photos.js`: shared escaping, French search and image helpers.
- `sw.js`: offline app shell and generic push notifications. Build output contains a
  content-derived cache name. Private API responses are not added to that cache.
- `art.js`, `icons.js`, `assets/`, `vendor/leaflet/`: visual assets and bundled map library.

`app.js` and `model.js` preserve the historical local demo and its regression scenarios.
They are excluded from the production build and precache. Failed live requests do not
switch users into fictional demo profiles or content. Legacy trail-claim support remains
available to residents who still possess their original browser ownership key.

## Security and operations

Keep credentials out of source and `dist/`. The browser needs only Supabase's public
configuration. Text is escaped before HTML insertion; the app also declares a content
security policy. Photos are resized and re-encoded locally; uploads and GPX geometry
have independent server limits. The server remains authoritative for permissions.

Recent Apple devices can display the server's generic declarative notification even
if background JavaScript or local storage is unavailable. Older browsers use the
service-worker handler. A queued generic alert/badge can arrive briefly after sign-out;
its fallback contains no sender or message text. Its conversation link still requires
authentication and participant membership. New public event alerts open that event;
event alerts do not change the private-message badge. Login preserves notification
destinations, and removed events show an unavailable notice. Each incoming message
has a distinct alert tag, while retried submissions do not resend alerts.

The existing GitHub Pages origin is shared with other projects under this GitHub user.
A dedicated domain/origin would isolate session storage from those projects. Backups,
restore drills, retention/deletion workflows and hosting monitoring remain operational
follow-up work; passing tests is not a substitute for those controls or an independent
penetration test. The app does not promise end-to-end encrypted messages.

The village can use the app free of charge. Future commercial licensing and
multi-village hosting are separate decisions. This is an independent community
initiative, not an official municipal service. Leaflet retains its bundled BSD license;
maps are attributed to IGN.

## Hunting zones

Balades offers public, time-limited community hunting reports. Signed-in residents
can draw a polygon, set a start/end time and optionally add details. Red polygons
are active; dashed amber polygons are planned. Their author and administrators
can edit or remove them. Boundary edits support draggable vertices, undo/reset,
and a keyboard-friendly add-at-map-centre control.

`hunting-state.js` synchronizes with server time and filters expired reports on
every countdown tick. `hunting-ui.js` refreshes every 10 seconds and on return to
the app. The same feed populates the overview and full-screen trail maps. Reports
are not persisted offline; a failed or stale refresh is labelled explicitly,
including when no zones are known. These reports never certify that an area is safe.

New static modules are included in the build and service-worker cache. Deploy the
backend hunting-zones migration/API before publishing this frontend. Verify polygon
creation/editing, author/admin permissions, expired-zone removal and disconnected
state using disposable local fixtures rather than real danger reports.

Ride date filtering uses Paris calendar dates and the server’s recurrence rules, including weekly/fortnightly schedules and end dates. The selected occurrence appears in both cards and details; clearing the date restores all upcoming rides. Destination and offer/request filters remain combinable.

The header feedback button opens a private problem/idea form. Feedback includes only
its text, signed-in name and an allowlisted page label; no automatic device logs or
location. The backend routes it to the protected owner and sends a separate email
copy through Brevo. Replies remain normal in-app messages. Drafts are memory-only,
cleared on sign-out, and keep a retry ID after a failed request to avoid duplicates.

## Offline trail maps

Open a trail in full screen, expand **Télécharger la carte hors ligne**, and download
before leaving mobile coverage. Readiness is confirmed only after the full GPX
geometry and both IGN layers have been written. The copy can be refreshed or
removed from the same panel; it is local to that browser/PWA and device.

`trail-offline.js` plans a bounding box with a 1 km margin, downloads both Plan IGN
and contour tiles at zooms 10–16 with two concurrent requests, and commits a
public route snapshot last. Limits are 1,200 tiles per route, five routes and
150 MiB including replacement staging. Larger routes use the existing GPX export.
Failed/cancelled/quota-limited replacements preserve the previous pack. Startup
checks every tile key before advertising a pack as ready; abandoned incomplete
packs are eligible for cleanup after 24 hours. `navigator.storage.persist()` is
requested when available, but browsers may decline or clear device storage.

The service worker reads only explicitly downloaded IGN tiles from versioned
route caches; static-shell upgrades preserve them. Zooms above 16 enlarge saved
tiles. Panning outside the downloaded extent shows an availability notice. The
CSP allows `connect-src https://data.geopf.fr/wmts` for downloads; no additional
private API caching is introduced. Downloaded snapshots never retain management
permissions, account data, photos or device location history. A route removed
from the shared feed can remain as an explicitly labelled local copy until the
user removes it. Live hunting zones are not persisted and are marked stale when
offline.

Public saved trails can reopen offline without initializing authentication. The
normal account flow resumes on reconnection. A network-loss event never tears
down the map/GPS watch. GPS uses the device geolocation API independently of map
requests, but requires permission, a usable signal, and a visible open app;
background or locked-screen tracking is not promised.

IGN's [Plan IGN](https://www.data.gouv.fr/datasets/plan-ign) and
[courbes de niveau](https://www.data.gouv.fr/datasets/courbes-de-niveau-4) datasets
are published under Licence Ouverte 2.0. Attribution remains visible on the map;
these are the open layers, not SCAN 25. The
[IGN service terms](https://cartes.gouv.fr/cgu/) were checked for tile access.

Tests exercise coverage bounds, atomic updates, interruption, eviction, limits,
removal, the actual service-worker offline tile handler, route fallback and
preservation of the GPS view when reception drops. Browser QA uses a disposable
local fixture with all fetches rejected in the service worker and synthetic GPS;
no production records or physical location are used.
