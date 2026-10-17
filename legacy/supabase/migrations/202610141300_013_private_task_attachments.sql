-- Trackwise private task attachment bucket, policies, and metadata.
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES ('trackwise-task-files','trackwise-task-files',false,10485760,
 ARRAY['image/jpeg','image/png','image/webp','application/pdf','text/plain',
 'application/msword','application/vnd.ms-excel',
 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
 'application/vnd.openxmlformats-officedocument.presentationml.presentation'])
ON CONFLICT(id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.tw_task_file_path_allowed(file_path text, writing boolean DEFAULT false)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE chunks text[]; org uuid; task uuid;
BEGIN
 IF auth.uid() IS NULL THEN RETURN false; END IF;
 chunks:=string_to_array(file_path,'/');
 IF coalesce(array_length(chunks,1),0)<>3
 OR chunks[1] !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 OR chunks[2] !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 OR length(chunks[3])<3 OR length(chunks[3])>190
 THEN RETURN false; END IF;
 org:=chunks[1]::uuid;task:=chunks[2]::uuid;
 RETURN EXISTS(SELECT 1 FROM public.tw_tasks t
 JOIN public.tw_memberships m ON m.organization_id=t.organization_id
 WHERE t.id=task AND t.organization_id=org AND m.user_id=auth.uid()
 AND (NOT writing OR m.role IN ('admin','leader','member')));
END;
$fn$;
REVOKE ALL ON FUNCTION public.tw_task_file_path_allowed(text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.tw_task_file_path_allowed(text,boolean) TO authenticated;
CREATE POLICY tw_task_files_read ON storage.objects FOR SELECT TO authenticated
USING(bucket_id='trackwise-task-files' AND public.tw_task_file_path_allowed(name,false));
CREATE POLICY tw_task_files_upload ON storage.objects FOR INSERT TO authenticated
WITH CHECK(bucket_id='trackwise-task-files' AND public.tw_task_file_path_allowed(name,true));
CREATE POLICY tw_task_files_remove ON storage.objects FOR DELETE TO authenticated
USING(bucket_id='trackwise-task-files' AND public.tw_task_file_path_allowed(name,true)
AND (owner_id=(select auth.uid())::text OR public.tw_can_manage(split_part(name,'/',1)::uuid)));

CREATE TABLE IF NOT EXISTS public.tw_task_attachments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES public.tw_organizations(id) ON DELETE CASCADE,
 task_id uuid NOT NULL REFERENCES public.tw_tasks(id) ON DELETE CASCADE,
 uploaded_by uuid NOT NULL,
 file_name text NOT NULL CHECK(length(file_name) BETWEEN 1 AND 180),
 storage_path text NOT NULL UNIQUE,
 mime_type text NOT NULL,
 file_size integer NOT NULL CHECK(file_size BETWEEN 1 AND 10485760),
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(organization_id,uploaded_by) REFERENCES public.tw_memberships(organization_id,user_id),
 CONSTRAINT tw_file_path_matches_task CHECK(
 left(storage_path,length(organization_id::text||'/'||task_id::text||'/'))
 =organization_id::text||'/'||task_id::text||'/')
);
CREATE INDEX IF NOT EXISTS tw_task_attachments_task_created ON public.tw_task_attachments(task_id,created_at DESC);
ALTER TABLE public.tw_task_attachments ENABLE ROW LEVEL SECURITY;
CREATE POLICY tw_task_attachments_read ON public.tw_task_attachments FOR SELECT TO authenticated
USING(public.tw_is_member(organization_id)
AND EXISTS(SELECT 1 FROM public.tw_tasks t WHERE t.id=tw_task_attachments.task_id AND t.organization_id=tw_task_attachments.organization_id));
CREATE POLICY tw_task_attachments_write ON public.tw_task_attachments FOR INSERT TO authenticated
WITH CHECK(uploaded_by=auth.uid() AND public.tw_task_file_path_allowed(storage_path,true)
AND EXISTS(SELECT 1 FROM storage.objects o WHERE o.bucket_id='trackwise-task-files' AND o.name=storage_path AND o.owner_id=auth.uid()::text));
CREATE POLICY tw_task_attachments_delete ON public.tw_task_attachments FOR DELETE TO authenticated
USING(uploaded_by=auth.uid() OR public.tw_can_manage(organization_id));
GRANT SELECT,INSERT,DELETE ON public.tw_task_attachments TO authenticated;
REVOKE ALL ON public.tw_task_attachments FROM anon;