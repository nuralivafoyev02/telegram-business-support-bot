-- Enable 💯 reaction ticket close (admin panel previously saved ticket_close: false).

update public.bot_settings
set
  value = jsonb_set(value, '{ticket_close}', 'true'::jsonb, true),
  updated_at = now()
where key = 'message_reactions'
  and coalesce((value->>'ticket_close')::boolean, false) is not true;
