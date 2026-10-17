-- Already applied to Supabase project lyxozmoqkljaflofupcs.
-- Atomic creation ensures the organization has its initial administrator.
create or replace function public.tw_create_organization(org_name text)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare new_id uuid;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if length(trim(org_name)) < 2 or length(trim(org_name)) > 120 then raise exception 'Organization name must be 2-120 characters'; end if;
 insert into public.tw_organizations(name,created_by) values(trim(org_name),auth.uid()) returning id into new_id;
 insert into public.tw_memberships(organization_id,user_id,role) values(new_id,auth.uid(),'admin');
 return new_id;
end; $$;
revoke all on function public.tw_create_organization(text) from public;
grant execute on function public.tw_create_organization(text) to authenticated;
