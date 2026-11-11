-- Run using a privileged SQL connection in a development database.
-- Every fixture is rolled back; no persistent accounts or records are created.
begin;
insert into auth.users(id,email) values
 ('00000000-0000-4000-8000-000000000101','atmos-owner-test@example.invalid'),
 ('00000000-0000-4000-8000-000000000102','atmos-member-test@example.invalid'),
 ('00000000-0000-4000-8000-000000000103','atmos-outsider-test@example.invalid');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000101',true);
insert into public.atmos_organizations(id,name) values('00000000-0000-4000-8000-000000000201','QA organization');
insert into public.atmos_members(org_id,user_id,role) values('00000000-0000-4000-8000-000000000201','00000000-0000-4000-8000-000000000102','member');
insert into public.atmos_properties(id,org_id,name) values('00000000-0000-4000-8000-000000000301','00000000-0000-4000-8000-000000000201','QA property');
insert into public.atmos_vendors(id,org_id,name) values('00000000-0000-4000-8000-000000000401','00000000-0000-4000-8000-000000000201','QA vendor');
insert into public.atmos_bills(id,org_id,vendor_id,property_id,number,amount_cents,due_date)
values('00000000-0000-4000-8000-000000000501','00000000-0000-4000-8000-000000000201','00000000-0000-4000-8000-000000000401','00000000-0000-4000-8000-000000000301','QA-INVOICE',12045,current_date);
update public.atmos_bills set status='submitted' where id='00000000-0000-4000-8000-000000000501';
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000102',true);
do $$ begin
 begin
  update public.atmos_bills set status='approved' where id='00000000-0000-4000-8000-000000000501';
  raise exception 'TEST FAILED: member approved invoice';
 exception when raise_exception then if SQLERRM like 'TEST FAILED:%' then raise; end if; end;
 begin
  insert into public.atmos_expenses(org_id,property_id,merchant,amount_cents,category,expense_date,created_by)
  values('00000000-0000-4000-8000-000000000201','00000000-0000-4000-8000-000000000301','QA',100,'Other',current_date,'00000000-0000-4000-8000-000000000101');
  raise exception 'TEST FAILED: expense creator spoofed';
 exception when raise_exception then if SQLERRM like 'TEST FAILED:%' then raise; end if; end;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000101',true);
update public.atmos_bills set status='approved' where id='00000000-0000-4000-8000-000000000501';
do $$ begin
 if (select count(*) from public.atmos_activity where org_id='00000000-0000-4000-8000-000000000201')<>5 then raise exception 'TEST FAILED: audit trail incomplete'; end if;
 begin
  update public.atmos_bills set amount_cents=1 where id='00000000-0000-4000-8000-000000000501';
  raise exception 'TEST FAILED: approved amount changed';
 exception when raise_exception then if SQLERRM like 'TEST FAILED:%' then raise; end if; end;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000103',true);
do $$ begin
 if exists(select 1 from public.atmos_organizations where id='00000000-0000-4000-8000-000000000201') or exists(select 1 from public.atmos_bills where id='00000000-0000-4000-8000-000000000501') or exists(select 1 from public.atmos_activity where org_id='00000000-0000-4000-8000-000000000201') then raise exception 'TEST FAILED: organization data leaked'; end if;
end $$;
set local role anon;
do $$ begin
 begin
  perform 1 from public.atmos_bills;
  raise exception 'TEST FAILED: anonymous access allowed';
 exception when insufficient_privilege then null; end;
end $$;
select 'PASS: approval roles, immutable amounts, creator integrity, audit history, organization isolation, anonymous denial' as result;
rollback;
