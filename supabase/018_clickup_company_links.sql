-- 018_clickup_company_links.sql
-- ClickUp "Kompaniyalar" board'idagi tasklarni ichki kompaniyalar bilan bog'lash
-- (har bir task nomi kompaniya nomiga mos keladi, linked_tasks orqali ulangan
-- vazifalar soni MRR/faollik grafigida bildirishnoma sifatida ko'rsatiladi).

create table if not exists public.clickup_company_links (
  id uuid primary key default gen_random_uuid(),
  tenant_id smallint not null default 1 references public.tenants(id),
  company_key text not null,
  company_name text,
  clickup_task_id text not null,
  clickup_task_url text,
  clickup_status text,
  linked_tasks jsonb not null default '[]'::jsonb,
  linked_task_count smallint not null default 0,
  synced_at timestamptz not null default now(),
  unique (tenant_id, clickup_task_id)
);

create index if not exists idx_clickup_company_links_company_key
  on public.clickup_company_links (tenant_id, company_key);

alter table public.clickup_company_links enable row level security;
