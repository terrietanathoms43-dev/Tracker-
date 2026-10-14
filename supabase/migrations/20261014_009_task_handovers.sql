-- Task handovers and reassignment
create table if not exists public.tw_task_handovers (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.tw_organizations(id) on delete cascade,
 task_id uuid not null references public.tw_tasks(id) on delete cascade,
 from_user uuid references auth.users(id),
 to_user uuid not null references auth.users(id),
 initiated_by uuid not null references auth.users(id),
 note text not null,
 created_at timestamptz not null default now()
);
alter table public.tw_task_handovers enable row level security;
create policy tw_task_handovers_read on public.tw_task_handovers for select to authenticated using(public.tw_is_member(organization_id));
revoke insert,update,delete on public.tw_task_handovers from anon,authenticated;
create index if not exists tw_task_handovers_task_idx on public.tw_task_handovers(task_id,created_at desc);
create or replace function public.tw_reassign_task(target_task uuid,new_owner uuid,handover_message text)
returns void language plpgsql security definer set search_path=''
as $$
declare t public.tw_tasks%rowtype;
begin
 select * into t from public.tw_tasks where id=target_task for update;
 if not found or not public.tw_can_manage(t.organization_id) then raise exception 'Only organization leaders can reassign tasks'; end if;
 if not exists(select 1 from public.tw_memberships where organization_id=t.organization_id and user_id=new_owner) then raise exception 'New owner must belong to the organization'; end if;
 if new_owner=t.owner_id then raise exception 'Select a different owner'; end if;
 if length(trim(coalesce(handover_message,''))) not between 3 and 2000 then raise exception 'Handover note must be 3-2000 characters'; end if;
 insert into public.tw_task_handovers(organization_id,task_id,from_user,to_user,initiated_by,note)
 values(t.organization_id,t.id,t.owner_id,new_owner,auth.uid(),trim(handover_message));
 update public.tw_tasks set owner_id=new_owner,handover_note=trim(handover_message),updated_at=now() where id=t.id;
end; $$;
revoke all on function public.tw_reassign_task(uuid,uuid,text) from public,anon;
grant execute on function public.tw_reassign_task(uuid,uuid,text) to authenticated;
