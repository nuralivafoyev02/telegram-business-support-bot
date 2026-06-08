-- 012_tenant_bootstrap.sql
-- Yangi tenant (2, 3, 4...) uchun BO'SH default sozlamalar.
-- Boshqa tenantdan HECH NARSA nusxalanmaydi.
--
-- MUHIM: Butun faylni 1-qatordan oxirigacha RUN qiling (faqat pastki qismni emas).

create or replace function public.seed_tenant_defaults(p_tenant_id integer)
returns void
language plpgsql
as $$
begin
  if p_tenant_id is null or p_tenant_id < 1 then
    raise exception 'tenant_id noto''g''ri';
  end if;

  insert into public.bot_settings (tenant_id, key, value)
  values
    (p_tenant_id, 'ai_mode', '{"enabled": false, "provider": null}'::jsonb),
    (p_tenant_id, 'ai_integration', '{}'::jsonb),
    (p_tenant_id, 'log_notifications', '{"enabled": false, "levels": ["error"], "target": "main_group"}'::jsonb),
    (p_tenant_id, 'group_message_audit', '{"enabled": true, "target": "main_group", "channel_id": ""}'::jsonb),
    (p_tenant_id, 'message_reactions', '{"enabled": false, "ticket_close": true, "emoji": "\u26a1"}'::jsonb),
    (p_tenant_id, 'ticket_notifications', '{"enabled": false, "target_chat_id": "", "notify_on_ai": true, "notify_on_reaction": true}'::jsonb),
    (p_tenant_id, 'clickup_integration', '{"enabled": false, "api_token": "", "has_api_token": false, "newbies_list_id": "", "big_team_list_id": "", "newbies_chat_id": "", "big_team_chat_id": "", "done_status": "complete", "last_check_status": "", "last_checked_at": "", "last_check_error": ""}'::jsonb),
    (p_tenant_id, 'auto_reply', '{"enabled": true}'::jsonb),
    (p_tenant_id, 'done_tag', '{"tag": "#done", "auto_reply": true}'::jsonb),
    (p_tenant_id, 'request_detection', '{"mode": "keyword", "min_text_length": 10}'::jsonb),
    (p_tenant_id, 'main_group', '{"chat_id": ""}'::jsonb)
  on conflict (tenant_id, key) do nothing;
end;
$$;

create or replace function public.bootstrap_tenant(p_tenant_id integer)
returns void
language plpgsql
as $$
begin
  if p_tenant_id is null or p_tenant_id < 1 then
    raise exception 'tenant_id noto''g''ri';
  end if;
  if p_tenant_id = 1 then
    raise exception 'Tenant 1 uchun bootstrap kerak emas';
  end if;

  delete from public.bot_settings
  where tenant_id = p_tenant_id
    and key = 'uyqur_company_info_cache';

  delete from public.bot_settings
  where tenant_id = p_tenant_id
    and key in (
      'ai_mode', 'ai_integration', 'log_notifications', 'group_message_audit',
      'message_reactions', 'ticket_notifications', 'clickup_integration',
      'auto_reply', 'done_tag', 'request_detection', 'main_group'
    );

  perform public.seed_tenant_defaults(p_tenant_id);
end;
$$;

-- Tenant 2: noto'g'ri nusxa tozalash + bo'sh defaultlar
select public.bootstrap_tenant(2);

-- ---------------------------------------------------------------------------
-- Tenant 3+ qo'shish namunasi (kerak bo'lganda commentdan chiqaring):
-- ---------------------------------------------------------------------------
-- insert into public.tenants (id, name, slug)
-- values (3, 'Company 3', 'company3')
-- on conflict (id) do nothing;
--
-- select public.bootstrap_tenant(3);
--
-- insert into public.admins (username, password_hash, full_name, role, is_active, tenant_id)
-- values ('admin3', '...hash...', 'Company 3 Admin', 'owner', true, 3)
-- on conflict (username) do nothing;

notify pgrst, 'reload schema';
