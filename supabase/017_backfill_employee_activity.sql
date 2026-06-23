-- 017_backfill_employee_activity.sql
-- 016 dan keyin mavjud raw dan employee_activity ni to'ldirish.

update public.company_module_daily_reports as r
set employee_activity = sub.activity
from (
  select
    id,
    jsonb_build_object(
      'total_actions', greatest(
        coalesce(nullif(trim(raw->'data'->>'total_actions'), ''), '0')::numeric,
        coalesce((
          select sum(coalesce((e->>'action_count')::numeric, 0))
          from jsonb_array_elements(coalesce(raw->'data'->'active_employees', '[]'::jsonb)) as e
        ), 0)
      ),
      'activity_period', coalesce(raw->'data'->>'activity_period', ''),
      'active_employees', coalesce(raw->'data'->'active_employees', '[]'::jsonb),
      'inactive_employees', coalesce(raw->'data'->'inactive_employees', '[]'::jsonb),
      'active_employee_count', jsonb_array_length(coalesce(raw->'data'->'active_employees', '[]'::jsonb)),
      'inactive_employee_count', jsonb_array_length(coalesce(raw->'data'->'inactive_employees', '[]'::jsonb)),
      'support', coalesce(raw->'data'->'support', '{}'::jsonb)
    ) as activity
  from public.company_module_daily_reports
  where employee_activity is null
    and raw is not null
    and (
      jsonb_array_length(coalesce(raw->'data'->'active_employees', '[]'::jsonb)) > 0
      or jsonb_array_length(coalesce(raw->'data'->'inactive_employees', '[]'::jsonb)) > 0
      or coalesce(nullif(trim(raw->'data'->>'total_actions'), ''), '') <> ''
      or coalesce(nullif(trim(raw->'data'->>'activity_period'), ''), '') <> ''
    )
) as sub
where r.id = sub.id;

-- Tekshirish:
-- select
--   count(*) filter (where employee_activity is not null) as with_activity,
--   count(*) filter (where employee_activity is null and raw is not null) as raw_without_activity,
--   count(*) as total
-- from public.company_module_daily_reports;
