# Hosted research import

Deployed on November 9, 2026 (America/New_York), using the authenticated Supabase
plugin. Project: `acgqepvaxmjgecdflzlz`.

Migration recorded by Supabase: `20261110032316_create_research_tables`.
The timestamp is UTC. The local migration filename matches the hosted version.

## Verified results

| Research table | Hosted rows |
| --- | ---: |
| properties | 63,970 |
| operators | 1,274 |
| mccs | 1,813 |
| mcc_estimates | 962 |
| property_estimates | 0 |

- 962 distinct MCCs across 938 Visa and 875 Mastercard definitions.
- `0742` is preserved as text in both network datasets.
- 3,606 properties have operator references; none are marked verified.
- No property or MCC definition lacks its source URL, snapshot hash, or retrieval timestamp.
- All 962 MCC estimate payloads have `estimated: true`.
- One 500-row batch from each populated table was rerun on the hosted database:
  all four returned `changed_rows: 0`.
- All five research tables have RLS enabled. Both `anon` and `authenticated`
  lack schema usage and table SELECT privileges.
- Public table count remains zero. No frontend deployment was changed.

137 client-supplied SQL batches were applied in dependency order. Each batch was
transactional; no server-side filesystem or OS commands were used. The whole
multi-call import was not a single transaction. The final counts above confirm
completion. Repeatable batch generation is in `scripts/export_sql_batches.py`.

No property financial estimates were supplied, so that table is deliberately
empty. Hotelify fictional data was not imported. Source-generation dates and
verification evidence remain unavailable, as detailed in the README.

## Advisor review

The security advisor returned informational “RLS Enabled No Policy” findings
for the five research tables. This is intentional for private, backend-only
research storage: no browser access is granted.
[Advisor explanation](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)

It also flagged the existing `public.rls_auto_enable()` function's execution
grants for `anon` and `authenticated`. Inspection confirmed this is a
`SECURITY DEFINER` function returning `event_trigger`; it was not created by this
migration. Its grants and implementation were left unchanged because it is
outside the research schema. The advisor's generic RPC warning should be reviewed
in that event-trigger context before changing existing project configuration.
[Anonymous-role finding](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable)
[Authenticated-role finding](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable)

The performance advisor reported an unused foreign-key index on
`property_estimates`. It is retained because the table currently has no rows
and the index supports future property joins.
[Advisor explanation](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index)

## Credentials and source control

Hosted deployment used plugin authentication. No database password or API secret
was written into the repository. Direct Python imports require a server-side
`DATABASE_URL`; the separate standalone Codex CLI login was not repaired.

Code and source snapshots are maintained in the `main` branch of
[samarthpa/Atmos](https://github.com/samarthpa/Atmos). Generated CSVs, SQL batches,
virtual environments, and credentials are excluded from Git.
