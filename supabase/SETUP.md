# UFLMB shared backend setup

The application can use Supabase for shared card records and community ratings/reviews. The project is intentionally not connected to any account until an owner creates and configures the backend.

## 1. Create a Supabase project

1. Create a project at https://supabase.com/dashboard.
2. Open **Project Settings → API** and copy the Project URL and the **publishable/anon key**. Never use the service-role key in the browser.
3. Open **SQL Editor**, paste all of `schema.sql` from this folder, and run it.
4. In **Authentication → Users**, create the admin user. Keep public sign-ups disabled so visitors cannot create accounts with card-edit permissions. Use this admin account only for the UFLMB card manager.

## 2. Configure GitHub Pages

In the UFLMB GitHub repository, open **Settings → Secrets and variables → Actions → Variables** and add:

- `VITE_SUPABASE_URL` = the Supabase Project URL
- `VITE_SUPABASE_ANON_KEY` = the public publishable/anon key

These two values are designed to be public client configuration; the service-role key is not. Save the variables, then open **Actions → Deploy UFLMB to GitHub Pages → Run workflow**, or push a commit to trigger a build.

## 3. Use the app

- Open the live site and go to **Admin / data entry → Import / Export → Shared card database**.
- Sign in using the admin user created in Supabase.
- Click **Load shared records** before publishing. This protects against publishing an unreviewed local snapshot.
- Edit cards in the Card manager, then click **Publish local edits** to publish changes. The publish action synchronizes non-demo records and applies deletions since the last loaded snapshot.
- Public users can read shared records and submit ratings/reviews from a card's full profile.

The two-team demo fixture is local-only and is excluded from shared-database publishing.

## Security and operational notes

- Never add the Supabase service-role key to GitHub Pages variables or frontend code.
- The SQL grants card writes to authenticated users. Keep public sign-ups disabled and create only trusted admin accounts.
- Community review insertion is currently open to anonymous visitors for the initial test. Before a broad public launch, add CAPTCHA, rate limits, moderation/reporting and preferably verified-user controls.
- The daily GitHub Actions job audits the checked-in production starter dataset; it does not scrape third-party pages or change player ratings. Reliable automated content refresh needs a supported source/API and an explicit mapping/verification policy. Do not treat the audit as an automatic facts refresh.
- Shared background/branding settings are still browser-local; this backend currently covers cards and reviews.
