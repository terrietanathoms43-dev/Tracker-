-- Trackwise per-task discussions, applied to lyxozmoqkljaflofupcs.
CREATE TABLE IF NOT EXISTS public.tw_task_comments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES public.tw_organizations(id) ON DELETE CASCADE,
 task_id uuid NOT NULL REFERENCES public.tw_tasks(id) ON DELETE CASCADE,
 author_id uuid NOT NULL,
 body text NOT NULL CHECK(length(btrim(body)) BETWEEN 1 AND 3000),
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY (organization_id,author_id) REFERENCES public.tw_memberships(organization_id,user_id)
);
CREATE INDEX IF NOT EXISTS tw_comments_task_date ON public.tw_task_comments(task_id,created_at DESC);
ALTER TABLE public.tw_task_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY tw_comments_read ON public.tw_task_comments FOR SELECT TO authenticated USING (
 public.tw_is_member(organization_id) AND EXISTS (
 SELECT 1 FROM public.tw_tasks t WHERE t.id=tw_task_comments.task_id AND t.organization_id=tw_task_comments.organization_id));
CREATE POLICY tw_comments_write ON public.tw_task_comments FOR INSERT TO authenticated WITH CHECK (
 author_id=(select auth.uid()) AND EXISTS (
 SELECT 1 FROM public.tw_tasks t WHERE t.id=tw_task_comments.task_id AND t.organization_id=tw_task_comments.organization_id)
 AND EXISTS (SELECT 1 FROM public.tw_memberships m WHERE m.organization_id=tw_task_comments.organization_id AND m.user_id=(select auth.uid()) AND m.role IN ('admin','leader','member')));
CREATE POLICY tw_comments_delete ON public.tw_task_comments FOR DELETE TO authenticated USING (
 author_id=(select auth.uid()) OR public.tw_can_manage(organization_id));
GRANT SELECT,INSERT,DELETE ON public.tw_task_comments TO authenticated;
REVOKE ALL ON public.tw_task_comments FROM anon;
CREATE OR REPLACE FUNCTION public.tw_notify_task_comment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $f$
DECLARE recipient uuid; task_title text;
BEGIN
 SELECT t.owner_id,t.title INTO recipient,task_title FROM public.tw_tasks t WHERE t.id=NEW.task_id AND t.organization_id=NEW.organization_id;
 IF recipient IS NOT NULL AND recipient<>NEW.author_id THEN
   INSERT INTO public.tw_notifications(organization_id,user_id,title,body)
   VALUES (NEW.organization_id,recipient,'New task comment',task_title);
 END IF;
 RETURN NEW;
END
$f$;
DROP TRIGGER IF EXISTS tw_task_comment_notification ON public.tw_task_comments;
CREATE TRIGGER tw_task_comment_notification AFTER INSERT ON public.tw_task_comments
FOR EACH ROW EXECUTE FUNCTION public.tw_notify_task_comment();
REVOKE ALL ON FUNCTION public.tw_notify_task_comment() FROM PUBLIC,anon,authenticated;