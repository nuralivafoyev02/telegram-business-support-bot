-- 013_company_module_daily.sql
-- Kunlik kompaniya modul hisobotlari (info-report-for-bot)

create table if not exists public.company_module_daily_reports (
  id uuid primary key default gen_random_uuid(),
  tenant_id smallint not null default 1 references public.tenants(id),
  report_date date not null,
  company_id bigint not null,
  company_name text,
  module_usage jsonb not null default '{}'::jsonb,
  module_last_dates jsonb not null default '{}'::jsonb,
  module_active_count smallint not null default 0,
  raw jsonb,
  source_url text,
  fetched_at timestamptz not null default now(),
  unique (tenant_id, report_date, company_id)
);

create index if not exists idx_company_module_daily_tenant_date
  on public.company_module_daily_reports (tenant_id, report_date desc);

create index if not exists idx_company_module_daily_tenant_company
  on public.company_module_daily_reports (tenant_id, company_id, report_date desc);

create table if not exists public.company_module_sync_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id smallint not null default 1 references public.tenants(id),
  report_date date not null,
  status text not null check (status in ('success', 'failed')),
  companies_count integer not null default 0,
  source_url text,
  error_message text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create index if not exists idx_company_module_sync_runs_tenant_date
  on public.company_module_sync_runs (tenant_id, report_date desc, started_at desc);

alter table public.company_module_daily_reports enable row level security;
alter table public.company_module_sync_runs enable row level security;
