-- Trackwise recurring tasks, manager-only RPCs, and daily materialization.
CREATE TABLE IF NOT EXISTS public.tw_recurring_tasks (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES public.tw_organizations(id) ON DELETE CASCADE,
 created_by uuid NOT NULL,
 owner_id uuid,
 project_id uuid,
 title text NOT NULL CHECK(length(btrim(title)) BETWEEN 2 AND 180),
 description text CHECK(length(coalesce(description,''))<=4000),
 priority text NOT NULL DEFAULT 'normal' CHECK(priority IN ('low','normal','high','urgent')),
 frequency text NOT NULL CHECK(frequency IN ('daily','weekly','monthly')),
 next_due_at timestamptz NOT NULL,
 active boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(organization_id,created_by) REFERENCES public.tw_memberships(organization_id,user_id),
 FOREIGN KEY(organization_id,owner_id) REFERENCES public.tw_memberships(organization_id,user_id),
 FOREIGN KEY(project_id,organization_id) REFERENCES public.tw_projects(id,organization_id)
);
CREATE INDEX IF NOT EXISTS tw_recurrences_due ON public.tw_recurring_tasks(next_due_at) WHERE active;
ALTER TABLE public.tw_recurring_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY tw_recurrences_read ON public.tw_recurring_tasks FOR SELECT TO authenticated USING(public.tw_is_member(organization_id));
GRANT SELECT ON public.tw_recurring_tasks TO authenticated;
REVOKE ALL ON public.tw_recurring_tasks FROM anon;
ALTER TABLE public.tw_tasks ADD COLUMN IF NOT EXISTS recurrence_id uuid REFERENCES public.tw_recurring_tasks(id) ON DELETE SET NULL;
ALTER TABLE public.tw_tasks ADD COLUMN IF NOT EXISTS recurrence_due_at timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS tw_task_recurring_instance ON public.tw_tasks(recurrence_id,recurrence_due_at)
 WHERE recurrence_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.tw_create_recurring_task(
 org_id uuid,first_due_at timestamptz,task_title text,task_description text,
 task_priority text,task_owner uuid,task_project uuid,task_frequency text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $f$
DECLARE rec_id uuid; due_increment interval;
BEGIN
 IF auth.uid() IS NULL OR NOT public.tw_can_manage(org_id)
 THEN RAISE EXCEPTION 'Only organization leaders can schedule repeating tasks'; END IF;
 IF length(btrim(coalesce(task_title,''))) NOT BETWEEN 2 AND 180 OR length(coalesce(task_description,''))>4000
 THEN RAISE EXCEPTION 'Enter a valid title and description'; END IF;
 IF task_priority NOT IN ('low','normal','high','urgent')
 THEN RAISE EXCEPTION 'Invalid task priority'; END IF;
 IF task_frequency NOT IN ('daily','weekly','monthly')
 THEN RAISE EXCEPTION 'Choose a valid repeat frequency'; END IF;
 IF first_due_at IS NULL OR first_due_at<now()-interval '1 day'
 THEN RAISE EXCEPTION 'Choose a future date for the first task'; END IF;
 IF task_owner IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.tw_memberships WHERE organization_id=org_id AND user_id=task_owner)
 THEN RAISE EXCEPTION 'Choose a member of this organization'; END IF;
 IF task_project IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.tw_projects WHERE organization_id=org_id AND id=task_project)
 THEN RAISE EXCEPTION 'Choose a project from this organization'; END IF;
 due_increment:=CASE task_frequency WHEN 'daily' THEN interval '1 day' WHEN 'weekly' THEN interval '7 days' ELSE interval '1 month' END;
 INSERT INTO public.tw_recurring_tasks(organization_id,created_by,owner_id,project_id,title,description,priority,frequency,next_due_at)
 VALUES(org_id,auth.uid(),task_owner,task_project,btrim(task_title),nullif(btrim(coalesce(task_description,'')),''),task_priority,task_frequency,first_due_at+due_increment)
 RETURNING id INTO rec_id;
 INSERT INTO public.tw_tasks(organization_id,created_by,owner_id,project_id,title,description,priority,due_at,recurrence_id,recurrence_due_at)
 VALUES(org_id,auth.uid(),task_owner,task_project,btrim(task_title),nullif(btrim(coalesce(task_description,'')),''),task_priority,first_due_at,rec_id,first_due_at);
 RETURN rec_id;
