begin;
create schema if not exists atmos_private;
revoke all on schema atmos_private from public, anon;
grant usage on schema atmos_private to authenticated;

create table public.atmos_organizations (
 id uuid primary key default gen_random_uuid(), name text not null check(length(btrim(name)) between 1 and 120),
 owner_id uuid not null default auth.uid() references auth.users(id), created_at timestamptz not null default now()
);
create table public.atmos_members (
 id uuid primary key default gen_random_uuid(), org_id uuid not null references public.atmos_organizations(id),
 user_id uuid not null references auth.users(id), role text not null check(role in ('admin','approver','member','viewer')),
 unique(org_id,user_id)
);
create function atmos_private.has_access(target uuid, allowed text[] default array['owner','admin','approver','member','viewer']) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and (
 exists(select 1 from public.atmos_organizations where id=target and owner_id=auth.uid() and 'owner'=any(allowed))
 or exists(select 1 from public.atmos_members where org_id=target and user_id=auth.uid() and role=any(allowed)));
$$;
revoke all on function atmos_private.has_access(uuid,text[]) from public, anon;
grant execute on function atmos_private.has_access(uuid,text[]) to authenticated;
alter table public.atmos_organizations enable row level security;
alter table public.atmos_members enable row level security;
create policy org_read on public.atmos_organizations for select to authenticated using(atmos_private.has_access(id));
create policy org_create on public.atmos_organizations for insert to authenticated with check(owner_id=(select auth.uid()));
create policy org_update on public.atmos_organizations for update to authenticated using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()));
create policy member_read on public.atmos_members for select to authenticated using(atmos_private.has_access(org_id));
create policy member_manage on public.atmos_members for all to authenticated using(atmos_private.has_access(org_id,array['owner'])) with check(atmos_private.has_access(org_id,array['owner']));

create table public.atmos_properties (
 id uuid primary key default gen_random_uuid(), org_id uuid not null references public.atmos_organizations(id),
 name text not null check(length(btrim(name)) between 1 and 120), city text not null default '', state text not null default '',
 rooms integer check(rooms>=0), created_at timestamptz not null default now(), unique(org_id,id)
);
create table public.atmos_vendors (
 id uuid primary key default gen_random_uuid(), org_id uuid not null references public.atmos_organizations(id),
 name text not null check(length(btrim(name)) between 1 and 120), email text not null default '', category text not null default 'Other',
 created_at timestamptz not null default now(), unique(org_id,id)
);
create table public.atmos_bills (
 id uuid primary key default gen_random_uuid(), org_id uuid not null references public.atmos_organizations(id),
 vendor_id uuid not null, property_id uuid not null, number text not null check(length(btrim(number)) between 1 and 80),
 amount_cents bigint not null check(amount_cents>0 and amount_cents<=100000000000), currency text not null default 'USD' check(currency='USD'),
 due_date date not null, category text not null default 'Other', description text not null default '',
 status text not null default 'draft' check(status in ('draft','submitted','approved','rejected')),
 created_by uuid not null default auth.uid() references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(org_id,vendor_id,number), unique(org_id,id),
 foreign key(org_id,vendor_id) references public.atmos_vendors(org_id,id),
 foreign key(org_id,property_id) references public.atmos_properties(org_id,id)
);
create table public.atmos_expenses (
 id uuid primary key default gen_random_uuid(), org_id uuid not null references public.atmos_organizations(id),
 property_id uuid not null, merchant text not null, amount_cents bigint not null check(amount_cents>0),
 category text not null, expense_date date not null, memo text not null default '',
 created_by uuid not null default auth.uid() references auth.users(id), created_at timestamptz not null default now(),
 foreign key(org_id,property_id) references public.atmos_properties(org_id,id)
);
create table public.atmos_documents (
 id uuid primary key default gen_random_uuid(), org_id uuid not null references public.atmos_organizations(id),
 bill_id uuid not null, name text not null, path text not null, created_at timestamptz not null default now(),
 foreign key(org_id,bill_id) references public.atmos_bills(org_id,id)
);
create table public.atmos_activity (
 id uuid primary key default gen_random_uuid(), org_id uuid not null references public.atmos_organizations(id),
 actor_id uuid references auth.users(id), action text not null, entity_id uuid, entity_type text not null,
 created_at timestamptz not null default now()
);
create function atmos_private.guard_bill() returns trigger language plpgsql set search_path='' as $$
begin
 if TG_OP='INSERT' then
  if new.status<>'draft' or new.created_by is distinct from auth.uid() then raise exception 'Bills must start as a draft owned by the current user'; end if;
 else
  if new.org_id<>old.org_id or new.created_by<>old.created_by or new.created_at<>old.created_at then raise exception 'Bill identity is immutable'; end if;
  if (new.vendor_id,new.property_id,new.number,new.amount_cents,new.currency,new.due_date,new.category,new.description)
     is distinct from (old.vendor_id,old.property_id,old.number,old.amount_cents,old.currency,old.due_date,old.category,old.description)
     and old.status not in ('draft','rejected') then raise exception 'Only drafts can be edited'; end if;
  if new.status<>old.status then
   if not ((old.status='draft' and new.status='submitted') or (old.status='rejected' and new.status='draft') or
    (old.status='submitted' and new.status in ('approved','rejected') and atmos_private.has_access(new.org_id,array['owner','admin','approver'])))
   then raise exception 'Invalid or unauthorized approval transition'; end if;
  end if;
  new.updated_at=now();
 end if;
 return new;
