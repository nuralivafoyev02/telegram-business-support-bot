-- 014_migrate_bot_settings_daily.sql
-- bot_settings (uyqur_company_report_history) -> company_module_daily_reports
-- Faqat 2026-06-15 va 2026-06-16 kunlarini ko'chiradi.

insert into public.company_module_daily_reports (
  tenant_id,
  report_date,
  company_id,
  company_name,
  module_usage,
  module_last_dates,
  module_active_count,
  source_url,
  fetched_at
)
select
  bs.tenant_id,
  day.key::date as report_date,
  nullif(c->>'company_id', '')::bigint as company_id,
  coalesce(c->>'company_name', '') as company_name,
  coalesce(c->'module_usage', '{}'::jsonb) as module_usage,
  coalesce(c->'module_last_dates', '{}'::jsonb) as module_last_dates,
  coalesce(nullif(c->>'module_active_count', '')::smallint, 0) as module_active_count,
  'migrated:bot_settings' as source_url,
  coalesce(
    nullif(day.value->>'fetched_at', '')::timestamptz,
    bs.updated_at,
    now()
  ) as fetched_at
from public.bot_settings bs
cross join lateral jsonb_each(coalesce(bs.value->'days', '{}'::jsonb)) as day(key, value)
cross join lateral jsonb_array_elements(coalesce(day.value->'companies', '[]'::jsonb)) as c
where bs.key = 'uyqur_company_report_history'
  and day.key in ('2026-06-15', '2026-06-16')
  and nullif(c->>'company_id', '') is not null
on conflict (tenant_id, report_date, company_id) do update set
  company_name = excluded.company_name,
  module_usage = excluded.module_usage,
  module_last_dates = excluded.module_last_dates,
  module_active_count = excluded.module_active_count,
  source_url = excluded.source_url,
  fetched_at = excluded.fetched_at;

-- Tekshirish:
-- select report_date, count(*) as companies, max(fetched_at) as last_fetch
-- from public.company_module_daily_reports
-- where report_date in ('2026-06-15', '2026-06-16')
-- group by report_date
-- order by report_date;
