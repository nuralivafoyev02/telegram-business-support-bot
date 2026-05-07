-- 006_clickup_integration.sql
-- ClickUp integratsiyasi va Telegram reaction orqali yaratilgan vazifalar kuzatuvi.

alter table public.employees
  add column if not exists clickup_user_id text;

create table if not exists public.clickup_tasks (
  id uuid primary key default gen_random_uuid(),
  source_type text not null default 'telegram_reaction' check (source_type in ('telegram_reaction','manual')),
  chat_id bigint references public.tg_chats(chat_id) on delete set null,
  tg_message_id bigint,
  support_request_id uuid references public.support_requests(id) on delete set null,
  clickup_task_id text,
  clickup_task_url text,
  clickup_list_id text,
  clickup_list_key text,
  title text,
  description text,
  status text not null default 'pending' check (status in ('pending','created','closed','error','skipped')),
  assignee_clickup_ids jsonb not null default '[]'::jsonb,
  mentioned_usernames jsonb not null default '[]'::jsonb,
  message_link text,
  media jsonb not null default '[]'::jsonb,
  reaction_emoji text,
  created_by_tg_user_id bigint references public.tg_users(tg_user_id) on delete set null,
  error text,
  raw jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(chat_id, tg_message_id, reaction_emoji)
);

create index if not exists idx_clickup_tasks_chat_message on public.clickup_tasks(chat_id, tg_message_id);
create index if not exists idx_clickup_tasks_status_created on public.clickup_tasks(status, created_at desc);
create index if not exists idx_clickup_tasks_clickup_id on public.clickup_tasks(clickup_task_id);

alter table public.clickup_tasks enable row level security;

insert into public.bot_settings (key, value)
values
  ('clickup_integration', '{
    "enabled": false,
    "api_token": "",
    "has_api_token": false,
    "newbies_list_id": "",
    "big_team_list_id": "",
    "newbies_chat_id": "",
    "big_team_chat_id": "",
    "done_status": "complete",
    "last_check_status": "",
    "last_checked_at": "",
    "last_check_error": ""
  }'::jsonb)
on conflict (key) do nothing;

notify pgrst, 'reload schema';
