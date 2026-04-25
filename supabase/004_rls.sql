-- 004_rls.sql
-- Xavfsizlik: backend service_role ishlatadi. Frontend DBga to‘g‘ridan-to‘g‘ri ulanmaydi.
-- Shuning uchun anon/authenticated rollar uchun default yopiq, service_role esa by design bypass qiladi.

alter table public.admins enable row level security;
alter table public.bot_settings enable row level security;
alter table public.tg_users enable row level security;
alter table public.companies enable row level security;
alter table public.tg_chats enable row level security;
alter table public.business_connections enable row level security;
alter table public.employees enable row level security;
alter table public.company_members enable row level security;
alter table public.messages enable row level security;
alter table public.support_requests enable row level security;
alter table public.request_events enable row level security;
alter table public.broadcasts enable row level security;
alter table public.broadcast_targets enable row level security;

-- Service role uchun alohida policy kerak emas, u RLS bypass qiladi.
-- Kelajakda Supabase Auth qo‘shilsa, authenticated role uchun SELECT/INSERT policy qo‘shish mumkin.
