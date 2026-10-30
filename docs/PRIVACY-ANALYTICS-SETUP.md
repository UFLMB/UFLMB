# UFLMB privacy and analytics setup

## What is implemented

- Optional Cloudflare Web Analytics beacon, loaded only in production when a site-specific beacon token is present at build time.
- Cloudflare Web Analytics is configured only for the public Firebase Hosting site, `uflmb.web.app`.
- Admin > Analytics setup/status panel.
- Public Privacy Notice and Cookies & Browser Storage Notice.
- No advertising pixels, session replay, Google Analytics or custom visitor-identification code is added.
- No Supabase schema, data, authentication, DNS or hosting configuration is changed by this feature.

## Activate Cloudflare Web Analytics

1. Create/sign in to a Cloudflare account.
2. In **Web Analytics**, add `uflmb.web.app` as a site and copy its JavaScript beacon token.
3. In GitHub, open **UFLMB/UFLMB → Settings → Secrets and variables → Actions → Variables**.
4. Create this repository variable:
   - `CF_WEB_ANALYTICS_TOKEN_FIREBASE` — token for `uflmb.web.app`
5. Run the **Deploy UFLMB to Firebase Hosting** workflow (or push a reviewed change to `main`). The Firebase production build will include the beacon.
6. Verify `uflmb.web.app` in the Cloudflare Web Analytics dashboard. Initial metrics may take several minutes to appear.

GitHub Pages is intentionally not configured for analytics. The beacon token is a public site identifier, not an account API token. Never create or expose a Cloudflare API token for this integration. No DNS change, Cloudflare proxy, custom Worker or paid plan is required for the manual snippet setup.

## Consent and storage approach

The current implementation uses localStorage/sessionStorage for interface preferences and the active sign-in session. These are not HTTP cookies. The Cloudflare Web Analytics documentation describes its beacon as cookie-free and says it does not collect or use visitors' personal data. For that reason, this implementation does not add a misleading Accept-only cookie banner. If a future technology uses non-essential cookies or similar device storage, it must be reviewed and consent controls added where required before activation.

## Admin metrics

The Admin > Analytics page links to the Cloudflare dashboard and reports whether the relevant build has a beacon token configured. It does not display live metrics inside UFLMB. An embedded dashboard would require a server-side integration with protected credentials; a browser-visible API token must never be used.

## Required legal completion before public launch

The policy pages are a technically aligned draft, not a legal certification. The controller identity and privacy contact have been added. Before public launch, confirm provider processing locations and contractual safeguards, determine and document justified retention/deletion periods for account, support, moderation and provider log data, and verify that the actual deletion processes match the published policy. Review the final text with a Hungarian/EU privacy professional if it will be relied on as the production GDPR notice.
