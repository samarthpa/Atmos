# Atmos research storage

Supabase/PostgreSQL tables and repeatable imports for the existing Atmos research.
No payment infrastructure or dashboard changes are included.

## Inspection and recovered data

`samarthpa/Atmos` had no commits or branches when inspected on November 9, 2026.
The user supplied these deployed dashboards instead:

- Property map: https://app-pearl-sigma-59.vercel.app/
- MCC directory: https://atmos-mcc-map.vercel.app/

The property app loads `/data/hotels.json`. The MCC directory embeds network
definitions and separately labeled Atmos estimates in a JavaScript asset.
Gzipped JSON snapshots are checked in under `data/research/snapshots/`.
`provenance.json` records URLs, retrieval timestamps in UTC, and SHA-256 hashes of
the uncompressed JSON. MCC JSON was decoded from the deployed asset's literal
`JSON.parse` arguments; no remote JavaScript was executed.

| Table | Prepared records | Identity |
| --- | ---: | --- |
| `research.properties` | 63,970 | Source dataset + OSM node/way/relation ID |
| `research.operators` | 1,274 | Source dataset + SHA-256 of trimmed exact operator label |
| `research.mccs` | 1,813 | Network dataset + four-character MCC |
| `research.property_estimates` | 0 | Source dataset + supplied stable estimate ID |
| `research.mcc_estimates` | 962 | Source dataset + MCC + estimate version |

There are **962 distinct MCCs**, with 938 Visa definitions and 875 Mastercard
definitions. Network-specific descriptions are retained separately. MCC `0742`
remains text throughout parsing, CSV preparation, and PostgreSQL storage.

## Setup

Requires Python 3.10+, and a Supabase project or PostgreSQL database with the
Supabase roles `anon` and `authenticated`. Run these commands from this repository:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
cp .env.example .env
```

Fill in `DATABASE_URL` in `.env` using the server-side PostgreSQL connection string
from Supabase's Connect panel. URL-encode special characters in the password and
keep TLS enabled. The importer needs a database-owner connection, or an explicitly
provisioned backend role with schema/table privileges and appropriate RLS access.
It does not use a public API key, browser key, or Supabase MCP OAuth token.
`.env` is ignored; the example contains placeholders only. Load it into your
process environment without printing its contents:

```bash
set -a
. ./.env
set +a
```

Quote the entire connection value in `.env` if it contains shell metacharacters.

Apply `supabase/migrations/20261110032316_create_research_tables.sql` once using Supabase's SQL
editor, or with the PostgreSQL CLI installed:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/20261110032316_create_research_tables.sql
```

The SQL migration is transactional and intentionally fails if the `research`
schema already exists; inspect and reconcile an existing schema instead of
overwriting it. Normal Supabase migration tooling can apply the same timestamped
file. Do not run both mechanisms against the same database. SQL-editor/psql
application does not register a Supabase CLI migration history entry.

Prepare, validate, and import:

```bash
python scripts/prepare_research.py
python scripts/import_research.py --dry-run data/research/prepared/*.manifest.json
python scripts/import_research.py data/research/prepared/*.manifest.json
```

Preparation checks the pinned snapshot hashes and requires no network access or
credentials. Generated CSVs are ignored by Git. Reusing the same snapshots creates
the same rows. All manifests passed to one import command are validated before
connecting, then written in one transaction in dependency order. Invalid foreign
keys or any failed insert roll back the entire transaction.

Upserts use `(source_dataset, source_record_id)`. Unchanged rows retain their
`created_at` and `updated_at`; changed rows retain `created_at` and update
`updated_at`. Reruns do not append records, delete missing source records, or
merge identities across different datasets. Distinct source IDs may still refer
to the same real-world hotel; no speculative geographic/name deduplication is
performed. Duplicate IDs within or across input manifests are rejected.

## Meaning, verification, and omissions

Properties and operators default to **unverified**. A verified record requires
both `verified_at` and `verification_reference`. This import verifies no records.
There are only 3,606 properties with operator labels; the other operator links
remain null. Operator labels are not proven legal entities, and brand or parent
brand is never substituted for operator. Exact spelling variants remain separate.

Property `source_payload` preserves these original source-reported attributes:
`id` (OSM ID), `n` (name), `op` (operator), `hn`/`st` (house number/street), `ci`
(city), `sa` (state), `co` (county), `pz` (postcode), `w` (website), `ph` (phone),
`em` (email), `rm` (rooms), `sr` (stars), `la`/`lo` (coordinates). Missing values
remain null; rooms and stars remain source strings. Country codes are left null
because no explicit country field was supplied. OSM records can be inspected at
`https://www.openstreetmap.org/<source_record_id>`.

