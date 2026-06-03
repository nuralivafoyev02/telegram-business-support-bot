-- 008_reload_postgrest_schema.sql
-- 007 dan keyin yoki ustunlar qo‘shilgandan keyin bir marta ishga tushiring.
-- PGRST204: "Could not find the 'open_source' column" xatosi cache eskirganida chiqadi.

notify pgrst, 'reload schema';
