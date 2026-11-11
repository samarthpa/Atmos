begin;
-- Keep operational record identity and provenance stable, including direct API writes.
create function atmos_private.guard_record_identity() returns trigger
language plpgsql set search_path='' as $$
begin
 if TG_OP='UPDATE' and (new.id,new.org_id,new.created_at) is distinct from (old.id,old.org_id,old.created_at) then
  raise exception 'Record identity and creation timestamp are immutable';
 end if;
 if TG_TABLE_NAME='atmos_expenses' then
  if TG_OP='INSERT' and new.created_by is distinct from auth.uid() then raise exception 'Expense creator must be the current user'; end if;
  if TG_OP='UPDATE' and new.created_by is distinct from old.created_by then raise exception 'Expense creator is immutable'; end if;
 end if;
 return new;
end;
$$;
revoke all on function atmos_private.guard_record_identity() from public,anon;
do $$ declare t text; begin
 foreach t in array array['atmos_properties','atmos_vendors','atmos_bills','atmos_expenses','atmos_documents'] loop
  execute format('create trigger record_identity before insert or update on public.%I for each row execute function atmos_private.guard_record_identity()',t);
 end loop;
end $$;
alter table public.atmos_expenses add constraint expense_amount_limit check(amount_cents<=100000000000);
create index on public.atmos_organizations(owner_id);
create index on public.atmos_bills(created_by);
create index on public.atmos_expenses(created_by);
create index on public.atmos_activity(actor_id);
commit;
