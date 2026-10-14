-- Cover organizational filtering and foreign-key lookups for new features.
CREATE INDEX IF NOT EXISTS tw_comments_org_author ON public.tw_task_comments(organization_id,author_id);
CREATE INDEX IF NOT EXISTS tw_attachments_org_uploader ON public.tw_task_attachments(organization_id,uploaded_by);
CREATE INDEX IF NOT EXISTS tw_recurring_org_created ON public.tw_recurring_tasks(organization_id,created_at DESC);
CREATE INDEX IF NOT EXISTS tw_recurring_org_creator ON public.tw_recurring_tasks(organization_id,created_by);
CREATE INDEX IF NOT EXISTS tw_recurring_org_owner ON public.tw_recurring_tasks(organization_id,owner_id);
CREATE INDEX IF NOT EXISTS tw_recurring_project_org ON public.tw_recurring_tasks(project_id,organization_id);