END;
$f$;
REVOKE ALL ON FUNCTION public.tw_create_recurring_task(uuid,timestamptz,text,text,text,uuid,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.tw_create_recurring_task(uuid,timestamptz,text,text,text,uuid,uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.tw_set_recurring_active(rule_id uuid,enabled boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $f$
DECLARE org uuid;
BEGIN
 SELECT organization_id INTO org FROM public.tw_recurring_tasks WHERE id=rule_id FOR UPDATE;
 IF org IS NULL THEN RAISE EXCEPTION 'Recurring schedule not found'; END IF;
 IF NOT public.tw_can_manage(org) THEN RAISE EXCEPTION 'Only leaders can change recurring schedules'; END IF;
 UPDATE public.tw_recurring_tasks SET active=enabled WHERE id=rule_id;
END;
$f$;
REVOKE ALL ON FUNCTION public.tw_set_recurring_active(uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.tw_set_recurring_active(uuid,boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.tw_generate_recurring_tasks()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $f$
DECLARE rec public.tw_recurring_tasks%ROWTYPE;
 new_due timestamptz; step interval; iteration integer; made integer:=0; creator_valid boolean;
 owner_choice uuid; project_choice uuid;
BEGIN
 FOR rec IN SELECT * FROM public.tw_recurring_tasks WHERE active AND next_due_at < now()+interval '1 day'
 ORDER BY next_due_at LIMIT 500 FOR UPDATE SKIP LOCKED LOOP
  SELECT EXISTS(SELECT 1 FROM public.tw_memberships m WHERE m.organization_id=rec.organization_id
    AND m.user_id=rec.created_by AND m.role IN ('admin','leader')) INTO creator_valid;
  IF NOT creator_valid THEN
   UPDATE public.tw_recurring_tasks SET active=false WHERE id=rec.id;
   CONTINUE;
  END IF;
  step:=CASE rec.frequency WHEN 'daily' THEN interval '1 day' WHEN 'weekly' THEN interval '7 days' ELSE interval '1 month' END;
  new_due:=rec.next_due_at;
  iteration:=0;
  WHILE new_due < now()-interval '12 hours' AND iteration<500 LOOP
   new_due:=new_due+step;
   iteration:=iteration+1;
  END LOOP;
  IF new_due < now()-interval '12 hours' THEN CONTINUE; END IF;
  IF new_due<=now()+interval '1 day' THEN
   SELECT m.user_id INTO owner_choice FROM public.tw_memberships m
    WHERE m.organization_id=rec.organization_id AND m.user_id=rec.owner_id;
   SELECT p.id INTO project_choice FROM public.tw_projects p
    WHERE p.organization_id=rec.organization_id AND p.id=rec.project_id;
   INSERT INTO public.tw_tasks(organization_id,created_by,owner_id,project_id,title,description,priority,due_at,recurrence_id,recurrence_due_at)
   VALUES(rec.organization_id,rec.created_by,owner_choice,project_choice,rec.title,rec.description,rec.priority,new_due,rec.id,new_due)
   ON CONFLICT(recurrence_id,recurrence_due_at) WHERE recurrence_id IS NOT NULL DO NOTHING;
   IF FOUND THEN made:=made+1; END IF;
   new_due:=new_due+step;
  END IF;
  UPDATE public.tw_recurring_tasks SET next_due_at=new_due WHERE id=rec.id;
 END LOOP;
 RETURN made;
END;
$f$;
REVOKE ALL ON FUNCTION public.tw_generate_recurring_tasks() FROM PUBLIC,anon,authenticated;
SELECT cron.schedule('trackwise-recurring-tasks','10 7 * * *','SELECT public.tw_generate_recurring_tasks()');