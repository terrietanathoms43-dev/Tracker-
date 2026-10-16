-- Explicit role revocation: revoking PUBLIC alone does not remove direct role grants.
revoke execute on all functions in schema public from anon;
revoke execute on function public.tw_audit_change(), public.tw_audit_plan() from authenticated;
grant execute on function public.tw_create_organization(text),public.tw_is_member(uuid),public.tw_can_manage(uuid),public.tw_set_task_status(uuid,text,text),public.tw_add_member(text,uuid,text),public.tw_assign_team_member(uuid,uuid,text),public.tw_decide_request(uuid,text,text),public.tw_member_directory(uuid) to authenticated;
-- Add indexes for common membership and organization-scoped lookups.
create index if not exists tw_memberships_user_idx on public.tw_memberships(user_id);
create index if not exists tw_team_members_user_idx on public.tw_team_members(user_id);
create index if not exists tw_teams_org_idx on public.tw_teams(organization_id);
create index if not exists tw_tasks_org_owner_idx on public.tw_tasks(organization_id,owner_id);
create index if not exists tw_tasks_org_project_idx on public.tw_tasks(project_id,organization_id);
create index if not exists tw_requests_submitter_idx on public.tw_requests(organization_id,submitted_by);
create index if not exists tw_activity_actor_idx on public.tw_activity(actor_id);
create index if not exists tw_org_created_by_idx on public.tw_organizations(created_by);
