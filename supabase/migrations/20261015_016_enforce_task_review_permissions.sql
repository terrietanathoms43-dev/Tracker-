-- Trackwise security audit: enforce organization membership and task review permissions
-- at the database boundary, not only in React controls.
-- Compatible with original memberships schema and installations that add revoked_at later.

create or replace function public.tw_is_member(org uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
 select exists(
  select 1 from public.tw_memberships m
  where m.organization_id=org
    and m.user_id=(select auth.uid())
    and (to_jsonb(m)->>'revoked_at') is null
 );
$$;

create or replace function public.tw_can_manage(org uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
 select exists(
  select 1 from public.tw_memberships m
  where m.organization_id=org
    and m.user_id=(select auth.uid())
    and m.role in ('admin','leader')
    and (to_jsonb(m)->>'revoked_at') is null
 );
$$;

create or replace function public.tw_set_task_status(
 task_id uuid,new_status text,new_blocker text default null
) returns void language plpgsql security definer set search_path = ''
as $$
declare
 t public.tw_tasks%rowtype;
 is_manager boolean;
 is_assigned_member boolean;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 select * into t from public.tw_tasks where id=task_id for update;
 if not found then raise exception 'Task not found'; end if;

 is_manager := public.tw_can_manage(t.organization_id);
 select exists(
  select 1 from public.tw_memberships m
  where m.organization_id=t.organization_id
    and m.user_id=auth.uid()
    and m.role='member'
    and t.owner_id=auth.uid()
    and (to_jsonb(m)->>'revoked_at') is null
 ) into is_assigned_member;

 if not (is_manager or is_assigned_member) then
  raise exception 'Permission denied';
 end if;
 if new_status not in ('not_started','underway','awaiting_approval','blocked','rejected','completed')
 then raise exception 'Invalid status'; end if;

 -- Only leaders may approve completion, request revisions, or change submitted/completed work.
 if not is_manager and (
    new_status in ('completed','rejected') or
    t.status in ('completed','awaiting_approval')
 ) then
  raise exception 'Only organization leaders may review or change submitted and completed work';
 end if;
 if new_status='blocked' and nullif(trim(coalesce(new_blocker,'')),'') is null then
  raise exception 'Blocker reason required';
 end if;

 update public.tw_tasks
 set status=new_status,
     blocker_reason=case when new_status='blocked' then trim(new_blocker) else null end,
     completed_at=case when new_status='completed' then now() else null end,
     updated_at=now()
 where id=task_id;
end;
$$;

revoke execute on function public.tw_set_task_status(uuid,text,text) from public,anon;
grant execute on function public.tw_set_task_status(uuid,text,text) to authenticated;
