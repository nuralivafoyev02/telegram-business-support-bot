-- 020_employee_avatar.sql
-- Boshqaruv paneli (role='management') xodimlari o'z profil rasmini
-- yuklashi uchun — rasm Supabase Storage'ga saqlanadi, bu yerda esa
-- faqat bucket/path va yangilangan vaqt saqlanadi.

alter table public.employees add column if not exists avatar_bucket text;
alter table public.employees add column if not exists avatar_path text;
alter table public.employees add column if not exists avatar_updated_at timestamptz;
