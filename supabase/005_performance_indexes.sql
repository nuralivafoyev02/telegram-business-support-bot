-- 005_performance_indexes.sql
-- Admin webapp dashboard va ro'yxatlarni tezroq chiqarish uchun range query indekslari.

create index if not exists idx_support_requests_created_at
  on public.support_requests(created_at desc);

create index if not exists idx_support_requests_status_closed_at
  on public.support_requests(status, closed_at desc);

notify pgrst, 'reload schema';
