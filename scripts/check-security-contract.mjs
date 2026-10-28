import fs from 'node:fs'

const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8')
const checks = [
  {
    name: 'anonymous review inserts are revoked in the tracked migration',
    pass: /DROP POLICY IF EXISTS "Public can submit reviews"/i.test(read('../supabase/migrations/20261028213944_authenticated_only_community_reviews_and_fk_indexes.sql'))
      && /REVOKE INSERT ON public\.card_reviews FROM anon/i.test(read('../supabase/migrations/20261028213944_authenticated_only_community_reviews_and_fk_indexes.sql'))
      && /FOR INSERT TO authenticated/i.test(read('../supabase/migrations/20261028213944_authenticated_only_community_reviews_and_fk_indexes.sql')),
  },
  {
    name: 'review inserts are bound to the current account and profile username',
    pass: /user_id = \(SELECT auth\.uid\(\)\)/i.test(read('../supabase/migrations/20261028213944_authenticated_only_community_reviews_and_fk_indexes.sql'))
      && /p\.username = reviewer_name/i.test(read('../supabase/migrations/20261028213944_authenticated_only_community_reviews_and_fk_indexes.sql')),
  },
  {
    name: 'review UI hides the composer from guests and sends the signed-in identity',
    pass: /!account\s*\?/i.test(read('../src/components/CommunityReviews.tsx'))
      && /account\.accessToken/i.test(read('../src/components/CommunityReviews.tsx'))
      && /user_id:\s*account\.userId/i.test(read('../src/components/CommunityReviews.tsx'))
      && /Sign in to a registered UFLMB account/i.test(read('../src/components/CommunityReviews.tsx')),
  },
  {
    name: 'suspension status verification fails closed',
    pass: (() => {
      const auth = read('../src/components/AuthAccess.tsx')
      const start = auth.indexOf('async function isAccountSuspended')
      const end = auth.indexOf('async function restoreSession', start)
      const fn = auth.slice(start, end)
      return start >= 0 && end > start && /if \(!response\.ok\) throw new Error/.test(fn)
        && !/if \(!response\.ok\) return false/.test(fn)
        && /typeof result\.suspended !== 'boolean/.test(fn)
    })(),
  },
  {
    name: 'support message creation requires authenticated role at the database layer',
    pass: /Users create own support conversations[\s\S]*?for insert to authenticated/i.test(read('../supabase/migrations/20261028202122_support_chat.sql'))
      && /Users send messages in own support conversations[\s\S]*?for insert to authenticated/i.test(read('../supabase/migrations/20261028202122_support_chat.sql')),
  },
  {
    name: 'account moderation verifies admin privileges and protects admin/self targets',
    pass: /Administrator authorization is required/i.test(read('../supabase/functions/account-moderation/index.ts'))
      && /target\.id === actor\.id/i.test(read('../supabase/functions/account-moderation/index.ts'))
      && /if \(targetAdmin\)/i.test(read('../supabase/functions/account-moderation/index.ts')),
  },
  {
    name: 'backend deployment includes account moderation function',
    pass: /functions deploy account-moderation/i.test(read('../.github/workflows/supabase-deploy.yml')),
  },
]

const failed = checks.filter(check => !check.pass)
for (const check of checks) console.log(`${check.pass ? 'PASS' : 'FAIL'} - ${check.name}`)
if (failed.length) process.exit(1)
console.log(`Security contract checks passed: ${checks.length}/${checks.length}`)
