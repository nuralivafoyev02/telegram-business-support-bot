-- 019_employee_login_credentials.sql
-- Support xodimlariga webapp'ga shaxsiy hisob bilan kirish imkonini beradi
-- (employees jadvaliga login uchun parol ustunlari qo'shiladi).

alter table public.employees add column if not exists password_hash text;
alter table public.employees add column if not exists last_login_at timestamptz;

-- Login vaqtida tenant konteksti hali aniqlanmagan (admins jadvalidagi login()
-- bilan bir xil holat), shuning uchun username bo'yicha qidiruv global bo'ladi —
-- faqat parol o'rnatilgan xodimlar orasida username unikal bo'lishi kerak
-- (admins.username kabi).
create unique index if not exists employees_username_login_key
  on public.employees (username)
  where password_hash is not null;
