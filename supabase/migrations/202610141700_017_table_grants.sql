-- Ensure the authenticated role can access tables through RLS policies.
-- Supabase migrations do not always inherit the default dashboard grants,
-- so we set them explicitly here for existing and future tables.
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public grant usage, select on sequences to authenticated;

-- Service role should also retain direct access for admin/maintenance operations.
grant usage on schema public to service_role;
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;

alter default privileges in schema public grant select, insert, update, delete on tables to service_role;
alter default privileges in schema public grant usage, select on sequences to service_role;
