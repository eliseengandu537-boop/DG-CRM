-- postgresconnection.session.sql
-- Quick health checks for DG Property CRM PostgreSQL setup.
-- Expected local DB from backend/.env.local: DG-crm

-- 1) Connection sanity
select current_database() as database_name, current_user as database_user, version() as postgres_version;

-- 2) Show all app tables in public schema
select table_name
from information_schema.tables
where table_schema = 'public'
order by table_name;

-- 3) Row counts (run this after Prisma migration has been applied)
select 'User' as table_name, count(*) as rows from "User"
union all
select 'RefreshToken' as table_name, count(*) as rows from "RefreshToken"
union all
select 'Lead' as table_name, count(*) as rows from "Lead"
union all
select 'Deal' as table_name, count(*) as rows from "Deal"
union all
select 'Broker' as table_name, count(*) as rows from "Broker"
union all
select 'Contact' as table_name, count(*) as rows from "Contact"
union all
select 'properties' as table_name, count(*) as rows from properties
union all
select 'Auction' as table_name, count(*) as rows from "Auction"
union all
select 'ForecastDeal' as table_name, count(*) as rows from "ForecastDeal"
union all
select 'Reminder' as table_name, count(*) as rows from "Reminder"
union all
select 'LegalDocument' as table_name, count(*) as rows from "LegalDocument"
order by table_name;

-- 4) Verify active stock-eligible properties
select id, title, status, module_type, broker_id, created_at, updated_at
from properties
where deleted_at is null
  and status in ('For Sale', 'For Lease', 'Auction')
order by updated_at desc
limit 25;

-- 5) Verify admin user exists (created by seed/bootstrap)
select id, email, role, "createdAt"
from "User"
where lower(email) = lower('elisee@dg-property.co.za');

-- 6) Optional: check recent users
select id, email, role, "createdAt"
from "User"
order by "createdAt" desc
limit 10;

-- 7) Verify broker ownership columns used by dashboard queries
select table_name, column_name
from information_schema.columns
where table_schema = 'public'
  and table_name in ('Lead', 'Contact', 'Deal', 'properties')
  and column_name in ('brokerId', 'broker_id', 'created_by_broker_id')
order by table_name, column_name;

-- 8) Optional legacy alignment: add creator-tracking columns if your database is older
-- alter table "Lead" add column if not exists "created_by_broker_id" text;
-- alter table "Deal" add column if not exists "created_by_broker_id" text;
-- alter table "Contact" add column if not exists created_by_broker_id text;
-- alter table "properties" add column if not exists created_by_broker_id text;

-- 9) Brochure/custom record schema guard (required for role-based brochure visibility)
select table_name, column_name
from information_schema.columns
where table_schema = 'public'
  and table_name in ('CustomRecord', 'custom_records')
  and column_name in (
    'created_by_user_id',
    'created_by_broker_id',
    'assigned_broker_id',
    'module_type',
    'visibility_scope'
  )
order by table_name, column_name;

-- 10) Optional one-time patch for older DBs missing brochure access columns
do $$
declare
  table_name text;
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'CustomRecord'
  ) then
    table_name := '"CustomRecord"';
  elsif exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'custom_records'
  ) then
    table_name := 'custom_records';
  else
    raise notice 'CustomRecord/custom_records table not found.';
    return;
  end if;

  execute format('alter table %s add column if not exists created_by_user_id text', table_name);
  execute format('alter table %s add column if not exists created_by_broker_id text', table_name);
  execute format('alter table %s add column if not exists assigned_broker_id text', table_name);
  execute format('alter table %s add column if not exists module_type text', table_name);
  execute format('alter table %s add column if not exists visibility_scope text default ''shared''', table_name);

  execute format(
    'create index if not exists %I on %s (created_by_user_id)',
    replace(replace(table_name, '"', ''), '.', '') || '_created_by_user_id_idx',
    table_name
  );
  execute format(
    'create index if not exists %I on %s (created_by_broker_id)',
    replace(replace(table_name, '"', ''), '.', '') || '_created_by_broker_id_idx',
    table_name
  );
  execute format(
    'create index if not exists %I on %s (assigned_broker_id)',
    replace(replace(table_name, '"', ''), '.', '') || '_assigned_broker_id_idx',
    table_name
  );
  execute format(
    'create index if not exists %I on %s (module_type)',
    replace(replace(table_name, '"', ''), '.', '') || '_module_type_idx',
    table_name
  );
  execute format(
    'create index if not exists %I on %s (visibility_scope)',
    replace(replace(table_name, '"', ''), '.', '') || '_visibility_scope_idx',
    table_name
  );
end $$;

-- 11) WIP (ForecastDeal) legal document support
select table_name, column_name
from information_schema.columns
where table_schema = 'public'
  and table_name = 'ForecastDeal'
  and column_name = 'legal_document';

alter table "ForecastDeal"
  add column if not exists legal_document text;

-- 12) WIP comment field (reusing existing Deal.description for workflow comments)
select table_name, column_name
from information_schema.columns
where table_schema = 'public'
  and table_name = 'Deal'
  and column_name = 'description';

-- If you get "relation does not exist", run in backend folder:
-- npm.cmd run prisma:generate
-- npm.cmd run prisma:migrate -- --name init_postgres
-- npm.cmd run seed
