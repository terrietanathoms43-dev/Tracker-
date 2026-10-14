-- Project planning, organization goals and safe member display names.
alter table public.tw_goals add column if not exists target_date date;
alter table public.tw_goals add column if not exists status text not null default 'active' check(status in ('active','achieved','paused'));
alter table public.tw_projects add column if not exists status text not null default 'active' check(status in ('active','on_hold','completed'));
create index if not exists tw_projects_org_idx on public.tw_projects(organization_id);
create index if not exists tw_goals_org_idx on public.tw_goals(organization_id);
-- Ensure users cannot assign a task to another organization via project.
create or replace function public.tw_member_directory(org_id uuid)
returns table(user_id uuid,display_name text,role text) language sql stable security definer set search_path=''
as $$
 select m.user_id,coalesce(nullif(trim(u.raw_user_meta_data->>'full_name'),''),split_part(u.email,'@',1)),m.role
 from public.tw_memberships m join auth.users u on u.id=m.user_id
 where m.organization_id=org_id and public.tw_is_member(org_id)
 order by 2
$$;
revoke all on function public.tw_member_directory(uuid) from public;
grant execute on function public.tw_member_directory(uuid) to authenticated;
-- Log organizational planning changes without exposing arbitrary writes to activity.
create or replace function public.tw_audit_plan() returns trigger language plpgsql security definer set search_path=''
as $$
begin
 insert into public.tw_activity(organization_id,actor_id,entity_type,entity_id,action)
 values(new.organization_id,auth.uid(),TG_TABLE_NAME,new.id,lower(TG_OP));
 return new;
end $$;
drop trigger if exists tw_projects_audit on public.tw_projects;
create trigger tw_projects_audit after insert or update on public.tw_projects for each row execute function public.tw_audit_plan();
drop trigger if exists tw_goals_audit on public.tw_goals;
create trigger tw_goals_audit after insert or update on public.tw_goals for each row execute function public.tw_audit_plan();
-- Restrict task changes to the controlled status RPC; no direct update grants.
revoke update on public.tw_goals,public.tw_projects from authenticated;
