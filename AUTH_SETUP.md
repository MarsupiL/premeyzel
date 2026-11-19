# Enable real resident accounts

Google sign-in and real resident accounts are live as of 19 November 2026. The Google OAuth app is in production mode. Apple is deferred until the Apple Developer membership is renewed. The backend uses Supabase Auth with the existing D1/R2 content storage. Public information pages are `confidentialite.html` and `conditions.html`. Account deletion remains manual; there is no automatic retention purge.

## 1. Create the authentication project

Create a Supabase project in an EU region in Mathias's own account. Use the Free plan initially; monitor usage and inactivity-pausing restrictions. No Supabase database tables are needed: village data stays in the existing D1/R2 backend.

From the project settings, obtain the project URL and its **publishable** key (`sb_publishable_…`). Those two values are public configuration. Never use a secret/service-role key in the app. Register these allowed return URLs under Authentication → URL Configuration:

- Site URL: `https://marsupil.github.io/premeyzel/`
- Redirect URL: `https://marsupil.github.io/premeyzel/`
- Local QA URL only when testing: `http://127.0.0.1:4177/dist/`

The callback uses the exact page URL without a fragment; after exchanging the code the app opens `#/compte`. Do not use broad wildcard production redirects.

## 2. Google

In a Google Cloud project owned by Mathias, configure the OAuth consent screen for external users, app name and support contact. Create a Web application OAuth client with Supabase's exact callback URL shown in its Google-provider settings (`https://<project-ref>.supabase.co/auth/v1/callback`). Put the Google client ID and secret into Supabase → Authentication → Sign In / Providers → Google. Configure production availability rather than leaving the app restricted to test users.

Google registration/login creates the resident account automatically. The client uses the official Supabase SDK's PKCE flow; no custom OAuth tokens are minted by Prémeyzel.

## 3. Apple

Apple web sign-in requires an Apple Developer account, a primary App ID with Sign in with Apple enabled, a Services ID for this website, and a signing key. Associate the Supabase callback domain and URL with that Services ID, then configure its IDs and generated client secret in Supabase's Apple-provider settings. Keep private keys in storage controlled by Mathias; do not paste them into chat or commit them.

Apple client secrets for this flow expire and need periodic renewal (up to six months). Verify Apple's current developer-program enrollment requirements and price before purchasing membership. Google can launch first while the Apple button clearly remains unavailable.

## 4. Protect Mathias's owner access

Keep the backend's existing secret `ADMIN_EMAIL` for trusted ChatGPT recovery access. `RESIDENT_OWNER_ID` selects the immutable Supabase user ID of Mathias's verified Google account; it is configured privately in Sites. After provider verification, that selected account receives the protected owner role, including if it first signed in before the configuration was set. Other accounts retain their stored roles. When `RESIDENT_OWNER_ID` is absent, the original verified-email bootstrap remains supported. Never choose an owner by a displayed name. The authenticated ChatGPT `/admin` page remains a separate recovery path.

All other users start as `member`. Administrators can promote/demote other users, but nobody can demote the protected owner and an admin cannot demote themselves. Role changes are revision checked and logged.

## 5. Runtime configuration and activation

Use native Sites environment tools for project `appgprj_6aff06fc13e88191b467d2c1c59d0b33`:

- `SUPABASE_URL`: project origin, `https://<project-ref>.supabase.co`
- `SUPABASE_PUBLISHABLE_KEY`: public `sb_publishable_…` key
- `AUTH_GOOGLE_ENABLED=true` after provider setup
- `AUTH_APPLE_ENABLED=true` only after provider setup
- `ACCOUNTS_ENABLED=true` to activate the production interface and disable anonymous trail mutations

Provider client secrets stay in Supabase, not the frontend/backend. Environment updates require deploying a saved backend version. The frontend `start.js` reads `/api/auth/config`; no separate provider secrets or runtime keys need to be committed to GitHub.

Before the switch, test real sign-in, sign-out, refresh, expired sessions and return from each configured provider. Test Mathias's owner access, a second regular account, promotion and demotion, cross-device ownership, and a forged/direct API attempt to edit another user's post. Review consent/privacy text and configure backups/retention before opening to all residents.

## Rollout behavior

Existing real GPX routes remain available. A signed-in author can attach their browser-owned pilot trails using the old management key. Lost keys require administrator help. The key never grants a global role.

The new events and ads collections start empty. The old local demo content remains in that browser's old storage key; it is not published as real content or assigned to new users based on names. Re-publish intended real content after confirming its current details.

Ride booking and account deletion are the next production steps. Events already have shared registration counts, duplicate protection and a whole-group waiting list. Author/admin deletion hides a publication; soft-deleted data remains retained until a retention policy is configured.

## References

- https://supabase.com/docs/guides/auth/social-sign-in/auth-google
- https://supabase.com/docs/guides/auth/social-sign-in/auth-apple
- https://supabase.com/docs/guides/auth/sessions/pkce-flow
- https://supabase.com/docs/reference/javascript/auth-getuser
- https://supabase.com/pricing
- https://developer.apple.com/help/account/capabilities/configure-sign-in-with-apple-for-the-web/

## Profiles and private messages

The resident profile exposes only name and optional photo; the verified Google email remains a server-side identity attribute. Legacy optional contact columns are no longer exposed or accepted and are cleared when that resident next saves their profile. Avatars live in R2 and are returned only to authenticated residents, with private/no-store responses.

Private conversations use a unique pair of resident IDs, D1 messages, retry-safe message IDs, cursor pagination and monotonic read markers. All endpoints verify conversation membership; admin/owner roles do not bypass it. Messages and drafts are not saved in browser storage. Inbox counts refresh while the app is visible. Optional Web Push delivery is described below; no email/SMS delivery or end-to-end encryption is provided. Tests use disposable local identities and messages.


## Message push notifications

Web Push uses `@block65/webcrypto-web-push` 2.0.0 (RFC 8291 aes128gcm and RFC 8292 VAPID) on the existing Worker. The Worker generates its VAPID key pair on the server on first authenticated configuration access and persists it in the private `push_settings` D1 table (migration 0006). The private key is never returned by any API, logged, or committed. Keep that table in database backups: the pair must stay stable across deployments; rotation requires browser resubscription. Optional runtime overrides are `VAPID_PUBLIC_KEY`, secret `VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT` (all three required together). Migration 0005 stores per-device subscriptions, scoped to the authenticated resident, capped at eight devices.

Residents opt in under Mon compte; permission is requested only from their click. iOS/iPadOS 16.4+ requires the Home Screen app. Browser/OS notification settings and Internet access affect delivery. A closed app receives pushes through its service worker; no tab polling is required. No paid Apple Developer membership is needed.

Only newly inserted messages trigger recipient delivery through `waitUntil`; idempotent message retries do not send a second push. Transport failures get up to three bounded attempts without failing the saved message. There is no durable retry queue after those attempts or a Worker interruption: notifications are best effort; the inbox remains authoritative. The push service keeps undelivered alerts for up to 24 hours. HTTP 404/410 removes expired subscriptions. Known push-service hosts are allowlisted, and redirects are refused. Notification text is generic (no message body or sender name), and notifications collapse per conversation.

Logout removes the device subscription and clears its local account binding. The service worker rejects queued alerts for other accounts. Changing accounts does not inherit opt-in. An expired subscription is repaired on the next authenticated visit when permission is still granted. Test with disposable local accounts; do not send test messages to real residents.
