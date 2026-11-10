#!/usr/bin/env python3
"""Validate curated CSVs, then atomically upsert research records."""
import argparse
import csv
import json
import os
from pathlib import Path
import re
import sys
from decimal import Decimal, InvalidOperation
from datetime import date, datetime

COMMON = {'source_record_id', 'source_reference', 'source_observed_at', 'source_retrieved_at', 'source_sha256'}
VERIFICATION = {'verification_status', 'verified_at', 'verification_reference'}
FIELDS = {
    'operators': COMMON | VERIFICATION | {'name'},
    'mccs': COMMON | {'code', 'description', 'source_payload'},
    'properties': COMMON | VERIFICATION | {
        'name', 'address', 'city', 'country_code', 'operator_dataset', 'operator_record_id', 'source_payload'},
    'property_estimates': COMMON | {
        'property_dataset', 'property_record_id', 'metric', 'value', 'unit',
        'currency_code', 'period_start', 'period_end', 'methodology'},
    'mcc_estimates': COMMON | {'code', 'version', 'source_payload'},
}
REQUIRED = {
    'operators': {'name'}, 'mccs': {'code', 'description'},
    'properties': {'name'},
    'property_estimates': {'property_dataset', 'property_record_id', 'metric',
                           'value', 'unit', 'methodology'},
    'mcc_estimates': {'code', 'version', 'source_payload'},
}


def validate(table, row):
    for field in REQUIRED[table] | {'source_record_id', 'source_reference'}:
        if not row.get(field):
            raise ValueError(f'{table}: missing {field}')
    for field, pattern in [('code', r'[0-9]{4}'), ('country_code', r'[A-Z]{2}'),
                           ('currency_code', r'[A-Z]{3}')]:
        if row.get(field) and not re.fullmatch(pattern, row[field]):
            raise ValueError(f'{table}: invalid {field}')
    for field in ('source_observed_at', 'source_retrieved_at', 'verified_at'):
        if row.get(field):
            parsed = datetime.fromisoformat(row[field].replace('Z', '+00:00'))
            if parsed.tzinfo is None:
                raise ValueError(f'{field} must include a timezone')
    for field in ('period_start', 'period_end'):
        if row.get(field):
            date.fromisoformat(row[field])
    if row.get('period_start') and row.get('period_end'):
        if row['period_end'] < row['period_start']:
            raise ValueError('period_end precedes period_start')
    if 'verification_status' in row:
        row['verification_status'] = row['verification_status'] or 'unverified'
        if row['verification_status'] not in ('unverified', 'verified'):
            raise ValueError('invalid verification_status')
        if row['verification_status'] == 'verified' and not (
                row.get('verified_at') and row.get('verification_reference')):
            raise ValueError('verified records require timestamp and evidence reference')
    if bool(row.get('operator_dataset')) != bool(row.get('operator_record_id')):
        raise ValueError('operator reference requires both dataset and record ID')
    if table == 'property_estimates':
        try:
            if not Decimal(row['value']).is_finite():
                raise ValueError('estimate value must be finite')
        except InvalidOperation as exc:
            raise ValueError('invalid numeric estimate') from exc
    if 'source_payload' in row:
        payload = json.loads(row['source_payload'] or '{}')
        if not isinstance(payload, dict):
            raise ValueError('source_payload must be a JSON object')
        if table == 'mcc_estimates' and payload.get('estimated') is not True:
            raise ValueError('MCC estimates must be explicitly marked estimated')
        row['source_payload'] = json.dumps(payload, ensure_ascii=False)


