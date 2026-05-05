-- 002_schema.sql
-- Telegram Business Support Bot uchun asosiy jadval va indekslar.

create table if not exists public.admins (
  id uuid primary key default gen_random_uuid(),
  username text not null unique,
  password_hash text not null,
  full_name text,
  role text not null default 'owner' check (role in ('owner','admin','viewer')),
  is_active boolean not null default true,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.bot_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.tg_users (
  tg_user_id bigint primary key,
  first_name text,
  last_name text,
  username text,
  language_code text,
  is_bot boolean not null default false,
  raw jsonb,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  legal_name text,
  phone text,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tg_chats (
  chat_id bigint primary key,
  type text,
  source_type text not null default 'group' check (source_type in ('group','private','business')),
  title text,
  username text,
  company_id uuid references public.companies(id) on delete set null,
  business_connection_id text,
  member_status text,
  is_active boolean not null default true,
  raw jsonb,
  first_seen_at timestamptz not null default now(),
  last_message_at timestamptz,
  last_member_update_at timestamptz
);

create table if not exists public.business_connections (
  connection_id text primary key,
  tg_user_id bigint references public.tg_users(tg_user_id) on delete set null,
  user_chat_id bigint,
  can_reply boolean,
  is_enabled boolean,
  rights jsonb,
  raw jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.employees (
  id uuid primary key default gen_random_uuid(),
  tg_user_id bigint unique references public.tg_users(tg_user_id) on delete set null,
  full_name text not null,
  username text,
  phone text,
  role text not null default 'support',
  is_active boolean not null default true,
  last_activity_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.company_members (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  tg_user_id bigint references public.tg_users(tg_user_id) on delete set null,
  employee_id uuid references public.employees(id) on delete set null,
  display_name text,
  member_type text not null default 'customer' check (member_type in ('customer','employee','manager','owner')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(company_id, tg_user_id)
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  tg_message_id bigint not null,
  chat_id bigint not null references public.tg_chats(chat_id) on delete cascade,
  from_tg_user_id bigint references public.tg_users(tg_user_id) on delete set null,
  from_name text,
  from_username text,
  source_type text not null check (source_type in ('group','private','business')),
  update_kind text,
  text text,
  classification text,
  employee_id uuid references public.employees(id) on delete set null,
  business_connection_id text,
  raw jsonb,
  created_at timestamptz not null default now(),
  unique(chat_id, tg_message_id)
);

create table if not exists public.support_requests (
  id uuid primary key default gen_random_uuid(),
  source_type text not null check (source_type in ('group','private','business')),
  chat_id bigint not null references public.tg_chats(chat_id) on delete cascade,
  company_id uuid references public.companies(id) on delete set null,
  customer_tg_id bigint references public.tg_users(tg_user_id) on delete set null,
  customer_name text,
  customer_username text,
  initial_message_id bigint not null,
  initial_text text,
  status text not null default 'open' check (status in ('open','closed','cancelled')),
  business_connection_id text,
  closed_at timestamptz,
  closed_by_employee_id uuid references public.employees(id) on delete set null,
  closed_by_tg_id bigint references public.tg_users(tg_user_id) on delete set null,
  closed_by_name text,
  done_message_id bigint,
  raw jsonb,
  created_at timestamptz not null default now(),
  unique(chat_id, initial_message_id)
);

create table if not exists public.request_events (
  id uuid primary key default gen_random_uuid(),
  request_id uuid references public.support_requests(id) on delete cascade,
  chat_id bigint references public.tg_chats(chat_id) on delete cascade,
  tg_message_id bigint,
  event_type text not null check (event_type in ('opened','closed','cancelled','done_without_request','note')),
  actor_tg_id bigint references public.tg_users(tg_user_id) on delete set null,
  actor_name text,
  employee_id uuid references public.employees(id) on delete set null,
  text text,
  raw jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.broadcasts (
  id uuid primary key default gen_random_uuid(),
  title text,
  text text not null,
  target_type text not null default 'groups' check (target_type in ('single_chat','groups','privates','all','company')),
  company_id uuid references public.companies(id) on delete set null,
  total_targets integer not null default 0,
  sent_count integer not null default 0,
  failed_count integer not null default 0,
  created_by text,
  status text not null default 'created' check (status in ('created','processing','sent','completed_with_errors','failed')),
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.broadcast_targets (
  id uuid primary key default gen_random_uuid(),
  broadcast_id uuid not null references public.broadcasts(id) on delete cascade,
  chat_id bigint references public.tg_chats(chat_id) on delete set null,
  tg_user_id bigint references public.tg_users(tg_user_id) on delete set null,
  status text not null default 'pending' check (status in ('pending','sent','failed')),
  telegram_message_id bigint,
  error text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_support_requests_chat_status_created on public.support_requests(chat_id, status, created_at desc);
create index if not exists idx_support_requests_company on public.support_requests(company_id, created_at desc);
create index if not exists idx_support_requests_closed_by on public.support_requests(closed_by_employee_id, closed_at desc);
create index if not exists idx_messages_chat_created on public.messages(chat_id, created_at desc);
create index if not exists idx_tg_chats_source on public.tg_chats(source_type, is_active);
create index if not exists idx_request_events_request on public.request_events(request_id, created_at);

-- Default admin: admin / Admin@12345. Deploydan keyin darhol almashtiring.
insert into public.admins (username, password_hash, full_name, role, is_active)
values ('admin', 'sha256:f8d02f8df8f8444b94f221f497a7d0c3:1bb154972af24ae6b507b8428d80b93cc2fa5c248babe59f31ace3e0d19508c3', 'System Admin', 'owner', true)
on conflict (username) do nothing;

insert into public.bot_settings (key, value)
values
  ('ai_mode', '{"enabled": false, "provider": null}'::jsonb),
  ('group_message_audit', '{"enabled": true}'::jsonb),
  ('done_tag', '{"tag": "#done", "auto_reply": true}'::jsonb),
  ('request_detection', '{"mode": "keyword", "min_text_length": 10}'::jsonb),
  ('main_group', '{"chat_id": ""}'::jsonb)
on conflict (key) do nothing;
