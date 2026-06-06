-- 010_multi_tenant_constraints.sql
-- TO'LIQ MIGRATION — faqat shu faylni run qiling (ustunlar + PK + viewlar).

create table if not exists public.tenants (
  id smallint primary key,
  name text not null,
  slug text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.tenants (id, name, slug)
values (1, 'Company 1', 'company1'), (2, 'Company 2', 'company2')
on conflict (id) do nothing;

alter table public.admins add column if not exists tenant_id smallint;
alter table public.bot_settings add column if not exists tenant_id smallint;
alter table public.tg_users add column if not exists tenant_id smallint;
alter table public.companies add column if not exists tenant_id smallint;
alter table public.tg_chats add column if not exists tenant_id smallint;
alter table public.business_connections add column if not exists tenant_id smallint;
alter table public.employees add column if not exists tenant_id smallint;
alter table public.company_members add column if not exists tenant_id smallint;
alter table public.messages add column if not exists tenant_id smallint;
alter table public.support_requests add column if not exists tenant_id smallint;
alter table public.request_events add column if not exists tenant_id smallint;
alter table public.broadcasts add column if not exists tenant_id smallint;
alter table public.broadcast_targets add column if not exists tenant_id smallint;

do $$
begin
  if to_regclass('public.ticket_notifications') is not null then
    execute 'alter table public.ticket_notifications add column if not exists tenant_id smallint';
  end if;
  if to_regclass('public.clickup_tasks') is not null then
    execute 'alter table public.clickup_tasks add column if not exists tenant_id smallint';
  end if;
end $$;

update public.admins set tenant_id = 1 where tenant_id is null;
update public.bot_settings set tenant_id = 1 where tenant_id is null;
update public.tg_users set tenant_id = 1 where tenant_id is null;
update public.companies set tenant_id = 1 where tenant_id is null;
update public.tg_chats set tenant_id = 1 where tenant_id is null;
update public.business_connections set tenant_id = 1 where tenant_id is null;
update public.employees set tenant_id = 1 where tenant_id is null;
update public.company_members set tenant_id = 1 where tenant_id is null;
update public.messages set tenant_id = 1 where tenant_id is null;
update public.support_requests set tenant_id = 1 where tenant_id is null;
update public.request_events set tenant_id = 1 where tenant_id is null;
update public.broadcasts set tenant_id = 1 where tenant_id is null;
update public.broadcast_targets set tenant_id = 1 where tenant_id is null;

do $$
begin
  if to_regclass('public.ticket_notifications') is not null then
    execute 'update public.ticket_notifications set tenant_id = 1 where tenant_id is null';
    execute 'alter table public.ticket_notifications alter column tenant_id set default 1';
    execute 'alter table public.ticket_notifications alter column tenant_id set not null';
  end if;
  if to_regclass('public.clickup_tasks') is not null then
    execute 'update public.clickup_tasks set tenant_id = 1 where tenant_id is null';
    execute 'alter table public.clickup_tasks alter column tenant_id set default 1';
    execute 'alter table public.clickup_tasks alter column tenant_id set not null';
  end if;
end $$;

alter table public.admins alter column tenant_id set default 1;
alter table public.admins alter column tenant_id set not null;
alter table public.bot_settings alter column tenant_id set default 1;
alter table public.bot_settings alter column tenant_id set not null;
alter table public.tg_users alter column tenant_id set default 1;
alter table public.tg_users alter column tenant_id set not null;
alter table public.companies alter column tenant_id set default 1;
alter table public.companies alter column tenant_id set not null;
alter table public.tg_chats alter column tenant_id set default 1;
alter table public.tg_chats alter column tenant_id set not null;
alter table public.business_connections alter column tenant_id set default 1;
alter table public.business_connections alter column tenant_id set not null;
alter table public.employees alter column tenant_id set default 1;
alter table public.employees alter column tenant_id set not null;
alter table public.company_members alter column tenant_id set default 1;
alter table public.company_members alter column tenant_id set not null;
alter table public.messages alter column tenant_id set default 1;
alter table public.messages alter column tenant_id set not null;
alter table public.support_requests alter column tenant_id set default 1;
alter table public.support_requests alter column tenant_id set not null;
alter table public.request_events alter column tenant_id set default 1;
alter table public.request_events alter column tenant_id set not null;
alter table public.broadcasts alter column tenant_id set default 1;
alter table public.broadcasts alter column tenant_id set not null;
alter table public.broadcast_targets alter column tenant_id set default 1;
alter table public.broadcast_targets alter column tenant_id set not null;

drop view if exists public.v_today_summary;
drop view if exists public.v_company_statistics;
drop view if exists public.v_chat_statistics;
drop view if exists public.v_employee_statistics;

alter table public.messages drop constraint if exists messages_chat_id_fkey;
alter table public.support_requests drop constraint if exists support_requests_chat_id_fkey;
alter table public.request_events drop constraint if exists request_events_chat_id_fkey;
alter table public.broadcast_targets drop constraint if exists broadcast_targets_chat_id_fkey;

do $$
begin
  if to_regclass('public.clickup_tasks') is not null then
    execute 'alter table public.clickup_tasks drop constraint if exists clickup_tasks_chat_id_fkey';
    execute 'alter table public.clickup_tasks drop constraint if exists clickup_tasks_chat_id_tg_message_id_reaction_emoji_key';
  end if;
  if to_regclass('public.ticket_notifications') is not null then
    execute 'alter table public.ticket_notifications drop constraint if exists ticket_notifications_request_id_key';
    execute 'alter table public.ticket_notifications drop constraint if exists ticket_notifications_chat_id_message_id_key';
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'tg_chats'
      and c.contype = 'p'
      and array_length(c.conkey, 1) = 1
  ) then
    alter table public.tg_chats drop constraint if exists tg_chats_pkey;
    alter table public.tg_chats add primary key (tenant_id, chat_id);
  end if;
