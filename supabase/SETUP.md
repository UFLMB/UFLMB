# UFLMB shared backend setup

> **Current status (2026-10-20):** The admin login page and admin workspace have been removed from the frontend for a redesign. The Supabase schema, access-control policies, and existing database records are intentionally preserved; no cloud data was deleted. The steps below describe the backend setup intended for the replacement admin workflow.

The application uses Supabase as its primary cloud store for shared card records, private non-sensitive app-state (bookmarks and squad assignments), and public shared site appearance (branding and background image URLs), plus community ratings/reviews. Browser local storage remains a fallback cache. Google Picker credentials and the admin session token remain local and are never uploaded.

## 1. Create and configure Supabase

1. Create a project at https://supabase.com/dashboard.
2. Open **Project Settings → API** and copy the Project URL and the **publishable/anon key**. Never use the service-role key in the browser.
3. Open **SQL Editor**, paste all of `schema.sql` from this folder, and run it.
4. In **Authentication → Users**, create the trusted admin user. Keep public sign-ups disabled.
5. Copy that user's UUID from the Auth Users page. In the SQL Editor, run the following statement, replacing the example UUID with the exact user UUID:

   ```sql
   insert into public.admin_users (user_id)
   values ('00000000-0000-0000-0000-000000000000')
   on conflict (user_id) do nothing;
   ```

   Only user IDs explicitly listed in `public.admin_users` can access the hidden admin area or create, edit, or delete shared cards. The app verifies the authenticated user against this allowlist on the server; an authenticated account alone is not enough. The browser can read only its own allowlist row and cannot modify the allowlist. Do not add untrusted users to this table.

## 2. Configure GitHub Pages

The current `.github/workflows/deploy.yml` already supplies the Supabase Project URL and public `sb_publishable_...` key to the build, so no GitHub Actions variables are required for the configured project. The public key is intended for browser use; all admin authorization is enforced by Supabase Auth and row-level security. Both values are public client configuration by design; the service-role/secret key must never be committed or included in a frontend build.

After changing the project or rotating the publishable key, update those two values in the workflow and commit the change. A push to `main` triggers the GitHub Pages build and deployment.

## 3. Use the app

- Open the live site and go to **Admin / data entry → Import / Export → Shared card database**.
- Sign in using the trusted Supabase admin user.
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
- The daily GitHub Actions job audits the checked-in production starter dataset and, when Supabase is configured, checks shared source-link reachability and flags verification dates older than 90 days. It does not scrape third-party pages or change player ratings. Reliable automatic content refresh needs a supported source/API and an explicit mapping/verification policy. Do not treat the audit as an automatic facts refresh.
- Supabase is the primary cloud save. The local cache and downloadable JSON backup remain available only as a recovery path. Google Picker credentials and the admin session token remain browser-local and are not included in the cloud snapshot.
- The schema change only changes database permissions when you run it in your Supabase project. Committing the SQL file to GitHub does not apply it to a live Supabase project.
