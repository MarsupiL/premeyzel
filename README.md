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
- Mon compte offers a per-device notification test. Unread messages update the Home
  Screen badge where supported; reading messages and signing out clear it as appropriate.
- Members manage their own content. Administrators manage all content and roles; the
  owner's role is protected. All authorization is checked again on the server.
- GPX import/export, IGN maps with contours, fullscreen viewing and opt-in GPS tracking.
  GPS stays on the device. Map tiles and publication require Internet.
- Apple login and rides are not currently offered.

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
has a distinct alert tag, while retried submissions do not resend alerts. The test
button reports provider acceptance separately from confirmed display on the device.

The existing GitHub Pages origin is shared with other projects under this GitHub user.
A dedicated domain/origin would isolate session storage from those projects. Backups,
restore drills, retention/deletion workflows and hosting monitoring remain operational
follow-up work; passing tests is not a substitute for those controls or an independent
penetration test. The app does not promise end-to-end encrypted messages.

The village can use the app free of charge. Future commercial licensing and
multi-village hosting are separate decisions. This is an independent community
initiative, not an official municipal service. Leaflet retains its bundled BSD license;
maps are attributed to IGN.