end $$;

alter table public.messages drop constraint if exists messages_chat_id_tg_message_id_key;
alter table public.messages drop constraint if exists messages_tenant_chat_message_key;
alter table public.messages drop constraint if exists messages_tenant_chat_fkey;
alter table public.messages add constraint messages_tenant_chat_message_key unique (tenant_id, chat_id, tg_message_id);
alter table public.messages
  add constraint messages_tenant_chat_fkey
  foreign key (tenant_id, chat_id) references public.tg_chats(tenant_id, chat_id) on delete cascade;

alter table public.support_requests drop constraint if exists support_requests_chat_id_initial_message_id_key;
alter table public.support_requests drop constraint if exists support_requests_tenant_chat_initial_key;
alter table public.support_requests drop constraint if exists support_requests_tenant_chat_fkey;
alter table public.support_requests add constraint support_requests_tenant_chat_initial_key unique (tenant_id, chat_id, initial_message_id);
alter table public.support_requests
  add constraint support_requests_tenant_chat_fkey
  foreign key (tenant_id, chat_id) references public.tg_chats(tenant_id, chat_id) on delete cascade;

alter table public.request_events drop constraint if exists request_events_tenant_chat_fkey;
alter table public.request_events
  add constraint request_events_tenant_chat_fkey
  foreign key (tenant_id, chat_id) references public.tg_chats(tenant_id, chat_id) on delete cascade;

alter table public.broadcast_targets drop constraint if exists broadcast_targets_tenant_chat_fkey;
alter table public.broadcast_targets
  add constraint broadcast_targets_tenant_chat_fkey
  foreign key (tenant_id, chat_id) references public.tg_chats(tenant_id, chat_id) on delete set null;