The original snapshot also preserves brand/parent-brand, chain tier, service
model, segment, property type, brand/contact flags, and metro classifications
(`b`, `pc`, `ct`, `sm`, `sg`, `pt`, `br`, `sb`, `hc`, `cb`, `cy`). Their derivation
and verification evidence were not supplied, so they are deliberately not
promoted into property facts. They remain available in the source snapshot for
a later, evidence-backed classification mapping.

No property revenue, ADR, occupancy, spend estimates, calculation methods, or
financial observation periods were found. `property_estimates` is ready for
such inputs but is empty; no synthetic estimates or Hotelify fixtures are used.
Numeric estimates require a metric, finite decimal value, unit, methodology and
source reference; optional currency and period bounds are supported.

The MCC network payloads preserve titles, descriptions, included merchants and
network-specific metadata. They are source transcriptions, not independently
verified current network rules. The separate `mcc_estimates` table preserves the
site's `estimated: true` payload, score, bands, rationale, version, and other
assumptions. Null actual spend/share fields remain null. These are research
annotations, not transaction or payment-routing configuration. Browser-local
MCC tier drafts were not available and are not imported.

Source observation dates and original research generation dates were absent.
`source_observed_at` stays null; `source_retrieved_at` records retrieval, not
observation. `source_sha256` ties every imported row to a snapshot. Database
timestamps record insertion/change times. Property data carries the deployed
app's attribution to OpenStreetMap contributors (https://www.openstreetmap.org/copyright).
The full original source repositories and upstream MCC research files were not
provided; the deployed snapshots are the available evidence.

## Additional curated datasets

Create a manifest beside UTF-8 CSV files:

```json
{
  "data_kind": "research",
  "dataset_id": "stable-source-name",
  "files": {
    "operators": "operators.csv",
    "properties": "properties.csv",
    "property_estimates": "estimates.csv"
  }
}
```

Any subset of the five supported tables is accepted. Every CSV needs
`source_record_id` and `source_reference`; see `FIELDS` and `REQUIRED` in
`scripts/import_research.py` for the exact supported/required headers. Optional
columns omitted from a CSV become null (or the documented default): imports are
full source-record replacements, not partial patches. Dates use `YYYY-MM-DD`;
timestamps require an explicit timezone. Foreign references use both source
dataset and source record ID. IDs must be stable between exports; do not derive
property identity from CSV row position or mutable names. Keep a dataset's
identity constant for corrections; use a new estimate ID for a new version or
period you intend to retain.

Hotelify fictional files belong in `data/demo/`. Research manifests must declare
`data_kind: research`; demo manifests, demo-directory paths and Hotelify-labeled
rows are rejected. These checks cannot prove an arbitrary input is authentic:
source curation remains required. No demo rows are seeded into research tables.

## Access and dashboards

The migration creates only a new private `research` schema. All tables enable
RLS and revoke browser-role/public access. No policies expose research through
the dashboard API. Existing deployments, frontend source, public tables and
payment systems are untouched. Dashboard integration is a separate future task.

## Validation

```bash
python -m unittest discover -s tests -v
```

Database tests are skipped unless `TEST_DATABASE_URL` points at an **empty,
disposable** PostgreSQL-compatible database. They create the schema and test the
entire prepared import twice, updates, rollback, leading zeros, and role access:

```bash
TEST_DATABASE_URL='postgresql://postgres@localhost:5432/atmos_test' python -m unittest discover -s tests -v
```

Do not use the production database for tests. Tests intentionally leave the test
schema in place; recreate the disposable database before another integration run.

Implementation validation: all eight tests passed against an isolated local
PGlite PostgreSQL-compatible server, including the full dataset twice. This does
not substitute for validation on the actual hosted Supabase project.

## Hosted deployment status

The Supabase plugin successfully authenticated to project `acgqepvaxmjgecdflzlz`.
Migration `20261110032316_create_research_tables` is applied and all prepared
records were imported. The local migration filename matches the hosted history.
Do not apply it again to this project. See `DEPLOYMENT.md` for verification and
advisory results. The earlier standalone Codex CLI OAuth connection failed;
plugin authentication was sufficient, and no password or API secret was needed
for this deployment. Direct Python imports still require `DATABASE_URL`.

For authenticated MCP imports without direct database credentials, export SQL:

```bash
python scripts/export_sql_batches.py data/research/prepared/*.manifest.json --output data/research/prepared/sql --batch-size 500
```

Submit the SQL files listed in `batches.json` in order using the connected
Supabase `execute_sql` tool. Each batch is one transaction and reports the number
of changed rows; the full multi-call import is not atomic. If interrupted,
rerun the listed batches: unchanged records are skipped. Verify final totals
against the table above. For whole-import atomicity use `import_research.py`.
Only process filenames in `batches.json`, since an output folder can contain
older batches from previous exports. Never load these files using server-side
filesystem or OS-command SQL.
