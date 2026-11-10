#!/usr/bin/env python3
"""Convert the preserved deployed-site snapshots into deterministic import CSVs."""
import csv
import gzip
import hashlib
import json
from pathlib import Path
from import_research import FIELDS

ROOT = Path(__file__).resolve().parents[1]
SNAPSHOTS = ROOT / 'data/research/snapshots'
OUTPUT = ROOT / 'data/research/prepared'


def operator_id(name):
    # Exact source labels; never infer ownership from brand or merge similar names.
    return hashlib.sha256(name.strip().encode()).hexdigest()


def prepare():
    provenance = json.loads((SNAPSHOTS / 'provenance.json').read_text())
    OUTPUT.mkdir(parents=True, exist_ok=True)

    def read(name):
        raw = gzip.decompress((SNAPSHOTS / f'{name}.json.gz').read_bytes())
        if hashlib.sha256(raw).hexdigest() != provenance[name]['sha256']:
            raise ValueError(f'snapshot checksum mismatch: {name}')
        return json.loads(raw)

    def source(name):
        p = provenance[name]
        return dict(source_reference=p['url'], source_retrieved_at=p['retrieved_at'],
                    source_sha256=p['sha256'])

    def write(dataset, tables):
        files = {}
        for table, rows in tables.items():
            filename = f'{dataset}-{table}.csv'
            with (OUTPUT / filename).open('w', newline='', encoding='utf-8') as stream:
                writer = csv.DictWriter(stream, fieldnames=sorted(FIELDS[table]))
                writer.writeheader()
                writer.writerows(rows)
            files[table] = filename
        (OUTPUT / f'{dataset}.manifest.json').write_text(json.dumps({
            'data_kind': 'research', 'dataset_id': dataset, 'files': files}, indent=2) + '\n')

    hotels = read('hotels')
    expected = ['id', 'n', 'b', 'pc', 'ct', 'sm', 'sg', 'pt', 'br', 'sb', 'hc',
                'op', 'hn', 'st', 'ci', 'sa', 'co', 'pz', 'cb', 'cy', 'w', 'ph',
                'em', 'rm', 'sr', 'la', 'lo']
    if hotels['fields'] != expected:
        raise ValueError('hotel field layout changed; review mapping before import')
    properties, operators = [], {}
    dataset = 'atmos-property-map'
    for values in hotels['rows']:
        if len(values) != len(expected):
            raise ValueError('invalid compact hotel row')
        row = dict(zip(expected, values))
        operator = row['op'].strip() if row['op'] else None
        if operator:
            operators.setdefault(operator, dict(source('hotels'),
                source_record_id=operator_id(operator), name=operator,
                verification_status='unverified'))
        # Preserve source-reported attributes without promoting derived segment,
        # brand matching, chain tier or service-model classifications to facts.
        factual = {key: row[key] for key in
                   ['id', 'n', 'op', 'hn', 'st', 'ci', 'sa', 'co', 'pz', 'w', 'ph',
                    'em', 'rm', 'sr', 'la', 'lo']}
        properties.append(dict(source('hotels'), source_record_id=row['id'], name=row['n'],
            address=' '.join(str(row[k]) for k in ['hn', 'st'] if row[k]) or None,
            city=row['ci'], operator_dataset=dataset if operator else None,
            operator_record_id=operator_id(operator) if operator else None,
            verification_status='unverified', source_payload=json.dumps(factual, ensure_ascii=False)))
    write(dataset, {'operators': [operators[k] for k in sorted(operators)], 'properties': properties})

    definitions = read('mcc_definitions')
    for network in ['visa', 'mastercard']:
        rows = []
        for entry in definitions:
            definition = entry.get(network)
            if definition:
                if definition['code'] != entry['code']:
                    raise ValueError('network MCC code mismatch')
                rows.append(dict(source('mcc_definitions'), source_record_id=entry['code'],
                    code=entry['code'], description=definition.get('description') or definition['title'],
                    source_payload=json.dumps(definition, ensure_ascii=False)))
        write(f'atmos-mcc-{network}', {'mccs': rows})
    estimates = []
    for entry in read('mcc_estimates'):
        estimates.append(dict(source('mcc_estimates'), source_record_id=f"{entry['code']}:{entry['version']}",
            code=entry['code'], version=entry['version'], source_payload=json.dumps(entry, ensure_ascii=False)))
    write('atmos-mcc-estimates', {'mcc_estimates': estimates})
    print(f'Prepared {len(properties)} properties, {len(operators)} operator labels, '
          f'{len(definitions)} distinct MCCs and {len(estimates)} MCC estimates in {OUTPUT}')


if __name__ == '__main__':
    prepare()
