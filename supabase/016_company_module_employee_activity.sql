-- 016_company_module_employee_activity.sql
-- Kunlik kompaniya hisobotlarida xodimlar faolligini alohida saqlash.

alter table public.company_module_daily_reports
  add column if not exists employee_activity jsonb;
