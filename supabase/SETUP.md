# UFLMB shared backend setup

> **Current status (2026-10-27):** The UFLMB Supabase project is active and healthy. The current frontend includes account registration/sign-in, a trusted-admin workspace, shared-card sync, shared appearance settings and community reviews. The live database has the expected tables and an active `username-signin` Edge Function; its deployed source is tracked at `supabase/functions/username-signin/index.ts`. However, `public.cards` currently contains 0 rows. The checked-in CSV is not automatically imported into that cloud table.

The application uses Supabase as its primary cloud store for shared card records, private non-sensitive app-state (bookmarks and squad assignments), and public shared site appearance (branding and background image URLs), plus community ratings/reviews. Browser local storage remains a fallback cache. Google Picker credentials and the admin session token remain local and are never uploaded.

## 1. Database migrations

The repository now contains SQL migration files corresponding to the seven versions recorded by the live project, including the RLS performance optimization. The older migration files were reconstructed from the current live schema and prior setup SQL because the original SQL files were absent from GitHub. They have **not yet been validated by a clean-database replay**, so run the workflow in `plan` mode first and do not treat the migration chain as proven for a brand-new project until that dry run succeeds against a disposable database.

For the existing UFLMB project, do **not** recreate the project or blindly rerun `supabase/schema.sql`. Use the tracked migration workflow described below. The `schema.sql` file remains a manual baseline reference, not the canonical deployment path for the full account/profile schema.

## 2. Configure the manually gated Supabase deployment workflow

The workflow `.github/workflows/supabase-deploy.yml` is intentionally **manual only**. It does not run on every GitHub push.

In GitHub, open **Settings → Secrets and variables → Actions** and add these secrets:

- `SUPABASE_ACCESS_TOKEN`: a Supabase personal access token created by the project owner.
- `SUPABASE_DB_PASSWORD`: the database password for the existing UFLMB Supabase project.

The project reference is fixed in `supabase/config.toml` and the workflow as `ujuptqzlpubcdelrjmja`; it is not a secret. Do not store a service-role key in GitHub for this workflow, and never expose a service-role key in the frontend.

Then open **GitHub → Actions → Supabase database and function deployment → Run workflow**:
- Choose **plan** first. This links the project and runs `supabase db push --dry-run`; it should not change the production schema.
- Choose **apply** only after reviewing a successful plan and confirming the pending migrations are expected. This applies pending migrations and deploys the tracked `username-signin` Edge Function.

If the plan reports remote migration versions that are missing locally, unexpected pending migrations, or schema drift, stop and reconcile that output before choosing **apply**. The workflow is deliberately not automatic to protect the live database.

## 3. Configure GitHub Pages

The current `.github/workflows/deploy.yml` already supplies the Supabase Project URL and public `sb_publishable_...` key to the build, so no GitHub Actions variables are required for the frontend. The public key is intended for browser use; all admin authorization is enforced by Supabase Auth and row-level security. The service-role/secret key must never be committed or included in a frontend build.

After changing the project or rotating the publishable key, update the public client configuration in both `.github/workflows/deploy.yml` and `.github/workflows/card-data-audit.yml`, then commit the change. A push to `main` triggers the GitHub Pages build and deployment. These values are intentionally public; never add a service-role or secret key.

## 4. Trusted admin access

Create or confirm the trusted admin account in **Authentication → Users**, then copy its UUID from the Auth Users page and run the following statement, replacing the example UUID with that exact user UUID:

   ```sql
   insert into public.admin_users (user_id)
   values ('00000000-0000-0000-0000-000000000000')
   on conflict (user_id) do nothing;
   ```

Only user IDs explicitly listed in `public.admin_users` can access the admin workspace or create, edit, or delete shared cards. Ordinary community registration is separate from admin authorization: a newly registered account must not receive admin privileges unless its UUID is deliberately added to this allowlist. The browser can read only its own allowlist row and cannot modify the allowlist. Do not add untrusted users to this table.

## 5. Use the app

- Open the live site and sign in using the trusted Supabase admin account.
- Open the admin workspace from the account menu, then select the **Cloud sync** tab.
- Click **Load shared records & enable auto-save** before editing. The app merges shared records with local-only records and enables cloud auto-save for non-demo cards.
- After a card is added or edited, the app waits briefly and upserts the non-demo collection to Supabase. Auto-save never deletes remote rows.
- Bookmarks and squad assignments are saved to the admin-only Supabase app-state row. Branding, logo/icon and rotating background URLs are saved separately to `public.site_settings`; all visitors can read these shared appearance settings, but only allowlisted admins can change them. Google Picker credentials and session tokens are excluded.
- Use **Publish + apply deletions** only when you intentionally want to apply local deletions to the shared database. Review the confirmation carefully.
- Public visitors can read shared cards and submit ratings/reviews from a card's full profile.

The two-team demo fixture is local-only and is excluded from shared-database publishing.

## Security and operational notes

- The Supabase Security Advisor reports that leaked-password protection is disabled. Enable it in **Authentication → Settings → Password Security** when available.
- Card writes are protected by row-level security and an explicit `admin_users` allowlist. Public sign-ups should remain disabled unless intentionally required; do not add untrusted accounts to the allowlist.
- Community review insertion is currently open to anonymous visitors for the initial test. Before a broad public launch, add CAPTCHA, rate limits, moderation/reporting and preferably verified-user controls.
- The daily GitHub Actions job audits the checked-in source dataset and the configured shared Supabase records, checking source-link reachability and flagging verification dates older than 90 days. It does not scrape third-party pages or change player ratings. Reliable automatic content refresh needs a supported source/API and an explicit mapping/verification policy. Do not treat the audit as an automatic facts refresh.
- Supabase is the primary cloud save. The local cache and downloadable JSON backup remain available only as a recovery path. Google Picker credentials and the admin session token remain browser-local and are not included in the cloud snapshot.
- Committing SQL to GitHub does not itself apply it to the live Supabase database. Production schema changes require the manually gated workflow.
