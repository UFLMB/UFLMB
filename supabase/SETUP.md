# UFLMB shared backend setup

The application can use Supabase for shared card records and community ratings/reviews. The project is intentionally not connected to any account until an owner creates and configures the backend.

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

   Only user IDs explicitly listed in `public.admin_users` can create, edit, or delete shared cards. An authenticated account alone is not enough. Do not add untrusted users to this table.

## 2. Configure GitHub Pages

In the UFLMB GitHub repository, open **Settings → Secrets and variables → Actions → Variables** and add:

- `VITE_SUPABASE_URL` = the Supabase Project URL
- `VITE_SUPABASE_ANON_KEY` = the public publishable/anon key

These two values are designed to be public client configuration; the service-role key is not. Save the variables, then open **Actions → Deploy UFLMB to GitHub Pages → Run workflow**, or push a commit to trigger a build.

## 3. Use the app

- Open the live site and go to **Admin / data entry → Import / Export → Shared card database**.
- Sign in using the trusted Supabase admin user.
- Click **Load shared records** before publishing. This protects against publishing an unreviewed local snapshot.
- Edit cards in Card manager, then click **Publish local edits** to publish changes. The publish action synchronizes non-demo records and applies deletions since the last loaded snapshot.
- Public visitors can read shared cards and submit ratings/reviews from a card's full profile.

The two-team demo fixture is local-only and is excluded from shared-database publishing.

## Security and operational notes

- Never add the Supabase service-role key to GitHub Pages variables or frontend code.
- Card writes are protected by row-level security and an explicit `admin_users` allowlist. Public sign-ups should remain disabled; do not add untrusted accounts to the allowlist.
- Community review insertion is currently open to anonymous visitors for the initial test. Before a broad public launch, add CAPTCHA, rate limits, moderation/reporting and preferably verified-user controls.
- The daily GitHub Actions job audits the checked-in production starter dataset and, when Supabase is configured, checks shared source-link reachability and flags verification dates older than 90 days. It does not scrape third-party pages or change player ratings. Reliable automatic content refresh needs a supported source/API and an explicit mapping/verification policy. Do not treat the audit as an automatic facts refresh.
- Shared background/branding settings are still browser-local; this backend currently covers cards and reviews.
- The schema change only changes database permissions when you run it in your Supabase project. Committing the SQL file to GitHub does not apply it to a live Supabase project.
