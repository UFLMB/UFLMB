# UFLMB privacy and analytics setup

## What is implemented

- Optional Cloudflare Web Analytics beacon, loaded only in production when a site-specific beacon token is present at build time.
- Separate build variables for GitHub Pages and Firebase Hosting.
- Admin > Analytics setup/status panel.
- Public Privacy Notice and Cookies & Browser Storage Notice.
- No advertising pixels, session replay, Google Analytics or custom visitor-identification code is added.
- No Supabase schema, data, authentication, DNS or hosting configuration is changed by this feature.

## Activate Cloudflare Web Analytics

1. Create/sign in to a Cloudflare account.
2. Open **Web Analytics** and add `uflmb.github.io` as a site. Copy the JavaScript beacon token shown by Cloudflare.
3. Add `uflmb.web.app` as a second site and copy its beacon token.
4. In GitHub, open **UFLMB/UFLMB → Settings → Secrets and variables → Actions → Variables**.
5. Create these repository variables:
   - `CF_WEB_ANALYTICS_TOKEN_PAGES` — token for `uflmb.github.io`
   - `CF_WEB_ANALYTICS_TOKEN_FIREBASE` — token for `uflmb.web.app`
6. Re-run the **Deploy UFLMB to GitHub Pages** and **Deploy UFLMB to Firebase Hosting** workflows. The regular build will include the corresponding beacon.
7. Verify both hostnames in the Cloudflare Web Analytics dashboard. Initial metrics may take several minutes to appear.

The beacon token is a public site identifier, not an account API token. Never create or expose a Cloudflare API token for this integration. No DNS change, Cloudflare proxy, custom Worker or paid plan is required for the manual snippet setup.

## Consent and storage approach

The current implementation uses localStorage/sessionStorage for interface preferences and the active sign-in session. These are not HTTP cookies. The Cloudflare Web Analytics documentation describes its beacon as cookie-free and says it does not collect or use visitors' personal data. For that reason, this implementation does not add a misleading Accept-only cookie banner. If a future technology uses non-essential cookies or similar device storage, it must be reviewed and consent controls added where required before activation.

## Admin metrics

The Admin > Analytics page links to the Cloudflare dashboard and reports whether the relevant build has a beacon token configured. It does not display live metrics inside UFLMB. An embedded dashboard would require a server-side integration with protected credentials; a browser-visible API token must never be used.

## Required legal completion before public launch

The policy pages are a technically aligned draft, not a legal certification. The operator must complete the controller's full legal name and direct privacy contact, confirm provider processing locations and contractual safeguards, and set precise retention/deletion periods for account, support, moderation and provider log data. Review the final text with a Hungarian/EU privacy professional if it will be relied on as the production GDPR notice.