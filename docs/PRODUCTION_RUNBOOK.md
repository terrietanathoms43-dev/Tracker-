# Trackwise — Production operations and recovery

This runbook covers the production app `https://tracker-virid-nine.vercel.app` and its existing Supabase project `lyxozmoqkljaflofupcs`. It does **not** authorize deleting or replacing either project.

## Weekly checks (free)
1. Review the last production build in Vercel and the `Trackwise quality checks` GitHub workflow.
2. Check Supabase database Security and Performance Advisors; investigate new warnings.
3. Test sign-in, invitation acceptance, task creation, task completion and project creation using nonproduction test accounts **in a disposable organization**. Do not leave production test records behind.
4. Check Storage file downloads with two team members. The `trackwise-task-files` bucket is private. Never make it public to fix sharing.
5. Save an **offline, encrypted database backup**; see below. Never add SQL dumps, exported user information, connection strings, or Supabase service-role keys to GitHub.

## Authentication URL configuration (Supabase dashboard)
Go to Authentication → URL Configuration in Supabase and verify:
- Site URL: `https://tracker-virid-nine.vercel.app`
- Redirect URLs: `https://tracker-virid-nine.vercel.app/**`

Test confirmation and password-reset emails in a private browser session. Auth settings are not controlled by the GitHub repository. If a link redirects to `localhost`, update the Supabase URL configuration.

In Authentication → Providers → Email, maintain a suitable password-length requirement (at least 8 characters). Supabase's *leaked-password protection* is available on **Pro and above** according to [Supabase's official documentation](https://supabase.com/docs/guides/auth/password-security). Do not purchase or enable a paid plan without explicit approval; the scanner will continue reporting this warning on free plans.

## Database backups on free plans
Supabase's [backup guide](https://supabase.com/docs/guides/platform/backups) recommends that **Free projects export data regularly**: daily managed backups are for paid plans. The GitHub repository contains the app source and some migrations, **not** your users' saved records.

On a trusted computer with the Supabase CLI and Docker installed, run:

```sh
bash scripts/backup-trackwise.sh
```

The script prompts for the **production database connection string** and produces role, schema and data exports in `backups/`, locally only. Find the connection string using the *Connect* button in the Supabase project dashboard. Preserve the export on encrypted storage separate from your computer and test restoring onto a **disposable** database. Never restore a dump directly over production without a reviewed recovery plan.

**Important:** SQL dumps contain sensitive accounts and organization data and must never be uploaded to a public repository. Supabase Storage *file contents* are NOT included in SQL backups; back up files from the private `trackwise-task-files` bucket separately using an authorized account.

The script documents a repeatable export procedure; it is **not** an automatic remote backup or a promise that a backup has already been created.

## Incident response
- Deployment fails: look at the latest Vercel build logs and GitHub Actions checks. Do not alter the database blindly to make compilation pass.
- Tasks appear missing: verify the signed-in user, active organization, membership, and filters; then inspect RLS and network errors. Avoid deleting or recreating any tables.
- Invitation/confirmation fails: inspect email address, expiry, site URL and redirect allow-list. Share secure invitation links, not login credentials.
- Unauthorized access: disable the affected membership, review the organization activity log and Supabase logs, and rotate exposed credentials (if any).
- Restore or schema rollback: first take a verified backup, identify the last safe migration and test a restore using a separate database. Avoid reversing migrations that may erase records.

## Roles and permissions
Administrators/leaders manage projects and tasks; assigned members update their tasks and submit for approval; stakeholders and observers are read-only for task mutations. A removed member loses workspace access but historical task comments and audit records remain.

Privileged `tw_*` RPCs are intentionally marked `SECURITY DEFINER` because they perform permission-checked server actions. Supabase flags these for **manual review** rather than indicating that every function is exploitable. Audit grants and role checks when editing functions.

## Change validation
Run `npm run lint`, `npm test`, and `npm run build` locally, or confirm the GitHub Actions `Trackwise quality checks` workflow passed before approving any release. Use separate administrator/member/observer accounts for a final real-device check.
