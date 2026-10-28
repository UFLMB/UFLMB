# UFLMB

A community-driven UFL Mobile player-card database. Built with React, TypeScript and Vite.

## Current features

- Responsive dark card gallery for desktop and mobile
- Installable progressive web app (PWA) with an app manifest and custom icon
- Offline app-shell caching for returning visitors; starter card records are bundled locally and the shared cloud database is initialized in Supabase
- Improved keyboard focus visibility and reduced-motion support
- Multiple background image URLs with automatic 30-second rotation, dark readability overlay, and backward-compatible migration of the previous single-background setting (saved in the current browser)
- Search by player name, nation, club, card type and position
- Search by player name, nation, club, card type, position, stats, perks, and source URL
- Full player profile modal with complete saved attributes, perk list, verification date and source link
- Personal saved-card bookmarks and a saved-only browsing filter, with browser-local fallback and optional signed-in cloud sync
- Minimum and maximum OVR range filters alongside position, nation, card type and text search
- Numeric attribute filtering using each attribute present in the verified card records
- Local squad builder with 4-3-3, 4-4-2 and 3-5-2 formations, unique player assignments, OVR average and position-fit indicators
- Sort by OVR, name, or most recently verified
- Reset all active search and filter criteria in one action
- Actionable data-quality review queue with direct record editing
- Strict JSON backup validation, duplicate-ID rejection, pre-import impact summary, explicit confirmation before overwriting matching IDs, and duplicate-aware merging
- Filters for goalkeepers, defenders, midfielders and forwards, plus exact position, nation and card type
- Sort by highest OVR, lowest OVR, or player name
- Card records with OVR, positions, nation, card type, club, stats, perks, image and verification source/date
- Separate manual content manager at `/admin`
- Add, edit and delete card records
- Upload an image (client-side resize/compression) or use an image URL
- JSON export/import for backups and moving records between browsers
- CSV export compatible with spreadsheet apps
- Bulk image import by player-name filename matching, with client-side optimization
- Data-quality dashboard for missing fields, old verification dates, invalid sources and possible duplicates
- Select and delete multiple records in the admin manager
- Local spreadsheet and JSON imports work without Google sign-in
- 480 imported starter records are included in `src/data/players-5.csv` and the Supabase shared table; all are marked `imported-unverified`, retain their 59-column source data, and must not be presented as independently verified
- Optional two-team test fixture: 22 explicitly fictional demo records, split into two editable 11-player squads and visibly labelled as synthetic test data

## Run locally

Requires a current Node.js LTS release.

```bash
npm ci
npm run dev
```

Open the local URL printed by Vite. To check the production bundle:

```bash
npm run build
npm run preview
```

## Entering card data

Sign in with the trusted account and open the admin workspace from the account menu. Only accounts listed in `public.admin_users` should have admin access. Required card fields are player name, OVR, positions, nation and a source URL. Stats must be a JSON object with numeric values, for example:

```json
{"PAC": 90, "SHO": 85, "PAS": 88, "DRI": 91, "DEF": 42, "PHY": 78}
```

Only add records that have been checked against a reliable source. Export a JSON backup regularly.

## Demo squads for testing

In the admin workspace, open **Card manager → Load / reset 22 demo cards** to load Demo Team A and Demo Team B (11 cards each). Switch teams in the squad builder. These are fictional UI test fixtures: names, OVR, stats, perks, nations and clubs are synthetic; the source link is deliberately a placeholder. They are not real UFL Mobile records and must not be treated as verified data. Edit them in the card manager or delete them before entering real cards. Reloading the demo fixture overwrites the demo records only and preserves records whose IDs are not demo IDs.

## Shared database groundwork

- `supabase/schema.sql` defines shared card records, community reviews/ratings, public read access, and row-level security that restricts card writes to explicitly allowlisted Supabase admin user IDs.
- `src/components/SharedDatabasePanel.tsx` provides Supabase sign-in, loading, and deliberate publishing of card edits from the existing editor. Demo records are excluded from publishing.
- `src/components/CommunityReviews.tsx` displays approved community reviews publicly. Posting requires a signed-in registered account; the database also rejects anonymous review inserts. The author username and account ID are taken from the authenticated session.
- A daily GitHub Actions workflow audits the checked-in source dataset and the configured Supabase shared records, checking source-link reachability and flagging verification dates older than 90 days. It does not scrape or silently rewrite player facts.
- Setup and security notes are in `supabase/SETUP.md`. The connected Supabase project is active and its schema is deployed; however, the live `public.cards` table currently has 0 rows. The checked-in CSV dataset is not automatically imported into the shared cloud table.

