-- Member removal, self-leave, role changes, team unassignment, and org deletion.
-- These RPCs previously existed only on the remote database; reintroduced so a
-- fresh `supabase db push` restores them.
--
-- Many columns carry a composite FK into tw_memberships(organization_id,user_id)
-- (task owner/creator, request submitter, comment author, attachment uploader,
-- recurring rule creator/owner). Deleting a membership row would violate them,
-- so tw_detach_member reassigns authored records to a fallback member first.

create or replace function public.tw_detach_member(org_id uuid, member_id uuid, fallback_id uuid)
returns void language plpgsql security definer set search_path=''
as $$
begin
 -- Free-up nullable ownership references first.
 update public.tw_tasks set owner_id=null where organization_id=org_id and owner_id=member_id;
 update public.tw_recurring_tasks set owner_id=null where organization_id=org_id and owner_id=member_id;
 -- Reassign non-nullable authorship columns to the fallback member.
 update public.tw_tasks set created_by=fallback_id where organization_id=org_id and created_by=member_id;
 update public.tw_recurring_tasks set created_by=fallback_id where organization_id=org_id and created_by=member_id;
 update public.tw_requests set submitted_by=fallback_id where organization_id=org_id and submitted_by=member_id;
 update public.tw_task_comments set author_id=fallback_id where organization_id=org_id and author_id=member_id;
 update public.tw_task_attachments set uploaded_by=fallback_id where organization_id=org_id and uploaded_by=member_id;
 -- Drop rows that only exist while the member belongs to the organization.
 delete from public.tw_task_assignees where organization_id=org_id and user_id=member_id;
 delete from public.tw_team_members tm
   using public.tw_teams t
   where t.id=tm.team_id and t.organization_id=org_id and tm.user_id=member_id;
 delete from public.tw_notifications where organization_id=org_id and user_id=member_id;
 delete from public.tw_memberships where organization_id=org_id and user_id=member_id;
end; $$;
revoke all on function public.tw_detach_member(uuid,uuid,uuid) from public, anon, authenticated;

create or replace function public.tw_leave_organization(org_id uuid, member_id uuid)
returns void language plpgsql security definer set search_path=''
as $$
declare actor uuid := auth.uid();
declare my_role text;
declare fallback uuid;
begin
 if actor is null then raise exception 'Authentication required'; end if;
 if member_id <> actor then raise exception 'You can only remove yourself'; end if;
 select role into my_role from public.tw_memberships where organization_id=org_id and user_id=actor;
 if my_role is null then raise exception 'Not a member'; end if;
 select user_id into fallback from public.tw_memberships
   where organization_id=org_id and user_id<>actor
   order by case role when 'admin' then 0 when 'leader' then 1 else 2 end, joined_at
   limit 1;
 if fallback is null then
   raise exception 'You are the last member. Delete the organization instead.';
 end if;
 if my_role='admin' and not exists(
   select 1 from public.tw_memberships
   where organization_id=org_id and user_id<>actor and role='admin'
 ) then
   raise exception 'Promote another administrator before leaving';
 end if;
 perform public.tw_detach_member(org_id, actor, fallback);
 insert into public.tw_activity(organization_id,actor_id,entity_type,entity_id,action,details)
 values(org_id,actor,'member',actor,'left','{}'::jsonb);
end; $$;
revoke all on function public.tw_leave_organization(uuid,uuid) from public;
grant execute on function public.tw_leave_organization(uuid,uuid) to authenticated;

create or replace function public.tw_remove_member(org_id uuid, member_id uuid)
returns void language plpgsql security definer set search_path=''
as $$
declare actor uuid := auth.uid();
declare target_role text;
begin
 if actor is null then raise exception 'Authentication required'; end if;
 if member_id = actor then raise exception 'Use tw_leave_organization to remove yourself'; end if;
 if not public.tw_can_manage(org_id) then raise exception 'Permission denied'; end if;
 select role into target_role from public.tw_memberships where organization_id=org_id and user_id=member_id;
 if target_role is null then raise exception 'User is not a member'; end if;
 if target_role='admin' and not exists(
   select 1 from public.tw_memberships
   where organization_id=org_id and user_id<>member_id and role='admin'
 ) then
   raise exception 'Cannot remove the last administrator';
 end if;
 perform public.tw_detach_member(org_id, member_id, actor);
 insert into public.tw_activity(organization_id,actor_id,entity_type,entity_id,action,details)
 values(org_id,actor,'member',member_id,'removed',jsonb_build_object('previous_role',target_role));
end; $$;
revoke all on function public.tw_remove_member(uuid,uuid) from public;
grant execute on function public.tw_remove_member(uuid,uuid) to authenticated;

create or replace function public.tw_change_member_role(org_id uuid, member_id uuid, new_role text)
returns void language plpgsql security definer set search_path=''
as $$
declare actor uuid := auth.uid();
declare target_role text;
begin
 if actor is null then raise exception 'Authentication required'; end if;
 if new_role not in ('admin','leader','member','stakeholder','observer') then raise exception 'Invalid role'; end if;
 if not exists(
   select 1 from public.tw_memberships
   where organization_id=org_id and user_id=actor and role='admin'
 ) then
   raise exception 'Only administrators can change member roles';
 end if;
 select role into target_role from public.tw_memberships where organization_id=org_id and user_id=member_id;
 if target_role is null then raise exception 'User is not a member'; end if;
 if target_role='admin' and new_role<>'admin' and not exists(
   select 1 from public.tw_memberships
   where organization_id=org_id and user_id<>member_id and role='admin'
 ) then
   raise exception 'Cannot demote the last administrator';
 end if;
 update public.tw_memberships set role=new_role where organization_id=org_id and user_id=member_id;
 insert into public.tw_activity(organization_id,actor_id,entity_type,entity_id,action,details)
 values(org_id,actor,'member',member_id,'role_changed',jsonb_build_object('role',new_role,'previous_role',target_role));
end; $$;
revoke all on function public.tw_change_member_role(uuid,uuid,text) from public;
grant execute on function public.tw_change_member_role(uuid,uuid,text) to authenticated;

create or replace function public.tw_unassign_team_member(target_team uuid, target_user uuid)
returns void language plpgsql security definer set search_path=''
as $$
declare org uuid;
begin
 select organization_id into org from public.tw_teams where id=target_team;
 if org is null or not public.tw_can_manage(org) then raise exception 'Permission denied'; end if;
 delete from public.tw_team_members where team_id=target_team and user_id=target_user;
 insert into public.tw_activity(organization_id,actor_id,entity_type,entity_id,action,details)
 values(org,auth.uid(),'team_member',target_team,'unassigned',jsonb_build_object('user_id',target_user));
end; $$;
revoke all on function public.tw_unassign_team_member(uuid,uuid) from public;
grant execute on function public.tw_unassign_team_member(uuid,uuid) to authenticated;

create or replace function public.tw_delete_organization(org_id uuid)
returns void language plpgsql security definer set search_path=''
as $$
declare actor uuid := auth.uid();
begin
 if actor is null then raise exception 'Authentication required'; end if;
 if not exists(
   select 1 from public.tw_memberships
   where organization_id=org_id and user_id=actor and role='admin'
 ) then
   raise exception 'Only administrators can delete the organization';
 end if;
 -- All org-scoped tables reference tw_organizations with ON DELETE CASCADE.
 delete from public.tw_organizations where id=org_id;
end; $$;
revoke all on function public.tw_delete_organization(uuid) from public;
grant execute on function public.tw_delete_organization(uuid) to authenticated;
