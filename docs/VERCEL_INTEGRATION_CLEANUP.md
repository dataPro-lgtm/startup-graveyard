# Vercel integration cleanup

Repeated Vercel projects connected to the same GitHub repository create duplicate commit statuses and failure email noise. Cleanup is an external control-plane operation and must preserve the canonical production project, domains, and environment variables.

## Safe cleanup order

1. In Vercel, list every project whose Git repository is `dataPro-lgtm/startup-graveyard`.
2. Select one canonical project. Record its production domains, root directory, framework preset, build command, environment variables, deployment protection, and team ownership.
3. Verify the canonical project can deploy the current `main` commit and is the only Vercel check required by GitHub branch protection.
4. For each duplicate project, disconnect the Git repository first. Confirm a new test commit creates no status from that project.
5. Remove duplicate GitHub required checks only after their projects are disconnected. Keep the canonical check and `CI OK` required.
6. Delete duplicate Vercel projects only after their domains and secrets have been confirmed absent or migrated.
7. In Vercel notification settings, keep failed-production notifications for the canonical project and disable redundant preview failure email subscriptions.

## Acceptance

- One GitHub push creates exactly one Vercel deployment status.
- `main` promotion requires repository `CI OK` plus the canonical Vercel production check.
- No production domain points to a disconnected project.
- The canonical project has documented owners and environment-variable rotation responsibility.

Never bulk-delete projects before exporting configuration. Project deletion is irreversible and is intentionally not automated by this repository.
