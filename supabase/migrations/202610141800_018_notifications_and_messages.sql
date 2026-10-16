-- User notifications and team messages.
-- Budget and dependencies are handled separately; this migration focuses on
-- the notification center and team collaboration chat.

create table if not exists public.tw_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  organization_id uuid not null references public.tw_organizations(id) on delete cascade,
  type text not null default 'info',
  title text not null,
  message text,
  read_at timestamptz,
  dedupe_key text,
  created_at timestamptz not null default now(),
  unique(user_id, dedupe_key)
);

create index if not exists tw_notifications_user_read_idx on public.tw_notifications(user_id, read_at, created_at desc);
create index if not exists tw_notifications_org_idx on public.tw_notifications(organization_id);

alter table public.tw_notifications enable row level security;

create policy tw_notifications_select on public.tw_notifications
  for select to authenticated using (user_id = (select auth.uid()));

create policy tw_notifications_insert on public.tw_notifications
  for insert to authenticated with check (user_id = (select auth.uid()));

create policy tw_notifications_update on public.tw_notifications
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Mark a notification as read for the current user.
create or replace function public.tw_mark_notification_read(notification_id uuid)
returns void language sql security definer set search_path=''
as $$
  update public.tw_notifications
  set read_at = now()
  where id = notification_id and user_id = (select auth.uid());
$$;
revoke all on function public.tw_mark_notification_read(uuid) from public;
grant execute on function public.tw_mark_notification_read(uuid) to authenticated;

-- Generate due-date reminders for tasks due within 48h or overdue.
create or replace function public.tw_generate_due_notifications()
returns void language plpgsql security definer set search_path=''
as $$
begin
  insert into public.tw_notifications(user_id, organization_id, type, title, message, dedupe_key)
  select
    t.owner_id,
    t.organization_id,
    'due_soon',
    'Task due soon',
    t.title || ' is due ' || coalesce(to_char(t.due_at, 'YYYY-MM-DD'), 'soon'),
    t.id || ':due_soon'
  from public.tw_tasks t
  where t.status <> 'completed'
    and t.due_at between now() and now() + interval '48 hours'
    and t.owner_id is not null
  on conflict (user_id, dedupe_key) do nothing;

  insert into public.tw_notifications(user_id, organization_id, type, title, message, dedupe_key)
  select
    t.owner_id,
    t.organization_id,
    'overdue',
    'Task overdue',
    t.title || ' was due ' || to_char(t.due_at, 'YYYY-MM-DD'),
    t.id || ':overdue'
  from public.tw_tasks t
  where t.status <> 'completed'
    and t.due_at < now()
    and t.owner_id is not null
  on conflict (user_id, dedupe_key) do nothing;
end;
$$;
revoke all on function public.tw_generate_due_notifications() from public;
grant execute on function public.tw_generate_due_notifications() to authenticated;

-- Team-scoped messages for collaboration.
create table if not exists public.tw_messages (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.tw_teams(id) on delete cascade,
  sender_id uuid not null references auth.users(id),
  content text not null check (length(trim(content)) between 1 and 4000),
  created_at timestamptz not null default now()
);

create index if not exists tw_messages_team_created_idx on public.tw_messages(team_id, created_at desc);

alter table public.tw_messages enable row level security;

create policy tw_messages_select on public.tw_messages
  for select to authenticated using (
    exists(select 1 from public.tw_team_members tm where tm.team_id = tw_messages.team_id and tm.user_id = (select auth.uid()))
    or exists(select 1 from public.tw_teams t where t.id = tw_messages.team_id and public.tw_can_manage(t.organization_id))
  );

create policy tw_messages_insert on public.tw_messages
  for insert to authenticated with check (
    exists(select 1 from public.tw_team_members tm where tm.team_id = tw_messages.team_id and tm.user_id = (select auth.uid()))
    or exists(select 1 from public.tw_teams t where t.id = tw_messages.team_id and public.tw_can_manage(t.organization_id))
  );