end;
$$;
create trigger bill_guard before insert or update on public.atmos_bills for each row execute function atmos_private.guard_bill();
create function atmos_private.record_activity() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Authenticated actor required'; end if;
 insert into public.atmos_activity(org_id,actor_id,action,entity_id,entity_type)
 values(new.org_id,auth.uid(),case when TG_OP='INSERT' then 'Created' else 'Updated' end || case when TG_TABLE_NAME='atmos_bills' then ' bill: '||(to_jsonb(new)->>'status') else '' end,new.id,TG_TABLE_NAME);
 return new;
end;
$$;
revoke all on function atmos_private.record_activity() from public,anon,authenticated;
revoke all on function atmos_private.guard_bill() from public,anon;

do $$ declare t text; begin
 foreach t in array array['atmos_properties','atmos_vendors','atmos_bills','atmos_expenses','atmos_documents'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('create policy member_read on public.%I for select to authenticated using(atmos_private.has_access(org_id))',t);
  execute format('create policy member_insert on public.%I for insert to authenticated with check(atmos_private.has_access(org_id,array[''owner'',''admin'',''approver'',''member'']))',t);
  execute format('create policy member_update on public.%I for update to authenticated using(atmos_private.has_access(org_id,array[''owner'',''admin'',''approver'',''member''])) with check(atmos_private.has_access(org_id,array[''owner'',''admin'',''approver'',''member'']))',t);
  execute format('create index on public.%I(org_id)',t);
  execute format('create trigger activity after insert or update on public.%I for each row execute function atmos_private.record_activity()',t);
 end loop;
end $$;
alter table public.atmos_activity enable row level security;
create policy activity_read on public.atmos_activity for select to authenticated using(atmos_private.has_access(org_id));
create index on public.atmos_activity(org_id,created_at desc);
create index on public.atmos_members(user_id);
create index on public.atmos_bills(org_id,status,due_date);
create index on public.atmos_bills(org_id,property_id);
create index on public.atmos_expenses(org_id,property_id);
create index on public.atmos_documents(org_id,bill_id);
revoke all on public.atmos_organizations, public.atmos_members, public.atmos_properties, public.atmos_vendors, public.atmos_bills, public.atmos_expenses, public.atmos_documents, public.atmos_activity from anon, public;
grant select,insert,update on public.atmos_organizations,public.atmos_members,public.atmos_properties,public.atmos_vendors,public.atmos_bills,public.atmos_expenses,public.atmos_documents to authenticated;
grant select on public.atmos_activity to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('atmos-documents','atmos-documents',false,10485760,array['application/pdf','image/jpeg','image/png']);
create policy atmos_document_read on storage.objects for select to authenticated
using(bucket_id='atmos-documents' and atmos_private.has_access(((storage.foldername(name))[1])::uuid));
create policy atmos_document_upload on storage.objects for insert to authenticated
with check(bucket_id='atmos-documents' and atmos_private.has_access(((storage.foldername(name))[1])::uuid,array['owner','admin','approver','member']));
commit;
