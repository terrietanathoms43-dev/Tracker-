-- Prevent cross-organization mutations and privilege escalation.
drop policy if exists tw_members_insert on public.tw_memberships;
create policy tw_members_insert on public.tw_memberships for insert to authenticated
with check (public.tw_can_manage(organization_id) and role <> 'admin');
-- Membership administration is handled by audited RPCs; direct role updates are prohibited.
drop policy if exists tw_tasks_update on public.tw_tasks;
create policy tw_tasks_update on public.tw_tasks for update to authenticated
using (public.tw_can_manage(organization_id) or owner_id=(select auth.uid()))
with check (public.tw_can_manage(organization_id) or owner_id=(select auth.uid()));
-- RLS cannot prevent changing individual protected columns. Only permit task updates via restricted RPC.
revoke update on public.tw_tasks from authenticated;
create or replace function public.tw_set_task_status(task_id uuid,new_status text,new_blocker text default null)
returns void language plpgsql security definer set search_path = ''
as $$
declare t public.tw_tasks%rowtype;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 select * into t from public.tw_tasks where id=task_id for update;
 if not found then raise exception 'Task not found'; end if;
 if not (public.tw_can_manage(t.organization_id) or t.owner_id=auth.uid()) then raise exception 'Permission denied'; end if;
 if new_status not in ('not_started','underway','awaiting_approval','blocked','rejected','completed') then raise exception 'Invalid status'; end if;
 if new_status='blocked' and nullif(trim(coalesce(new_blocker,'')),'') is null then raise exception 'Blocker reason required'; end if;
 update public.tw_tasks set status=new_status,blocker_reason=case when new_status='blocked' then trim(new_blocker) else null end,
 completed_at=case when new_status='completed' then now() else null end,updated_at=now()
 where id=task_id;
end; $$;
revoke all on function public.tw_set_task_status(uuid,text,text) from public;
grant execute on function public.tw_set_task_status(uuid,text,text) to authenticated;
-- Organization membership can only be inserted by server-side RPC after verifying the acting user's role.
revoke insert,update,delete on public.tw_memberships from authenticated;
create or replace function public.tw_add_member(member_email text, org_id uuid, member_role text default 'member')
returns void language plpgsql security definer set search_path = ''
as $$
declare target_user uuid;
begin
 if not public.tw_can_manage(org_id) then raise exception 'Permission denied'; end if;
 if member_role not in ('member','leader','observer','stakeholder') then raise exception 'Invalid role'; end if;
 select id into target_user from auth.users where lower(email)=lower(trim(member_email)) and email_confirmed_at is not null;
 if target_user is null then raise exception 'User must register and confirm their email before being added'; end if;
 insert into public.tw_memberships(organization_id,user_id,role) values(org_id,target_user,member_role);
end; $$;
revoke all on function public.tw_add_member(text,uuid,text) from public;
grant execute on function public.tw_add_member(text,uuid,text) to authenticated;
-- Restrict team membership insertion to a manager, not an arbitrary organization member.
revoke update,delete on public.tw_team_members from authenticated;
