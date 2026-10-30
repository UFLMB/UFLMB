# UFLMB retention and deletion review

Status: internal proposal only — not an approved retention policy and not implemented.

This document records the current implementation findings and a conservative proposal for a future retention schedule. The periods below are decision options for the operator and require a documented necessity assessment (and Hungarian/EU privacy review) before being published or enforced.

## Verified implementation findings

- There is no self-service account deletion control in the current UI. Account deletion is an administrator-only action through the `account-moderation` Edge Function.
- Deleting an Auth user cascades to the user's profile, preferences, support conversations/messages and received warnings.
- Before the pending code change is deployed, `card_reviews.user_id` uses `ON DELETE SET NULL`, and the review row retains `reviewer_name`, `review_text`, rating and timestamp.
- The pending `account-moderation` update snapshots a target member's review and moderation rows, changes public `reviewer_name` to `Deleted member`, sets review `user_id` to null, and clears moderation queue `display_name`, `content_excerpt`, `admin_note` and `user_id` before deleting the Auth account. If Auth deletion fails, it attempts to restore the snapshots. This still does not guarantee anonymity of free-text review content or the internal audit record.
- `account_moderation_audit` deliberately retains the target user ID and username for accountability; this remains personal data and requires a justified retention period.
- `account_moderation_audit` retains the target user ID, target username, administrator ID, reason, outcome and timestamps. It has no FK cascade to the deleted account.
- `moderation_queue`, `user_warnings` and `account_moderation_audit` have no configured age-based purge job. The production database does not currently have the `pg_cron` extension installed; querying `cron.job` returned that the relation does not exist.
- The moderation queue stores copied display-name and content-excerpt data, so deleting or editing the source review alone would not necessarily clear the moderation copy.
- The public Privacy Notice must not describe the retained review as anonymous while `reviewer_name` remains.

## Proposed retention matrix — pending operator/legal approval

| Data category | Proposed rule to evaluate | Deletion/anonymisation action required |
|---|---|---|
| Active account, profile and preferences | Keep while the account is active; process verified erasure requests without undue delay unless a documented exception applies. Do not auto-delete merely for inactivity without a separate notice and reactivation process. | Delete Auth user and related profile/preferences; check Storage ownership and all non-cascading references. |
| Support conversations and messages | Keep while open; after closure, consider 12 months as a starting point, with a documented legal-hold/dispute exception. | Delete or irreversibly redact conversation and message bodies after expiry; do not retain whole message content solely as an audit trail. |
| Published community reviews | Keep while the member chooses to publish them. On account erasure, pending implementation: preserve rating and review text, replace the display name with `Deleted member`, and detach the user ID. Review text must still be checked for identifying details when an erasure request is received. | Update `card_reviews.reviewer_name` to `Deleted member` and set `user_id` null while preserving rating/text; manually assess identifying free text on erasure requests. |
| Moderation queue | Pending items: retain only while actively under review. Resolved/dismissed/actioned items: consider 12 months after resolution as a starting point. | On account deletion, clear copied `display_name`, `content_excerpt` and `admin_note`, and detach `user_id`; delete expired queue rows under an approved schedule. |
| User warnings | Keep active warnings while they have a current safety purpose. After expiry/acknowledgement and closure, consider 12 months as a starting point. | Add a defined expiry/review rule; delete or minimise expired warnings. Current schema has no `expires_at` field. |
| Account moderation audit | Consider 24 months after completed action as a starting point, subject to a documented balancing test and any legal claims/holds. | Retain only fields needed to demonstrate action integrity; consider pseudonymising target identifiers and minimising free-text reasons after the operational need ends. |
| Provider security/hosting logs and backups | Follow each provider's current contractual/configured retention; do not invent a single UFLMB-controlled duration. | Document provider, data categories, region/transfer safeguards, retention and deletion limitations in a processor register. |

The suggested 12- and 24-month periods are not statutory defaults or legal requirements. They are starting points for a reasoned decision and may be shortened or extended where the actual purpose and legal basis justify it.

## Required implementation work after approval

1. Add a user-facing, verified account deletion/request workflow (or clearly document and staff the current support-based process).
2. Decide whether a deleted member's public reviews are removed or truly de-identified. Ensure the display name is addressed, not only `user_id`.
3. Ensure moderation queue copies are redacted/deleted consistently when the source content is erased or anonymised.
4. Add explicit expiry metadata or a deterministic retention rule for warnings and moderation records.
5. Implement scheduled cleanup only after the retention matrix is approved. The current project has no `pg_cron` installation or `cron.job` schedule. Choose a low-cost supported scheduler only after verifying plan availability and cost; do not enable a paid feature by default.
6. Define audit-log minimisation and legal-hold handling before any purge job is enabled.
7. Verify deletion behaviour, including FK cascades, queue copies, storage objects, provider logs and backups, with test accounts before release.
8. Update the public Privacy Notice only after the schedule is approved and the actual cleanup mechanism has been tested.

## Safety boundary

No live database schema, data, Edge Function, project setting, scheduled job or production deployment was changed during this review. This document is a proposal for review, not an instruction to run destructive SQL.