## Important storage and security note

The app uses browser local storage as a fallback/cache and also has a configured Supabase backend. Shared cloud syncing requires a trusted admin session and loading the shared snapshot first; local-only changes are not automatically shared with other devices:
- Records entered in one browser/device are not automatically visible to other visitors or devices.
- Clearing browser site data may remove locally stored records. Export JSON backups.
- Admin access uses Supabase Auth and the `public.admin_users` allowlist, with database row-level security enforcing card-write permissions. Keep the allowlist restricted to trusted accounts.
- Uploaded images are stored as compressed data URLs in local storage and can consume browser storage quota.

Guest users are read-only: they can browse public content but cannot submit reviews or support messages. Review insertion is restricted by database RLS to signed-in accounts whose profile username matches the submitted author name. Supabase Auth rate limits password sign-in requests; do not treat UI-only checks as security boundaries. Consider CAPTCHA or a dedicated write-rate limiter before opening wider community posting. The Google Drive picker is optional and requires a separate Google Cloud setup; local-file import/export works without it. Never place service-role keys or private secrets in client-side `VITE_*` variables.

## Deployment

The GitHub Actions workflows use the committed npm lockfile (`npm ci`), run security-contract and source-data checks, build the app, and deploy `dist` to GitHub Pages on pushes to `main`. The repository's Pages source should be **GitHub Actions**. The site is served under `/UFLMB/`; the admin workspace is reached after signing in with a trusted admin account, not through a public `/admin` URL. The `public/_redirects` file is a fallback for compatible static hosts such as Cloudflare Pages.

## Project structure

- `src/App.tsx` — public gallery and manual card manager
- `src/types/card.ts` — typed card record contract
- `src/data/cards.ts` — parses the checked-in CSV starter dataset
- `src/index.css` — responsive styling
- `public/_redirects` — static-host SPA fallback

## Database Core hardening

- JSON paste imports validate the complete payload before changing anything, reject repeated IDs in the incoming file, and show a confirmation summary for updates, additions, and likely duplicates.
- Duplicate records with different IDs are skipped instead of silently replacing an existing card identity.
- Supabase card write policies require an explicit `public.admin_users` allowlist entry; a generic authenticated session no longer grants card-edit permissions.
- The live Supabase project has multiple recorded migrations and additional account/profile tables beyond the baseline `schema.sql`. Keep the checked-in SQL/migrations aligned with the live schema; a GitHub commit alone never applies SQL to the database.

## Second major feature package

- **Card comparison:** select up to three cards from the public gallery and compare OVR, positions, nation, club, edition and every stat key shared across the selected records. Selections can be removed individually or cleared.
- **Live rankings:** top five cards by OVR plus a leaderboard for every stat present in the actual dataset. Rankings are generated from verified records only; no demo cards or fabricated values are introduced.
- **Collection analytics:** total records, unique player names, image coverage, stat coverage, source-link coverage and recently checked records.
- **Filtered CSV export:** export the current search/filter result set without exporting unrelated records.
- **Responsive comparison and analytics layouts** for desktop and mobile.
- **Squad Planner Plus:** auto-fill an XI using position fit first and OVR as a tie-breaker, export a portable squad JSON, and import a squad by matching its player references against cards already in the current browser. Missing cards remain empty; imports never invent or silently add player records.

These features operate on the records loaded by the app. Persistence is feature-specific: some preferences and imports remain browser-local, while shared card data and appearance settings use the configured Supabase paths when the trusted admin workflow is active.

## Background image rotation

The branding section accepts multiple direct HTTP/HTTPS image URLs, one per line. They rotate every 30 seconds, with a strong dark gradient overlay applied to each image to keep text legible. The previous single-background setting is migrated automatically. Trusted admins can publish appearance settings to the shared `public.site_settings` table after loading cloud branding; browser-local fallback settings may still exist.
