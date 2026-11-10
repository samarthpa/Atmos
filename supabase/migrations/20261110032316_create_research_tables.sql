begin;

-- Private research storage; intentionally not exposed through the public API.
create schema research;
revoke all on schema research from public, anon, authenticated;

create function research.touch_updated_at() returns trigger
language plpgsql set search_path = pg_catalog as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table research.operators (
  source_dataset text not null check (btrim(source_dataset) <> ''),
  source_record_id text not null check (btrim(source_record_id) <> ''),
  name text not null check (btrim(name) <> ''),
  source_reference text not null check (btrim(source_reference) <> ''),
  source_observed_at timestamptz,
  source_retrieved_at timestamptz,
  source_sha256 text check (source_sha256 ~ '^[a-f0-9]{64}$'),
  verification_status text not null default 'unverified'
    check (verification_status in ('unverified', 'verified')),
  verified_at timestamptz,
  verification_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (source_dataset, source_record_id),
  check (verification_status <> 'verified' or
    (verified_at is not null and nullif(btrim(verification_reference), '') is not null))
);

create table research.mccs (
  source_dataset text not null check (btrim(source_dataset) <> ''),
  source_record_id text not null check (btrim(source_record_id) <> ''),
  code text not null check (code ~ '^[0-9]{4}$'),
  description text not null check (btrim(description) <> ''),
  source_payload jsonb not null default '{}'::jsonb,
  source_reference text not null check (btrim(source_reference) <> ''),
  source_observed_at timestamptz,
  source_retrieved_at timestamptz,
  source_sha256 text check (source_sha256 ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (source_dataset, source_record_id),
  unique (source_dataset, code)
);

create table research.properties (
  source_dataset text not null check (btrim(source_dataset) <> ''),
  source_record_id text not null check (btrim(source_record_id) <> ''),
  name text not null check (btrim(name) <> ''),
  address text,
  city text,
  source_payload jsonb not null default '{}'::jsonb,
  country_code text check (country_code ~ '^[A-Z]{2}$'),
  operator_dataset text,
  operator_record_id text,
  source_reference text not null check (btrim(source_reference) <> ''),
  source_observed_at timestamptz,
  source_retrieved_at timestamptz,
  source_sha256 text check (source_sha256 ~ '^[a-f0-9]{64}$'),
  verification_status text not null default 'unverified'
    check (verification_status in ('unverified', 'verified')),
  verified_at timestamptz,
  verification_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (source_dataset, source_record_id),
  foreign key (operator_dataset, operator_record_id)
    references research.operators (source_dataset, source_record_id) match full,
  check (verification_status <> 'verified' or
    (verified_at is not null and nullif(btrim(verification_reference), '') is not null))
);

-- Quantitative assumptions live here, never in the property fact columns.
create table research.property_estimates (
  source_dataset text not null check (btrim(source_dataset) <> ''),
  source_record_id text not null check (btrim(source_record_id) <> ''),
  property_dataset text not null,
  property_record_id text not null,
  metric text not null check (btrim(metric) <> ''),
  value numeric not null check (value::text not in ('NaN', 'Infinity', '-Infinity')),
  unit text not null check (btrim(unit) <> ''),
  currency_code text check (currency_code ~ '^[A-Z]{3}$'),
  period_start date,
  period_end date,
  methodology text not null check (btrim(methodology) <> ''),
  source_reference text not null check (btrim(source_reference) <> ''),
  source_observed_at timestamptz,
  source_retrieved_at timestamptz,
  source_sha256 text check (source_sha256 ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (source_dataset, source_record_id),
  foreign key (property_dataset, property_record_id)
    references research.properties (source_dataset, source_record_id),
  check (period_end is null or period_start is null or period_end >= period_start)
);

create index on research.properties (operator_dataset, operator_record_id);
create index on research.property_estimates (property_dataset, property_record_id);

-- The deployed MCC directory includes Atmos estimates, not network facts.
create table research.mcc_estimates (
  source_dataset text not null check (btrim(source_dataset) <> ''),
  source_record_id text not null check (btrim(source_record_id) <> ''),
  code text not null check (code ~ '^[0-9]{4}$'),
  version text not null check (btrim(version) <> ''),
  source_payload jsonb not null,
  source_reference text not null check (btrim(source_reference) <> ''),
  source_observed_at timestamptz,
  source_retrieved_at timestamptz,
  source_sha256 text check (source_sha256 ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (source_dataset, source_record_id),
  unique (source_dataset, code, version),
  check (source_payload @> '{"estimated": true}'::jsonb)
);

do $$
declare t text;
begin
  foreach t in array array['operators', 'mccs', 'properties', 'property_estimates', 'mcc_estimates'] loop
    execute format('alter table research.%I enable row level security', t);
    execute format('revoke all on research.%I from public, anon, authenticated', t);
    execute format('create trigger touch_updated_at before update on research.%I '
      'for each row execute function research.touch_updated_at()', t);
  end loop;
end;
$$;

commit;
