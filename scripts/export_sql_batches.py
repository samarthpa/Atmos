#!/usr/bin/env python3
"""Export validated records as resumable SQL batches for authenticated MCP import.

Each batch is atomic; rerun all batches to recover from interruption. For one
transaction spanning every file, use import_research.py with DATABASE_URL.
"""
import argparse
import hashlib
import json
from pathlib import Path
from import_research import FIELDS, load_manifest


def batch_sql(table, rows):
    if table not in FIELDS:
        raise ValueError('unsupported table')
    columns = ['source_dataset'] + sorted(FIELDS[table])
    mutable = [c for c in columns if c not in ('source_dataset', 'source_record_id')]
    records = []
    for row in rows:
        record = dict(row)
        if 'source_payload' in record:
            record['source_payload'] = json.loads(record['source_payload'])
        records.append(record)
    # JSON is a SQL literal, not executable SQL. Double SQL quote characters;
    # standard_conforming_strings prevents backslash interpretation.
    payload = json.dumps(records, ensure_ascii=False, allow_nan=False).replace("'", "''")
    names = ', '.join(columns)
    updates = ', '.join(f'{c}=excluded.{c}' for c in mutable)
    old = ', '.join(f'current.{c}' for c in mutable)
    new = ', '.join(f'excluded.{c}' for c in mutable)
    return f"""begin;
set local standard_conforming_strings = on;
with changed as (
  insert into research.{table} as current ({names})
  select {names} from jsonb_populate_recordset(null::research.{table}, '{payload}'::jsonb)
  on conflict (source_dataset, source_record_id) do update set {updates}
  where ({old}) is distinct from ({new})
  returning 1
)
select count(*) as changed_rows from changed;
commit;
"""


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('manifest', type=Path, nargs='+')
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--batch-size', type=int, default=250)
    args = parser.parse_args()
    if args.batch_size < 1:
        parser.error('--batch-size must be positive')
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
    args.output.mkdir(parents=True, exist_ok=True)
    batches = []
    for table, rows in tables.items():
        for start in range(0, len(rows), args.batch_size):
            batch = rows[start:start + args.batch_size]
            statement = batch_sql(table, batch)
            name = f'{len(batches):05d}-{table}.sql'
            (args.output / name).write_text(statement)
            batches.append(dict(file=name, table=table, rows=len(batch),
                sha256=hashlib.sha256(statement.encode()).hexdigest()))
    (args.output / 'batches.json').write_text(json.dumps(batches, indent=2) + '\n')
    print(json.dumps({'batches': len(batches), 'counts': {t: len(r) for t, r in tables.items()}}))


if __name__ == '__main__':
    main()
