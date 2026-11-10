import csv
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
from import_research import load_manifest, apply_rows, FIELDS, validate


class ValidationTests(unittest.TestCase):
    def load(self, rows, kind='research', headers=None):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)
            with (path / 'mcc.csv').open('w', newline='') as stream:
                writer = csv.DictWriter(stream, fieldnames=headers or rows[0].keys())
                writer.writeheader()
                writer.writerows(rows)
            (path / 'manifest.json').write_text(json.dumps({
                'dataset_id': 'test', 'data_kind': kind, 'files': {'mccs': 'mcc.csv'}}))
            return load_manifest(path / 'manifest.json')

    def row(self, code='0742'):
        return dict(source_record_id=code, code=code, description='Veterinary services',
                    source_reference='test fixture')

    def test_leading_zero_preserved(self):
        self.assertEqual(self.load([self.row()])['mccs'][0]['code'], '0742')

    def test_duplicate_identity_rejected(self):
        with self.assertRaisesRegex(ValueError, 'duplicate'):
            self.load([self.row(), self.row()])

    def test_invalid_mcc_not_silently_padded(self):
        with self.assertRaisesRegex(ValueError, 'invalid code'):
            self.load([self.row('742')])

    def test_demo_and_hotelify_rejected(self):
        with self.assertRaises(ValueError):
            self.load([self.row()], kind='demo')
        row = self.row()
        row['description'] = 'Hotelify fictional example'
        with self.assertRaises(ValueError):
            self.load([row])

    def test_unknown_headers_rejected(self):
        row = dict(self.row(), estimated_revenue='10')
        with self.assertRaises(ValueError):
            self.load([row])

    def test_verification_requires_evidence(self):
        with self.assertRaises(ValueError):
            validate('properties', dict(name='Fixture', source_record_id='test',
                source_reference='fixture', verification_status='verified'))

    def test_estimate_requires_finite_number(self):
        row = dict(source_record_id='e', source_reference='fixture', property_dataset='test',
                   property_record_id='p', metric='revenue', unit='USD', value='NaN', methodology='fixture')
        with self.assertRaises(ValueError):
            validate('property_estimates', row)


@unittest.skipUnless(os.environ.get('TEST_DATABASE_URL'), 'requires an empty disposable PostgreSQL database')
class DatabaseTests(unittest.TestCase):
    def test_full_import_rerun_update_rollback_and_permissions(self):
        import psycopg
        with psycopg.connect(os.environ['TEST_DATABASE_URL'], autocommit=True) as conn:
            self.assertIsNone(conn.execute("select to_regnamespace('research')").fetchone()[0],
                              'TEST_DATABASE_URL must point at an empty disposable database')
            for role in ['anon', 'authenticated']:
                if not conn.execute('select 1 from pg_roles where rolname=%s', (role,)).fetchone():
                    conn.execute(f'create role {role}')
            conn.execute((ROOT / 'supabase/migrations/20261110032316_create_research_tables.sql').read_text())
            tables = {t: [] for t in FIELDS}
            manifests = list((ROOT / 'data/research/prepared').glob('*.manifest.json'))
            self.assertEqual(len(manifests), 4, 'run prepare_research.py first')
            for manifest in manifests:
                for table, rows in load_manifest(manifest).items():
                    tables[table].extend(rows)
            apply_rows(conn, tables)
            expected = {'properties': 63970, 'operators': 1274, 'mccs': 1813,
                        'property_estimates': 0, 'mcc_estimates': 962}
            def state():
                return {table: conn.execute(f'select count(*), max(updated_at) from research.{table}').fetchone()
                        for table in FIELDS}
            before = state()
            self.assertEqual({t: v[0] for t, v in before.items()}, expected)
            apply_rows(conn, tables)
            self.assertEqual(state(), before, 'identical reruns must not change counts or timestamps')
            self.assertEqual(conn.execute("select count(*) from research.mccs where code='0742'").fetchone()[0], 2)
            self.assertEqual(conn.execute("select count(*) from research.properties where verification_status='verified'").fetchone()[0], 0)
            original = tables['properties'][0]
            changed = dict(original, name='Test-only corrected name')
            apply_rows(conn, {'properties': [changed]})
            self.assertEqual(conn.execute('select name from research.properties where source_dataset=%s '
                'and source_record_id=%s', (original['source_dataset'], original['source_record_id'])).fetchone()[0], changed['name'])
            bad = dict(original, source_record_id='invalid-fixture', operator_dataset='missing', operator_record_id='missing')
            with self.assertRaises(psycopg.errors.ForeignKeyViolation):
                apply_rows(conn, {'properties': [original, bad]})
            self.assertEqual(conn.execute('select name from research.properties where source_dataset=%s '
                'and source_record_id=%s', (original['source_dataset'], original['source_record_id'])).fetchone()[0], changed['name'])
            self.assertFalse(conn.execute("select has_schema_privilege('anon', 'research', 'USAGE')").fetchone()[0])
            self.assertFalse(conn.execute("select has_schema_privilege('authenticated', 'research', 'USAGE')").fetchone()[0])
            self.assertEqual(conn.execute("select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace "
                "where n.nspname='research' and c.relkind='r' and c.relrowsecurity").fetchone()[0], 5)


if __name__ == '__main__':
    unittest.main()
