# UFLMB

A community-driven UFL Mobile player-card database. Built with React, TypeScript and Vite.

## Current features

- Responsive dark card gallery for desktop and mobile
- Search by player name, nation, club, card type and position
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
- Empty initial dataset: no invented sample player cards are included

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

## Important storage and security note

The current admin tool stores data in the **current browser's local storage**. It is a working local prototype, not a shared online database:
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

## Second major feature package

- **Card comparison:** select up to three cards from the public gallery and compare OVR, positions, nation, club, edition and every stat key shared across the selected records. Selections can be removed individually or cleared.
- **Live rankings:** top five cards by OVR plus a leaderboard for every stat present in the actual dataset. Rankings are generated from verified records only; no demo cards or fabricated values are introduced.
- **Collection analytics:** total records, unique player names, image coverage, stat coverage, source-link coverage and recently checked records.
- **Filtered CSV export:** export the current search/filter result set without exporting unrelated records.
- **Responsive comparison and analytics layouts** for desktop and mobile.

These are client-side features and use the same local dataset as the existing gallery. They do **not** turn local storage into a shared online database or add server-side authentication; that requires a separate backend/authentication package.
