# UFLMB shared backend setup

> **Current status (2026-10-27):** The UFLMB Supabase project is active and healthy. The current frontend includes account registration/sign-in, a trusted-admin workspace, shared-card sync, shared appearance settings and community reviews. The live database has the expected tables and an active `username-signin` Edge Function; its deployed source is tracked at `supabase/functions/username-signin/index.ts`. However, `public.cards` currently contains 0 rows. The checked-in CSV is not automatically imported into that cloud table. The live schema also includes account/profile migrations beyond this file, so `schema.sql` is a baseline—not a complete restore of the current production database.

The application uses Supabase as its primary cloud store for shared card records, private non-sensitive app-state (bookmarks and squad assignments), and public shared site appearance (branding and background image URLs), plus community ratings/reviews. Browser local storage remains a fallback cache. Google Picker credentials and the admin session token remain local and are never uploaded.

## 1. Configure the existing project or create a fresh one

For the existing UFLMB project, do **not** recreate the project or blindly rerun the baseline schema. Confirm that the project URL in the deployment workflow matches the intended project and use tracked migrations for schema changes. This repository does not yet contain a complete replayable migration history for every object currently in production; the schema and migration files must be reconciled before this repo can fully recreate the live database from scratch.

The incremental migration `supabase/migrations/20261027143252_optimize_profile_rls_initplan.sql` has been applied to the live project and is checked in for traceability. This does **not** mean the full historical migration set is now reproducible.

For a fresh project, open https://supabase.com/dashboard, create the project, and copy the Project URL and the **publishable/anon key** from **Project Settings → API**. Never use the service-role key in the browser. Apply the baseline schema and all required migrations/functions in a deliberate order; do not assume `schema.sql` alone reproduces username login, profiles and preferences.

Create or confirm the trusted admin account in **Authentication → Users**, then copy its UUID from the Auth Users page and run the following statement, replacing the example UUID with that exact user UUID:

   ```sql
   insert into public.admin_users (user_id)
   values ('00000000-0000-0000-0000-000000000000')
   on conflict (user_id) do nothing;
   ```

   Only user IDs explicitly listed in `public.admin_users` can access the admin workspace or create, edit, or delete shared cards. Ordinary community registration is separate from admin authorization: a newly registered account must not receive admin privileges unless its UUID is deliberately added to this allowlist. The browser can read only its own allowlist row and cannot modify the allowlist. Do not add untrusted users to this table.

## 2. Configure GitHub Pages

The current `.github/workflows/deploy.yml` already supplies the Supabase Project URL and public `sb_publishable_...` key to the build, so no GitHub Actions variables are required for the configured project. The public key is intended for browser use; all admin authorization is enforced by Supabase Auth and row-level security. Both values are public client configuration by design; the service-role/secret key must never be committed or included in a frontend build.

After changing the project or rotating the publishable key, update the public client configuration in both `.github/workflows/deploy.yml` and `.github/workflows/card-data-audit.yml`, then commit the change. A push to `main` triggers the GitHub Pages build and deployment. These values are intentionally public; never add a service-role or secret key.

**Database CI/CD is not configured yet.** The current workflows build/deploy the website and audit card data; they do not automatically apply Supabase SQL migrations or deploy Edge Functions. Do not add a `supabase db push` workflow until the production migration history has been reconciled with the repository and the required GitHub Actions secrets/permissions are deliberately configured. Committing SQL alone does not change the live database.

## 3. Use the app

- Open the live site and sign in using the trusted Supabase admin account.
- Open the admin workspace from the account menu, then select the **Cloud sync** tab.
- Click **Load shared records & enable auto-save** before editing. The app merges shared records with local-only records and enables cloud auto-save for non-demo cards.
- After a card is added or edited, the app waits briefly and upserts the non-demo collection to Supabase. Auto-save never deletes remote rows.
- Bookmarks and squad assignments are saved to the admin-only Supabase app-state row. Branding, logo/icon and rotating background URLs are saved separately to `public.site_settings`; all visitors can read these shared appearance settings, but only allowlisted admins can change them. Google Picker credentials and session tokens are excluded.
- Use **Publish + apply deletions** only when you intentionally want to apply local deletions to the shared database. Review the confirmation carefully.
- Public visitors can read shared cards and submit ratings/reviews from a card's full profile.

The two-team demo fixture is local-only and is excluded from shared-database publishing.

## Security and operational notes

- Never add the Supabase service-role key to GitHub Pages variables or frontend code.
- Card writes are protected by row-level security and an explicit `admin_users` allowlist. Public sign-ups should remain disabled; do not add untrusted accounts to the allowlist.
- Community review insertion is currently open to anonymous visitors for the initial test. Before a broad public launch, add CAPTCHA, rate limits, moderation/reporting and preferably verified-user controls.
- The daily GitHub Actions job audits the checked-in source dataset and the configured shared Supabase records, checking source-link reachability and flagging verification dates older than 90 days. It does not scrape third-party pages or change player ratings. Reliable automatic content refresh needs a supported source/API and an explicit mapping/verification policy. Do not treat the audit as an automatic facts refresh.
- Supabase is the primary cloud save. The local cache and downloadable JSON backup remain available only as a recovery path. Google Picker credentials and the admin session token remain browser-local and are not included in the cloud snapshot.
- The baseline schema and migration SQL only change database permissions/schema when applied to the Supabase project. Committing a SQL file to GitHub does not apply it to the live project.
