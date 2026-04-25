-- 003_views.sql
-- Webapp uchun tayyor statistik viewlar.

create or replace view public.v_employee_statistics as
select
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
  coalesce(round(avg(extract(epoch from (sr.closed_at - sr.created_at)) / 60) filter (where sr.closed_at is not null)::numeric, 1), 0) as avg_close_minutes
from public.employees e
left join public.support_requests sr on sr.closed_by_employee_id = e.id
group by e.id;

create or replace view public.v_chat_statistics as
select
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
left join public.companies co on co.id = c.company_id
left join public.support_requests sr on sr.chat_id = c.chat_id
group by c.chat_id, co.name;

create or replace view public.v_company_statistics as
with request_company as (
  select
    sr.*,
    coalesce(sr.company_id, c.company_id) as resolved_company_id
  from public.support_requests sr
  left join public.tg_chats c on c.chat_id = sr.chat_id
)
select
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
left join public.tg_chats c on c.company_id = co.id
left join public.company_members cm on cm.company_id = co.id and cm.is_active = true
left join request_company sr on sr.resolved_company_id = co.id
group by co.id;

create or replace view public.v_today_summary as
select
  count(sr.id) filter (where sr.created_at::date = timezone('Asia/Tashkent', now())::date) as total_requests,
  count(sr.id) filter (where sr.status = 'open') as open_requests,
  count(sr.id) filter (where sr.status = 'closed' and sr.closed_at::date = timezone('Asia/Tashkent', now())::date) as closed_requests,
  (select count(*) from public.tg_chats where source_type = 'group' and is_active = true) as groups_count,
  (select count(*) from public.tg_chats where source_type in ('private','business') and is_active = true) as private_chats_count,
  (select count(*) from public.companies where is_active = true) as companies_count;
