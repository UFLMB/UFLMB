# UFLMB

A community-driven UFL Mobile player-card database. Built with React, TypeScript and Vite.

## Current features

- Responsive dark card gallery for desktop and mobile
- Search by player name, nation, club, card type and position
- Filters for goalkeepers, defenders, midfielders and forwards
- Card records with OVR, positions, nation, card type, club, stats, perks, image and verification source/date
- Separate manual content manager at `/admin`
- Add, edit and delete card records
- Upload an image (client-side resize/compression) or use an image URL
- JSON export/import for backups and moving records between browsers
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

Open `/admin` from the public page using **Admin / adatbevitel**. Required fields are player name, OVR, positions, nation and a source URL. Stats must be a JSON object with numeric values, for example:

```json
{"PAC": 90, "SHO": 85, "PAS": 88, "DRI": 91, "DEF": 42, "PHY": 78}
```

Only add records that have been checked against a reliable source. Export a JSON backup regularly.

## Important storage and security note

The current admin tool stores data in the **current browser's local storage**. It is a working manual-entry prototype, not a shared online database:
- Records entered in one browser/device are not automatically visible to other visitors or devices.
- Clearing browser site data may remove locally stored records. Export JSON backups.
- The admin page has no server-side authentication. Do not treat it as a secure private admin panel.
- Uploaded images are stored as compressed data URLs in local storage and can consume browser storage quota.

Before public launch with shared data, connect a server-side database and image storage, add authenticated admin access and server-side validation, then migrate the JSON records. Never place service-role keys or private secrets in client-side `VITE_*` variables.

## Deployment

The GitHub Actions workflow in `.github/workflows/deploy.yml` builds the app and deploys `dist` to GitHub Pages on pushes to `main`. In repository Settings → Pages, set Source to **GitHub Actions**. The app is served under `/UFLMB/`; the admin route is `/UFLMB/#admin`. The admin currently saves to this browser's local storage only, so it is not a shared database. The `public/_redirects` file also includes the fallback used by Cloudflare Pages.

## Project structure

- `src/App.tsx` — public gallery and manual card manager
- `src/types/card.ts` — typed card record contract
- `src/data/cards.ts` — initial dataset (intentionally empty)
- `src/index.css` — responsive styling
- `public/_redirects` — static-host SPA fallback