do $$
begin
  if to_regclass('public.clickup_tasks') is not null then
    execute 'alter table public.clickup_tasks drop constraint if exists clickup_tasks_tenant_chat_message_reaction_key';
    execute 'alter table public.clickup_tasks drop constraint if exists clickup_tasks_tenant_chat_fkey';
    execute 'alter table public.clickup_tasks add constraint clickup_tasks_tenant_chat_message_reaction_key unique (tenant_id, chat_id, tg_message_id, reaction_emoji)';
    execute 'alter table public.clickup_tasks add constraint clickup_tasks_tenant_chat_fkey foreign key (tenant_id, chat_id) references public.tg_chats(tenant_id, chat_id) on delete set null';
  end if;
  if to_regclass('public.ticket_notifications') is not null then
    execute 'alter table public.ticket_notifications drop constraint if exists ticket_notifications_tenant_request_key';
    execute 'alter table public.ticket_notifications drop constraint if exists ticket_notifications_tenant_chat_message_key';
    execute 'alter table public.ticket_notifications add constraint ticket_notifications_tenant_request_key unique (tenant_id, request_id)';
    execute 'alter table public.ticket_notifications add constraint ticket_notifications_tenant_chat_message_key unique (tenant_id, chat_id, message_id)';
  end if;
end $$;

-- tg_users PK o'zgartirilmaydi (tg_user_id) — 9 ta FK bog'langan.
-- tenant_id ustuni izolyatsiya uchun yetarli; xodimlar tenant ichida unique.
alter table public.employees drop constraint if exists employees_tenant_tg_user_fkey;
alter table public.employees drop constraint if exists employees_tg_user_id_key;
alter table public.employees drop constraint if exists employees_tenant_tg_user_key;
alter table public.employees add constraint employees_tenant_tg_user_key unique (tenant_id, tg_user_id);
alter table public.employees drop constraint if exists employees_tg_user_id_fkey;
alter table public.employees
  add constraint employees_tg_user_id_fkey
  foreign key (tg_user_id) references public.tg_users(tg_user_id) on delete set null;

alter table public.business_connections drop constraint if exists business_connections_pkey;
alter table public.business_connections add primary key (tenant_id, connection_id);

alter table public.bot_settings drop constraint if exists bot_settings_pkey;
alter table public.bot_settings add primary key (tenant_id, key);
alter table public.bot_settings drop constraint if exists bot_settings_key_key;

insert into public.bot_settings (tenant_id, key, value)
select 2, key, value
from public.bot_settings
where tenant_id = 1
on conflict (tenant_id, key) do nothing;

insert into public.admins (username, password_hash, full_name, role, is_active, tenant_id)
values (
  'admin2',
  'sha256:f8d02f8df8f8444b94f221f497a7d0c3:1bb154972af24ae6b507b8428d80b93cc2fa5c248babe59f31ace3e0d19508c3',
  'Company 2 Admin',
  'owner',
  true,
  2
)
on conflict (username) do nothing;

create index if not exists idx_admins_tenant on public.admins(tenant_id);
create index if not exists idx_employees_tenant on public.employees(tenant_id);
create index if not exists idx_tg_chats_tenant on public.tg_chats(tenant_id);
create index if not exists idx_messages_tenant on public.messages(tenant_id);
create index if not exists idx_support_requests_tenant on public.support_requests(tenant_id, status, created_at desc);
create index if not exists idx_companies_tenant on public.companies(tenant_id);
create index if not exists idx_bot_settings_tenant on public.bot_settings(tenant_id);

alter table public.tenants enable row level security;

create or replace view public.v_employee_statistics as
select
  e.tenant_id,
  e.id as employee_id,
  e.tg_user_id,
  e.full_name,
  e.username,
  e.role,
  e.is_active,
  count(sr.id) filter (where sr.closed_by_employee_id = e.id) as received_requests,
  count(sr.id) filter (where sr.closed_by_employee_id = e.id and sr.status = 'closed') as closed_requests,
  count(distinct sr.chat_id) filter (where sr.closed_by_employee_id = e.id) as handled_chats,
  max(sr.closed_at) as last_closed_at,
  coalesce(round(avg(extract(epoch from (sr.closed_at - sr.created_at)) / 60) filter (where sr.closed_at is not null)::numeric, 1), 0) as avg_close_minutes,
  count(sr.id) filter (where sr.closed_by_employee_id = e.id and sr.status = 'open') as open_requests
