-- Trackwise initial data model. Apply only to the intended Supabase project.
create extension if not exists pgcrypto;

create table if not exists public.tw_organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 2 and 120),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.tw_memberships (
  organization_id uuid not null references public.tw_organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('admin','leader','member','stakeholder','observer')),
  joined_at timestamptz not null default now(),
  primary key (organization_id,user_id)
);

create table if not exists public.tw_teams (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.tw_organizations(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique(id,organization_id)
);

create table if not exists public.tw_team_members (
  team_id uuid not null references public.tw_teams(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('leader','member')),
  primary key(team_id,user_id)
);

create table if not exists public.tw_goals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.tw_organizations(id) on delete cascade,
  title text not null,
  description text,
  created_at timestamptz not null default now(),
  unique(id,organization_id)
);

create table if not exists public.tw_projects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.tw_organizations(id) on delete cascade,
  team_id uuid,
  goal_id uuid,
  name text not null,
  description text,
  created_at timestamptz not null default now(),
  unique(id,organization_id),
  foreign key(team_id,organization_id) references public.tw_teams(id,organization_id),
  foreign key(goal_id,organization_id) references public.tw_goals(id,organization_id)
);

create table if not exists public.tw_tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.tw_organizations(id) on delete cascade,
  project_id uuid,
  title text not null,
  description text,
  owner_id uuid references auth.users(id),
  created_by uuid not null references auth.users(id),
  status text not null default 'not_started' check (status in ('not_started','underway','awaiting_approval','blocked','rejected','completed')),
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  received_at timestamptz not null default now(),
  due_at timestamptz,
  completed_at timestamptz,
  blocker_reason text,
  next_action text,
  latest_progress text,
  handover_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key(project_id,organization_id) references public.tw_projects(id,organization_id),
  foreign key(organization_id,owner_id) references public.tw_memberships(organization_id,user_id),
  foreign key(organization_id,created_by) references public.tw_memberships(organization_id,user_id),
  check(status <> 'blocked' or nullif(trim(blocker_reason),'') is not null)
);

create table if not exists public.tw_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.tw_organizations(id) on delete cascade,
  submitted_by uuid not null references auth.users(id),
  title text not null,
  details text,
  decision text not null default 'submitted' check (decision in ('submitted','approved','deferred','rejected')),
  decision_reason text,
  decided_by uuid references auth.users(id),
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key(organization_id,submitted_by) references public.tw_memberships(organization_id,user_id),
  check (decision='submitted' or nullif(trim(decision_reason),'') is not null)
);

create index if not exists tw_tasks_org_status_due_idx on public.tw_tasks(organization_id,status,due_at);
create index if not exists tw_tasks_owner_idx on public.tw_tasks(owner_id);
create index if not exists tw_requests_org_decision_idx on public.tw_requests(organization_id,decision);

create or replace function public.tw_is_member(org uuid)
returns boolean language sql stable security definer set search_path = ''
as $$ select exists(select 1 from public.tw_memberships m where m.organization_id=org and m.user_id=(select auth.uid())) $$;

create or replace function public.tw_can_manage(org uuid)
returns boolean language sql stable security definer set search_path = ''
as $$ select exists(select 1 from public.tw_memberships m where m.organization_id=org and m.user_id=(select auth.uid()) and m.role in ('admin','leader')) $$;

alter table public.tw_organizations enable row level security;
alter table public.tw_memberships enable row level security;
alter table public.tw_teams enable row level security;
alter table public.tw_team_members enable row level security;
alter table public.tw_goals enable row level security;
alter table public.tw_projects enable row level security;
alter table public.tw_tasks enable row level security;
alter table public.tw_requests enable row level security;

create policy tw_org_select on public.tw_organizations for select to authenticated using (public.tw_is_member(id));
create policy tw_org_insert on public.tw_organizations for insert to authenticated with check (created_by=(select auth.uid()));
create policy tw_members_select on public.tw_memberships for select to authenticated using (public.tw_is_member(organization_id));
create policy tw_members_insert on public.tw_memberships for insert to authenticated with check (public.tw_can_manage(organization_id) or (user_id=(select auth.uid()) and role='admin' and exists(select 1 from public.tw_organizations o where o.id=organization_id and o.created_by=(select auth.uid()))));
create policy tw_teams_select on public.tw_teams for select to authenticated using (public.tw_is_member(organization_id));
create policy tw_teams_insert on public.tw_teams for insert to authenticated with check (public.tw_can_manage(organization_id));
create policy tw_team_members_select on public.tw_team_members for select to authenticated using (exists(select 1 from public.tw_teams t where t.id=team_id and public.tw_is_member(t.organization_id)));
create policy tw_team_members_insert on public.tw_team_members for insert to authenticated with check (exists(select 1 from public.tw_teams t where t.id=team_id and public.tw_can_manage(t.organization_id) and exists(select 1 from public.tw_memberships m where m.organization_id=t.organization_id and m.user_id=tw_team_members.user_id)));
create policy tw_goals_select on public.tw_goals for select to authenticated using (public.tw_is_member(organization_id));
create policy tw_goals_insert on public.tw_goals for insert to authenticated with check (public.tw_can_manage(organization_id));
create policy tw_projects_select on public.tw_projects for select to authenticated using (public.tw_is_member(organization_id));
create policy tw_projects_insert on public.tw_projects for insert to authenticated with check (public.tw_can_manage(organization_id));
create policy tw_tasks_select on public.tw_tasks for select to authenticated using (public.tw_is_member(organization_id));
create policy tw_tasks_insert on public.tw_tasks for insert to authenticated with check (public.tw_can_manage(organization_id));
create policy tw_tasks_update on public.tw_tasks for update to authenticated using (public.tw_can_manage(organization_id) or owner_id=(select auth.uid())) with check (public.tw_can_manage(organization_id) or owner_id=(select auth.uid()));
create policy tw_requests_select on public.tw_requests for select to authenticated using (public.tw_can_manage(organization_id) or submitted_by=(select auth.uid()));
create policy tw_requests_insert on public.tw_requests for insert to authenticated with check (public.tw_is_member(organization_id) and submitted_by=(select auth.uid()));
create policy tw_requests_update on public.tw_requests for update to authenticated using (public.tw_can_manage(organization_id)) with check (public.tw_can_manage(organization_id));