def load_manifest(path):
    path = Path(path).resolve()
    manifest = json.loads(path.read_text())
    if manifest.get('data_kind') != 'research':
        raise ValueError('only explicitly classified research manifests are accepted')
    dataset = manifest.get('dataset_id')
    if not isinstance(dataset, str) or not dataset.strip() or dataset != dataset.strip():
        raise ValueError('dataset_id must be a nonempty stable string without outer whitespace')
    if 'hotelify' in dataset.casefold():
        raise ValueError('Hotelify belongs in demo data')
    files = manifest.get('files')
    if not isinstance(files, dict) or not files or set(files) - FIELDS.keys():
        raise ValueError('files must map supported table names to CSV paths')
    result = {}
    for table in FIELDS:  # Dependency order, regardless of manifest order.
        if table not in files:
            continue
        source = (path.parent / files[table]).resolve()
        if any(p.casefold() in ('demo', 'hotelify') for p in source.parts):
            raise ValueError('demo paths cannot be imported into research')
        with source.open(newline='', encoding='utf-8-sig') as stream:
            reader = csv.DictReader(stream)
            headers = reader.fieldnames or []
            required = REQUIRED[table] | {'source_record_id', 'source_reference'}
            if len(headers) != len(set(headers)) or set(headers) - FIELDS[table]:
                raise ValueError(f'{table}: duplicate or unsupported CSV headers')
            if not required <= set(headers):
                raise ValueError(f'{table}: required headers missing')
            rows, seen, codes = [], set(), set()
            for number, raw in enumerate(reader, 2):
                if None in raw or any(v is None for v in raw.values()):
                    raise ValueError(f'{table}:{number}: malformed CSV row')
                row = {k: (raw.get(k, '').strip() or None) for k in FIELDS[table]}
                validate(table, row)
                if any('hotelify' in (v or '').casefold() for v in row.values()):
                    raise ValueError(f'{table}:{number}: Hotelify demo content detected')
                key = row['source_record_id']
                if key in seen:
                    raise ValueError(f'{table}:{number}: duplicate source_record_id')
                seen.add(key)
                if table == 'mccs':
                    if row['code'] in codes:
                        raise ValueError(f'{table}:{number}: duplicate MCC code')
                    codes.add(row['code'])
                row['source_dataset'] = dataset
                rows.append(row)
            result[table] = rows
    return result


def apply_rows(connection, tables):
    from psycopg import sql
    from psycopg.types.json import Jsonb
    with connection.transaction():
        for table, rows in tables.items():
            columns = ['source_dataset'] + sorted(FIELDS[table])
            mutable = [c for c in columns if c not in ('source_dataset', 'source_record_id')]
            query = sql.SQL('''insert into research.{table} as current ({columns})
                values ({values}) on conflict (source_dataset, source_record_id)
                do update set {updates}
                where ({old}) is distinct from ({new})''').format(
                table=sql.Identifier(table),
                columns=sql.SQL(', ').join(map(sql.Identifier, columns)),
                values=sql.SQL(', ').join(sql.Placeholder() for _ in columns),
                updates=sql.SQL(', ').join(
                    sql.SQL('{c} = excluded.{c}').format(c=sql.Identifier(c)) for c in mutable),
                old=sql.SQL(', ').join(sql.SQL('current.{}').format(sql.Identifier(c)) for c in mutable),
                new=sql.SQL(', ').join(sql.SQL('excluded.{}').format(sql.Identifier(c)) for c in mutable))
            with connection.cursor() as cursor:
                cursor.executemany(query, [[Jsonb(json.loads(row[c])) if c == 'source_payload'
                                           else row[c] for c in columns] for row in rows])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('manifest', type=Path, nargs='+')
    parser.add_argument('--dry-run', action='store_true')
    args = parser.parse_args()
    try:
        tables = {table: [] for table in FIELDS}
        seen = set()
        for manifest in args.manifest:
            for table, rows in load_manifest(manifest).items():
                for row in rows:
                    key = (table, row['source_dataset'], row['source_record_id'])
                    if key in seen:
                        raise ValueError('duplicate source identity across manifests')
                    seen.add(key)
                tables[table].extend(rows)
        print(json.dumps({t: len(rows) for t, rows in tables.items()}, sort_keys=True))
        if args.dry_run:
            print('Validation passed; no database connection made. Foreign keys checked on import.')
            return
        url = os.environ.get('DATABASE_URL')
        if not url:
            raise ValueError('DATABASE_URL is required for import')
        import psycopg
        with psycopg.connect(url) as connection:
            apply_rows(connection, tables)
        print('Research import committed.')
    except (ValueError, OSError) as exc:
        print(f'Import failed: {exc}', file=sys.stderr)
        sys.exit(1)
    except Exception:
        # Avoid emitting connection strings, credentials or source row contents.
        print('Database import failed; transaction rolled back. Check credentials, migration, '
              'constraints and referenced IDs.', file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()
