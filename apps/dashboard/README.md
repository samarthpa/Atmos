# Atmos dashboard

A functional hotel finance workspace based on the existing Atmos dashboard. Built with Next.js, React, TypeScript, Tailwind, Radix, TanStack Table, Recharts, and Supabase.

## Run locally

Requires Node.js 22+ and npm. From this directory:

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Open http://127.0.0.1:3100. The fictional Hotelify demo works without Supabase. Supply your project's public URL and **publishable** key in `.env.local` to enable live workspaces. Never add a secret or service-role key to a `NEXT_PUBLIC_` variable. Environment files are ignored; `.env.example` contains placeholders only.

```sh
npm test
npm run typecheck
npm run build
```

The static build is written to `out/`. Deploy it with directory-index support. For Vercel, select `apps/dashboard` as the project root and provide the two public environment variables at build time. Existing dashboard deployments are not overwritten.

## Working features

- Search, filter, sort, paginate, inspect and export card transactions in the fictional demo.
- Create properties, vendors, bill drafts and expenses; submit, approve or reject bills.
- Attach PDF/JPG/PNG documents up to 10 MB to bills and view their activity history.
- Property-scoped totals, spending charts, CSV exports, statement exports, and demo card freeze/unfreeze controls.
- Mobile navigation, keyboard-accessible dialogs, command search and clear loading/error/empty states.
- Demo edits persist in this browser. Demo documents live in IndexedDB. Resetting the demo resets records; it does not remove orphaned document blobs from browser storage.
- Live organization records persist in Supabase, isolated by database row-level policies. Bill transitions and immutable approved amounts are enforced by PostgreSQL, including direct API requests.

## Supabase setup

Use the repository's `supabase/migrations` in order. The operational migrations create `public.atmos_organizations`, `atmos_members`, `atmos_properties`, `atmos_vendors`, `atmos_bills`, `atmos_expenses`, `atmos_documents`, and `atmos_activity`, private authorization helpers, and the private `atmos-documents` bucket.

The dashboard migrations are already applied to project `acgqepvaxmjgecdflzlz`. For another project, apply the tracked migrations through the Supabase CLI or SQL editor. Do not replay already-applied migrations on the same project.

1. Enable Supabase email/password authentication.
2. Set the Auth Site URL to your deployment, and allow the exact `/settings/` confirmation redirect for it and any local development origin. For the private preview: `https://atmos-finance-workspace.samarthpa.chatgpt.site/settings/`.
3. Configure an email sender for reliable confirmation mail. The app does not disable email confirmation.
4. Choose **Your live workspace** from the Hotelify menu, sign up or sign in, then create your organization. Create a property and vendor before adding bills.
5. Additional members must already have Supabase Auth accounts. An authorized administrator can provision `atmos_members` with the organization ID, user ID and role using trusted administration tools. Roles: `admin`, `approver`, `member`, `viewer`; ownership is on the organization. There is no invitation-email or membership-editing UI yet.

The app selects the first organization a user belongs to. A multi-organization selector is not implemented. Data is fetched in batches and sorted/paginated in the browser; very large operational workspaces will need server-side filtering and aggregate queries.

Approval is permission-based, not a two-person approval policy: an owner/admin/approver can approve their own submitted bill. Viewers cannot write; members can create and submit but cannot approve/reject. Audit records are inserted by database triggers and are read-only to clients. No browser user has delete privileges on operational tables.

## Data boundaries

`lib/demo.ts` contains only fictional Hotelify activity and example contacts. It is never uploaded into Supabase. The live dashboard starts empty. Existing `research.*` datasets, provenance, MCC text codes and estimates remain separate and private; they are not read or modified by this dashboard. Existing dashboards and imports remain intact.

The app stores USD amounts as integer cents. A bill is **approved**, never marked paid. Payment, card and credit information in demo mode is explicitly illustrative.

## Integration boundary and limitations

Stripe, bank connections, card issuing, accounting sync and invitation emails are not connected. No dashboard action transfers funds. A future Stripe integration should use a server-side API/webhook service, signature verification, idempotency and reconciliation; this static frontend must never hold Stripe secret keys. The existing Next.js app can later be deployed with a server runtime for that work.

The public Supabase connection is configured for the private preview. No user's login credentials were supplied or created during development; real email confirmation and signed-in browser onboarding still require verification with an actual account. Database authorization and approval workflows were tested using temporary fixtures within a rolled-back transaction.

## Validation

- `npm test`: money precision/invalid inputs, allowed approval transitions, CSV formula escaping, and demo relationship consistency.
- Production build and TypeScript check.
- Browser QA: filtering, vendor creation, draft creation → submit → approve, persistence after reload, navigation and mobile layout.
- `supabase/tests/dashboard_access.sql` in the repository: run with a privileged development connection; verifies role restrictions, immutable approved amounts, creator attribution, audit history, tenant isolation and anonymous denial, then rolls back all fixtures.

The Supabase advisor reports intentional no-policy RLS on private research tables and a pre-existing warning about the platform's `public.rls_auto_enable()` event-trigger function. This dashboard does not modify that platform function. See [Supabase advisor details](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable).
