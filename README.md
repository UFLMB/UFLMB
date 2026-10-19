# UFLMB

A community-driven UFL Mobile player-card database. Built with React, TypeScript and Vite.

## Current features

- Responsive dark card gallery for desktop and mobile
- Installable progressive web app (PWA) with an app manifest and custom icon
- Offline app-shell caching for returning visitors; card data remains browser-local until a shared backend is configured
- Improved keyboard focus visibility and reduced-motion support
- Multiple background image URLs with automatic 30-second rotation, dark readability overlay, and backward-compatible migration of the previous single-background setting (saved in the current browser)
- Search by player name, nation, club, card type and position
- Search by player name, nation, club, card type, position, stats, perks, and source URL
- Full player profile modal with complete saved attributes, perk list, verification date and source link
- Personal saved-card bookmarks and a saved-only browsing filter (stored in the current browser)
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
- Empty production dataset: no invented records are included in the verified starter collection
- Optional two-team test fixture: 22 explicitly fictional demo records, split into two editable 11-player squads and visibly labelled as synthetic test data

## Run locally

Requires a current Node.js LTS release.

```bash
npm install
npm run dev
```

Open the local URL printed by Vite. To check the production bundle:

```bash
npm run build
npm run preview
```

## Entering card data

Open the card manager from the public page using **Admin / data entry**. Required fields are player name, OVR, positions, nation and a source URL. Stats must be a JSON object with numeric values, for example:

```json
{"PAC": 90, "SHO": 85, "PAS": 88, "DRI": 91, "DEF": 42, "PHY": 78}
```

Only add records that have been checked against a reliable source. Export a JSON backup regularly.

## Demo squads for testing

Open **Admin / data entry → Card manager → Load / reset 22 demo cards** to load Demo Team A and Demo Team B (11 cards each). Switch teams in the squad builder. These are fictional UI test fixtures: names, OVR, stats, perks, nations and clubs are synthetic; the source link is deliberately a placeholder. They are not real UFL Mobile records and must not be treated as verified data. Edit them in the card manager or delete them before entering real cards. Reloading the demo fixture overwrites the demo records only and preserves records whose IDs are not demo IDs.

## Shared database groundwork

- `supabase/schema.sql` defines shared card records, community reviews/ratings, public read access, and row-level security that restricts card writes to explicitly allowlisted Supabase admin user IDs.
- `src/components/SharedDatabasePanel.tsx` provides Supabase sign-in, loading, and deliberate publishing of card edits from the existing editor. Demo records are excluded from publishing.
- `src/components/CommunityReviews.tsx` adds ratings/reviews to card profiles. They become shared when the Supabase variables and SQL schema are configured.
- A daily GitHub Actions workflow audits the production source dataset and, when configured, checks shared source-link reachability and flags verification dates older than 90 days. It intentionally does not scrape or invent card data; a reliable supported source/API must be selected before true automated card updates can be enabled.
- Setup instructions are in `supabase/SETUP.md`. Until a Supabase project is created, the SQL is run, and the two public build variables are configured, shared cards and community reviews remain disconnected; local browser storage continues to work.

## Important storage and security note

The current admin tool stores data in the **current browser's local storage**. The app shell can be cached for offline return visits, but this does not turn local card records into a shared database. It is a working local prototype, not a shared online database:
- Records entered in one browser/device are not automatically visible to other visitors or devices.
- Clearing browser site data may remove locally stored records. Export JSON backups.
- The admin page has no server-side authentication. Do not treat it as a secure private admin panel.
- Uploaded images are stored as compressed data URLs in local storage and can consume browser storage quota.

Before public launch with shared data, connect a server-side database and image storage, add authenticated admin access and server-side validation, then migrate the JSON records. The Google Drive picker is optional and requires a separate Google Cloud setup; all local-file import/export features work without it. Never place service-role keys or private secrets in client-side `VITE_*` variables.

## Deployment

The GitHub Actions workflow in `.github/workflows/deploy.yml` builds the app and deploys `dist` to GitHub Pages on pushes to `main`. In repository Settings → Pages, set Source to **GitHub Actions**. The app is served under `/UFLMB/`; the admin route is `/UFLMB/#admin`. The admin currently saves to this browser's local storage only, so it is not a shared database. The `public/_redirects` file also includes the fallback used by Cloudflare Pages.

## Project structure

- `src/App.tsx` — public gallery and manual card manager
- `src/types/card.ts` — typed card record contract
- `src/data/cards.ts` — initial dataset (intentionally empty)
- `src/index.css` — responsive styling
- `public/_redirects` — static-host SPA fallback

## Database Core hardening\n\n- JSON paste imports validate the complete payload before changing anything, reject repeated IDs in the incoming file, and show a confirmation summary for updates, additions, and likely duplicates.\n- Duplicate records with different IDs are skipped instead of silently replacing an existing card identity.\n- Supabase card write policies require an explicit `public.admin_users` allowlist entry; a generic authenticated session no longer grants card-edit permissions.\n- Important: the SQL file must still be run in the actual Supabase project to apply the new policies. A GitHub commit alone does not change a live database.\n\n## Second major feature package

- **Card comparison:** select up to three cards from the public gallery and compare OVR, positions, nation, club, edition and every stat key shared across the selected records. Selections can be removed individually or cleared.
- **Live rankings:** top five cards by OVR plus a leaderboard for every stat present in the actual dataset. Rankings are generated from verified records only; no demo cards or fabricated values are introduced.
- **Collection analytics:** total records, unique player names, image coverage, stat coverage, source-link coverage and recently checked records.
- **Filtered CSV export:** export the current search/filter result set without exporting unrelated records.
- **Responsive comparison and analytics layouts** for desktop and mobile.
- **Squad Planner Plus:** auto-fill an XI using position fit first and OVR as a tie-breaker, export a portable squad JSON, and import a squad by matching its player references against cards already in the current browser. Missing cards remain empty; imports never invent or silently add player records.

These are client-side features and use the same local dataset as the existing gallery. They do **not** turn local storage into a shared online database or add server-side authentication; that requires a separate backend/authentication package.

## Background image rotation

The branding section accepts multiple direct HTTP/HTTPS image URLs, one per line. They rotate every 30 seconds, with a strong dark gradient overlay applied to each image to keep text legible. The previous single-background setting is migrated automatically. Appearance settings remain local to the current browser because this static deployment has no shared settings backend.
