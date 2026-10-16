-- Multi-assignee support for tasks.
-- A task can have zero or more assignees. The legacy owner_id column is kept
-- for backward compatibility and is maintained as the first assignee.
create extension if not exists pgcrypto;

create table if not exists public.tw_task_assignees (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.tw_organizations(id) on delete cascade,
  task_id uuid not null references public.tw_tasks(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (task_id, user_id)
);

create index if not exists tw_task_assignees_org_idx on public.tw_task_assignees(organization_id);
create index if not exists tw_task_assignees_task_idx on public.tw_task_assignees(task_id);
create index if not exists tw_task_assignees_user_idx on public.tw_task_assignees(user_id);

alter table public.tw_task_assignees enable row level security;

create policy tw_task_assignees_select on public.tw_task_assignees
  for select to authenticated
  using (public.tw_is_member(organization_id));

create policy tw_task_assignees_insert on public.tw_task_assignees
  for insert to authenticated
  with check (public.tw_can_manage(organization_id));

create policy tw_task_assignees_delete on public.tw_task_assignees
  for delete to authenticated
  using (public.tw_can_manage(organization_id));

-- Backfill existing owner_id values into the join table so existing tasks keep their assignee.
insert into public.tw_task_assignees (organization_id, task_id, user_id)
select t.organization_id, t.id, t.owner_id
from public.tw_tasks t
where t.owner_id is not null
on conflict (task_id, user_id) do nothing;
