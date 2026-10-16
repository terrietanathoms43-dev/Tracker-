-- Prevent assigned members from reopening approved or submitted tasks via direct RPC.
-- This migration mirrors the current live tw_set_task_status implementation and adds
-- a state guard; it must be reviewed and applied in Supabase before Production rollout.
create or replace function public.tw_set_task_status(task_id uuid,new_status text,new_blocker text default null)
returns void language plpgsql security definer set search_path=''
as $$
declare task_row public.tw_tasks%rowtype; is_manager boolean; is_writable_owner boolean;
begin
 if auth.uid() is null then raise exception 'Please sign in before updating a task'; end if;
 select * into task_row from public.tw_tasks where id=task_id for update;
 if not found then raise exception 'Task not found. Refresh and try again'; end if;
 if not public.tw_is_member(task_row.organization_id) then raise exception 'You no longer have access to this organization'; end if;
 is_manager:=public.tw_can_manage(task_row.organization_id);
 select exists(
  select 1 from public.tw_memberships m where m.organization_id=task_row.organization_id
   and m.user_id=auth.uid() and m.revoked_at is null and m.role='member'
   and task_row.owner_id=auth.uid()
 ) into is_writable_owner;
 if not (is_manager or is_writable_owner) then
  raise exception 'Only assigned members and organization leaders can update task status';
 end if;
 if new_status not in ('not_started','underway','awaiting_approval','blocked','rejected','completed') then
  raise exception 'Invalid task status';
 end if;
 if not is_manager and task_row.status in ('awaiting_approval','completed') then
  raise exception 'This task is awaiting review or already approved. Ask a leader to change its status.';
 end if;
 if new_status='completed' and not is_manager then
  raise exception 'Submit the task for approval; a leader can mark it completed';
 end if;
 if new_status='rejected' and (not is_manager or task_row.status<>'awaiting_approval') then
  raise exception 'Only a leader can return work awaiting approval';
 end if;
 if new_status='blocked' and nullif(trim(coalesce(new_blocker,'')),'') is null then
  raise exception 'Please explain what is blocking the task';
 end if;
 update public.tw_tasks set
  status=new_status,
  blocker_reason=case when new_status='blocked' then trim(new_blocker) else null end,
  completed_at=case when new_status='completed' then now() else null end,
  updated_at=now()
 where id=task_id;
end;
$$;
revoke execute on function public.tw_set_task_status(uuid,text,text) from public,anon;
grant execute on function public.tw_set_task_status(uuid,text,text) to authenticated;