from public.employees e
left join public.support_requests sr
  on sr.closed_by_employee_id = e.id and sr.tenant_id = e.tenant_id
group by e.tenant_id, e.id;

create or replace view public.v_chat_statistics as
select
  c.tenant_id,
  c.chat_id,
  c.title,
  c.username,
  c.type,
  c.source_type,
  c.company_id,
  coalesce(co.name, null) as company_name,
  c.business_connection_id,
  c.is_active,
  c.last_message_at,
  count(sr.id) as total_requests,
  count(sr.id) filter (where sr.status = 'open') as open_requests,
  count(sr.id) filter (where sr.status = 'closed') as closed_requests,
  count(distinct sr.closed_by_employee_id) filter (where sr.closed_by_employee_id is not null) as employees_handled,
  max(sr.created_at) as last_request_at,
  max(sr.closed_at) as last_closed_at
from public.tg_chats c
left join public.companies co on co.id = c.company_id and co.tenant_id = c.tenant_id
left join public.support_requests sr on sr.chat_id = c.chat_id and sr.tenant_id = c.tenant_id
group by c.tenant_id, c.chat_id, co.name;

create or replace view public.v_company_statistics as
with request_company as (
  select
    sr.*,
    coalesce(sr.company_id, c.company_id) as resolved_company_id
  from public.support_requests sr
  left join public.tg_chats c on c.chat_id = sr.chat_id and c.tenant_id = sr.tenant_id
)
select
  co.tenant_id,
  co.id as company_id,
  co.name,
  co.legal_name,
  co.phone,
  co.notes,
  co.is_active,
  count(distinct c.chat_id) as chats_count,
  count(distinct cm.tg_user_id) filter (where cm.member_type = 'customer') as users_count,
  count(distinct cm.employee_id) filter (where cm.member_type in ('employee','manager','owner')) as employees_count,
  count(distinct sr.id) as total_requests,
  count(distinct sr.id) filter (where sr.status = 'open') as open_requests,
  count(distinct sr.id) filter (where sr.status = 'closed') as closed_requests,
  count(distinct sr.id) filter (where lower(coalesce(sr.initial_text, '')) like '%taklif%') as offers_count,
  max(sr.created_at) as last_request_at
from public.companies co
left join public.tg_chats c on c.company_id = co.id and c.tenant_id = co.tenant_id
left join public.company_members cm on cm.company_id = co.id and cm.tenant_id = co.tenant_id and cm.is_active = true
left join request_company sr on sr.resolved_company_id = co.id and sr.tenant_id = co.tenant_id
group by co.tenant_id, co.id;

create or replace view public.v_today_summary as
select
  sr.tenant_id,
  count(sr.id) filter (where (sr.created_at at time zone 'Asia/Tashkent')::date = (now() at time zone 'Asia/Tashkent')::date) as total_requests,
  count(sr.id) filter (where sr.status = 'open') as open_requests,
  count(sr.id) filter (where sr.status = 'closed' and (sr.closed_at at time zone 'Asia/Tashkent')::date = (now() at time zone 'Asia/Tashkent')::date) as closed_requests,
  (select count(*) from public.tg_chats tc where tc.tenant_id = sr.tenant_id and tc.source_type = 'group' and tc.is_active = true) as groups_count,
  (select count(*) from public.tg_chats tc where tc.tenant_id = sr.tenant_id and tc.source_type in ('private','business') and tc.is_active = true) as private_chats_count,
  (select count(*) from public.companies cp where cp.tenant_id = sr.tenant_id and cp.is_active = true) as companies_count,
  (select count(*) from public.employees em where em.tenant_id = sr.tenant_id and em.is_active = true) as employees_count
from public.support_requests sr
group by sr.tenant_id;

notify pgrst, 'reload schema';
