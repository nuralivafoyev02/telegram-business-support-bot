-- Ticket xabarnomalari va biriktirish maydonlari

alter table public.support_requests
  add column if not exists open_source text,
  add column if not exists opened_by_employee_id uuid references public.employees(id) on delete set null,
  add column if not exists assigned_to_employee_id uuid references public.employees(id) on delete set null,
  add column if not exists assigned_at timestamptz,
  add column if not exists notification_chat_id bigint,
  add column if not exists notification_message_id bigint;

create index if not exists idx_support_requests_assigned_open
  on public.support_requests(assigned_to_employee_id, status, created_at desc)
  where status = 'open';

alter table public.request_events drop constraint if exists request_events_event_type_check;

alter table public.request_events add constraint request_events_event_type_check
  check (event_type in ('opened','closed','cancelled','done_without_request','note','accepted','reassigned'));

create table if not exists public.ticket_notifications (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.support_requests(id) on delete cascade,
  chat_id bigint not null,
  message_id bigint not null,
  created_at timestamptz not null default now(),
  unique(request_id),
  unique(chat_id, message_id)
);

create index if not exists idx_ticket_notifications_request
  on public.ticket_notifications(request_id);

-- ticket_notifications uchun RLS (backend service_role bypass qiladi)
alter table public.ticket_notifications enable row level security;

-- PostgREST schema cache yangilash (majburiy — aks holda PGRST204 chiqadi)
notify pgrst, 'reload schema';
