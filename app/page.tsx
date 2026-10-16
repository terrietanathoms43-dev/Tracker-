"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase as makeClient } from "../lib/supabase";
import { canManageOrganization, userFacingError as displayError } from "../lib/task-rules";
import useUnreadNotifications from "./use-unread-notifications";
import Dashboard from "./components/dashboard";

const ready = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const db = ready ? makeClient() : null;

const statusLabel = (s: string) => s.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());

type Org = { id: string; name: string; created_at: string };
type Team = { id: string; name: string; organization_id: string };
type Project = {
   id: string;
   name: string;
   description: string | null;
   status: string;
   team_id: string | null;
   goal_id: string | null;
};
type Goal = { id: string; title: string; description: string | null; status: string; target_date: string | null };
type DirectoryMember = { user_id: string; display_name: string; role: string };
type Member = { user_id: string; role: string };
type TeamMember = { team_id: string; user_id: string; role: string };
type Request = {
   id: string;
   title: string;
   details: string | null;
   decision: string;
   submitted_by: string;
   decision_reason: string | null;
   created_at: string;
};
type Handover = { id: string; task_id: string; from_user: string | null; to_user: string; note: string; created_at: string };
type Activity = { id: string; entity_type: string; action: string; created_at: string; details: Record<string, unknown> };
type Notification = {
   id: string;
   user_id: string;
   organization_id: string;
   type: string;
   title: string;
   message: string | null;
   read_at: string | null;
   dedupe_key: string | null;
   created_at: string;
};
type TeamMessage = { id: string; team_id: string; sender_id: string; content: string; created_at: string };
type Task = {
   id: string;
   title: string;
   description: string | null;
   status: string;
   priority: string;
   due_at: string | null;
   owner_id: string | null;
   created_at: string;
   project_id: string | null;
   source_request_id: string | null;
   assignees?: { user_id: string }[];
};
type TaskUpdate = { id: string; progress: string; next_action: string | null; created_at: string; author_id: string };
type PendingInvite = { id: string; email: string; role: string; organization_id: string; expires_at: string };
type OutgoingInvite = { id: string; email: string; role: string; expires_at: string; accepted_at: string | null };

export default function Home() {
   const [user, setUser] = useState<User | null>(null);
   const [initial, setInitial] = useState(true);
   const [recovery, setRecovery] = useState(false);
   const [working, setWorking] = useState(false);
   const [mode, setMode] = useState<"signin" | "signup" | "reset">("signin");
   const [email, setEmail] = useState("");
   const [password, setPassword] = useState("");
   const [newPassword, setNewPassword] = useState("");
   const [error, setError] = useState("");
   const [notice, setNotice] = useState("");

   const [orgs, setOrgs] = useState<Org[]>([]);
   const [selected, setSelected] = useState("");
   const [teams, setTeams] = useState<Team[]>([]);
   const [tasks, setTasks] = useState<Task[]>([]);
   const [members, setMembers] = useState<Member[]>([]);
   const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
   const [goals, setGoals] = useState<Goal[]>([]);
   const [projects, setProjects] = useState<Project[]>([]);
   const [directory, setDirectory] = useState<DirectoryMember[]>([]);
   const [requests, setRequests] = useState<Request[]>([]);
   const [activity, setActivity] = useState<Activity[]>([]);
   const [handovers, setHandovers] = useState<Handover[]>([]);
   const [notifications, setNotifications] = useState<Notification[]>([]);
   const [teamMessages, setTeamMessages] = useState<TeamMessage[]>([]);
   const [workspaceLoading, setWorkspaceLoading] = useState(false);
   const workspaceRequest = useRef(0);

   const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);
   const [outgoingInvites, setOutgoingInvites] = useState<OutgoingInvite[]>([]);
   const [invitesLoading, setInvitesLoading] = useState(false);
   const [inviteAction, setInviteAction] = useState("");

   const [profileName, setProfileName] = useState("");

   const [showGuide, setShowGuide] = useState(false);

   const active = useMemo(() => orgs.find((o) => o.id === selected), [orgs, selected]);
   const role = useMemo(() => members.find((m) => m.user_id === user?.id)?.role, [members, user?.id]);
   const manager = canManageOrganization(role);
   const unreadNotifications = useUnreadNotifications(selected, user?.id);

   const clear = useCallback(() => {
      setError("");
      setNotice("");
   }, []);

   useEffect(() => {
      setProfileName(String(user?.user_metadata?.display_name ?? ""));
   }, [user?.id]);

   useEffect(() => {
      if (!db) {
         setInitial(false);
         return;
      }
      let live = true;
      db.auth
         .getUser()
         .then(({ data, error }) => {
            if (!live) return;
            if (error) setError(error.message);
            setUser(data.user);
            setInitial(false);
         })
         .catch(() => {
            if (!live) return;
            setError("Unable to connect. Check your internet connection.");
            setInitial(false);
         });
      const {
         data: { subscription },
      } = db.auth.onAuthStateChange((_event, session) => {
         if (!live) return;
         setUser(session?.user ?? null);
         if (_event === "PASSWORD_RECOVERY") setRecovery(true);
      });
      return () => {
         live = false;
         subscription.unsubscribe();
      };
   }, []);

   const loadOrgs = useCallback(async () => {
      if (!db) return;
      const { data, error } = await db.from("tw_organizations").select("id,name,created_at").order("created_at", { ascending: false });
      if (error) setError(error.message);
      else {
         setOrgs(data ?? []);
         setSelected((old) => ((data ?? []).some((o) => o.id === old) ? old : (data?.[0]?.id ?? "")));
      }
   }, []);

   useEffect(() => {
      if (user) void loadOrgs();
      else {
         setOrgs([]);
         setSelected("");
         setTeams([]);
         setTasks([]);
      }
   }, [user, loadOrgs]);

   const loadWorkspace = useCallback(async (orgId: string) => {
      if (!db || !orgId) return;
      const request = ++workspaceRequest.current;
      setWorkspaceLoading(true);

      const allTasks = async () => {
         const saved: Task[] = [];
         const pageSize = 200;
         for (let offset = 0; ; offset += pageSize) {
            const result = await db
               .from("tw_tasks")
               .select("id,title,description,status,priority,due_at,owner_id,created_at,project_id,source_request_id")
               .eq("organization_id", orgId)
               .order("created_at", { ascending: false })
               .order("id", { ascending: false })
               .range(offset, offset + pageSize - 1);
            if (result.error) throw result.error;
            const batch = (result.data ?? []) as Task[];
            saved.push(...batch);
            if (batch.length < pageSize) break;
         }
         return saved;
      };

      try {
         const [t, rawTasks, m, tm, r, a, g, p, d, h, n, msg, assigneesResult] = await Promise.all([
            db
               .from("tw_teams")
               .select("id,name,organization_id")
               .eq("organization_id", orgId)
               .order("created_at", { ascending: false }),
            allTasks(),
            db.from("tw_memberships").select("user_id,role").eq("organization_id", orgId).is("revoked_at", null),
            db.from("tw_team_members").select("team_id,user_id,role"),
            db
               .from("tw_requests")
               .select("id,title,details,decision,submitted_by,decision_reason,created_at")
               .eq("organization_id", orgId)
               .order("created_at", { ascending: false })
               .limit(100),
            db
               .from("tw_activity")
               .select("id,entity_type,action,created_at,details")
               .eq("organization_id", orgId)
               .order("created_at", { ascending: false })
               .limit(50),
            db
               .from("tw_goals")
               .select("id,title,description,status,target_date")
               .eq("organization_id", orgId)
               .order("created_at", { ascending: false }),
            db
               .from("tw_projects")
               .select("id,name,description,status,team_id,goal_id")
               .eq("organization_id", orgId)
               .order("created_at", { ascending: false }),
            db.rpc("tw_member_directory", { org_id: orgId }),
            db
               .from("tw_task_handovers")
               .select("id,task_id,from_user,to_user,note,created_at")
               .eq("organization_id", orgId)
               .order("created_at", { ascending: false })
               .limit(100),
            db
               .from("tw_notifications")
               .select("id,user_id,organization_id,type,title,message,read_at,dedupe_key,created_at")
               .eq("user_id", user?.id ?? "")
               .order("created_at", { ascending: false })
               .limit(50),
            db
               .from("tw_messages")
               .select("id,team_id,sender_id,content,created_at")
               .order("created_at", { ascending: false })
               .limit(200),
            db.from("tw_task_assignees").select("task_id,user_id").eq("organization_id", orgId),
         ]);
         if (request !== workspaceRequest.current) return;
         const assigneesByTask = new Map<string, { user_id: string }[]>();
         for (const row of (assigneesResult.data ?? []) as { task_id: string; user_id: string }[]) {
            const list = assigneesByTask.get(row.task_id) ?? [];
            list.push({ user_id: row.user_id });
            assigneesByTask.set(row.task_id, list);
         }
         const tasksWithAssignees = rawTasks.map((task) => ({ ...task, assignees: assigneesByTask.get(task.id) ?? [] }));
         if (!t.error) setTeams(t.data ?? []);
         setTasks(tasksWithAssignees);
         if (!m.error) setMembers(m.data ?? []);
         if (!tm.error) setTeamMembers((tm.data ?? []).filter((x) => (t.data ?? []).some((team) => team.id === x.team_id)));
         if (!r.error) setRequests(r.data ?? []);
         if (!a.error) setActivity(a.data ?? []);
         if (!g.error) setGoals(g.data ?? []);
         if (!p.error) setProjects(p.data ?? []);
         if (!d.error) setDirectory(d.data ?? []);
         if (!h.error) setHandovers(h.data ?? []);
         if (!n.error) setNotifications(n.data ?? []);
         if (!msg.error) setTeamMessages(msg.data ?? []);
         const failures = [
            ["teams", t.error],
            ["saved tasks", null],
            ["members", m.error],
            ["team membership", tm.error],
            ["requests", r.error],
            ["activity", a.error],
            ["goals", g.error],
            ["projects", p.error],
            ["directory", d.error],
            ["handover history", h.error],
            ["notifications", n.error],
            ["team messages", msg.error],
            ["assignees", assigneesResult.error],
         ].filter((entry) => entry[1]);
         if (failures.length)
            setError(
               "Some workspace information could not be loaded: " + failures.map((e) => e[0]).join(", ") + ". Refresh to try again.",
            );
      } catch (e) {
         if (request === workspaceRequest.current) setError(e instanceof Error ? e.message : "Unable to load workspace");
      } finally {
         if (request === workspaceRequest.current) setWorkspaceLoading(false);
      }
   }, []);

   useEffect(() => {
      if (selected) {
         setTasks([]);
         setProjects([]);
         setMembers([]);
         setTeams([]);
         setGoals([]);
         setDirectory([]);
         void loadWorkspace(selected);
      } else {
         workspaceRequest.current++;
         setTeams([]);
         setTasks([]);
         setProjects([]);
         setMembers([]);
         setGoals([]);
         setDirectory([]);
         setWorkspaceLoading(false);
      }
   }, [selected, loadWorkspace]);

   useEffect(() => {
      if (!selected || !user) return;
      let lastRefresh = Date.now();
      const checkForUpdates = () => {
         if (document.visibilityState !== "visible" || Date.now() - lastRefresh < 15000) return;
         lastRefresh = Date.now();
         void loadOrgs();
         void loadWorkspace(selected);
      };
      window.addEventListener("focus", checkForUpdates);
      window.addEventListener("online", checkForUpdates);
      document.addEventListener("visibilitychange", checkForUpdates);
      return () => {
         window.removeEventListener("focus", checkForUpdates);
         window.removeEventListener("online", checkForUpdates);
         document.removeEventListener("visibilitychange", checkForUpdates);
      };
   }, [selected, user?.id, loadWorkspace, loadOrgs]);

   useEffect(() => {
      if (user) {
         void db
            ?.from("tw_invitations")
            .select("id,email,role,organization_id,expires_at")
            .eq("email", user.email?.toLowerCase() ?? "")
            .is("accepted_at", null)
            .gt("expires_at", new Date().toISOString())
            .then(({ data }) => setPendingInvites(data ?? []));
      } else setPendingInvites([]);
   }, [user]);

   const loadOutgoingInvites = useCallback(async (orgId: string) => {
      if (!db || !orgId) return;
      const { data, error } = await db
         .from("tw_invitations")
         .select("id,email,role,expires_at,accepted_at")
         .eq("organization_id", orgId)
         .order("created_at", { ascending: false });
      if (error) setError(error.message);
      else setOutgoingInvites(data ?? []);
   }, []);

   useEffect(() => {
      if (selected && members.some((m) => m.user_id === user?.id && ["admin", "leader"].includes(m.role)))
         void loadOutgoingInvites(selected);
      else setOutgoingInvites([]);
   }, [selected, members, user?.id, loadOutgoingInvites]);

   useEffect(() => {
      if (!user || !selected || !role || workspaceLoading || typeof window === "undefined") return;
      const key = "tw-onboarding-v2:" + user.id + ":" + selected;
      if (!window.localStorage.getItem(key)) setShowGuide(true);
   }, [user?.id, selected, role, workspaceLoading]);

   async function auth(e: FormEvent) {
      e.preventDefault();
      if (!db) return;
      setWorking(true);
      clear();
      try {
         if (mode === "signup" && password.length < 10) throw new Error("Choose a password with at least 10 characters.");
         if (mode === "reset") {
            const { error } = await db.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
            if (error) throw error;
            setNotice("Password reset email sent. Check your inbox.");
            return;
         }
         const result =
            mode === "signin"
               ? await db.auth.signInWithPassword({ email, password })
               : await db.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin } });
         if (result.error) throw result.error;
         if (mode === "signup")
            setNotice(result.data.session ? "Your account is ready." : "Check your email to confirm your account.");
      } catch (e) {
         setError(e instanceof Error ? e.message : "Unable to authenticate");
      } finally {
         setWorking(false);
      }
   }

   async function changePassword(e: FormEvent) {
      e.preventDefault();
      if (!db) return;
      setWorking(true);
      clear();
      try {
         if (newPassword.length < 10) throw new Error("Use at least 10 characters.");
         const { error } = await db.auth.updateUser({ password: newPassword });
         if (error) throw error;
         setNewPassword("");
         setRecovery(false);
         setNotice("Password updated successfully.");
      } catch (e) {
         setError(e instanceof Error ? e.message : "Unable to update password");
      } finally {
         setWorking(false);
      }
   }

   async function saveProfile(name: string) {
      if (!db || !user) throw new Error("Not signed in");
      const trimmed = name.trim();
      if (trimmed.length < 2 || trimmed.length > 80) throw new Error("Display name must be between 2 and 80 characters.");
      const { error } = await db.auth.updateUser({ data: { display_name: trimmed } });
      if (error) throw error;
      await loadWorkspace(selected);
   }

   async function createOrg(name: string) {
      if (!db) throw new Error("Database not ready");
      const { data, error } = await db.rpc("tw_create_organization", { org_name: name.trim() });
      if (error) throw error;
      await loadOrgs();
      return (data as string | undefined) ?? undefined;
   }

   async function acceptInvite(id: string) {
      if (!db) return;
      setInvitesLoading(true);
      clear();
      try {
         const { error } = await db.rpc("tw_accept_invitation", { invitation_id: id });
         if (error) throw error;
         setPendingInvites((old) => old.filter((x) => x.id !== id));
         await loadOrgs();
         setNotice("Invitation accepted. Your new organization is available.");
      } catch (e) {
         setError(e instanceof Error ? e.message : "Unable to accept invitation");
      } finally {
         setInvitesLoading(false);
      }
   }

   async function signOut() {
      await db?.auth.signOut();
   }

   async function createTeam(name: string) {
      if (!db || !selected || !manager) throw new Error("Unable to create team");
      const { error } = await db.from("tw_teams").insert({ organization_id: selected, name: name.trim() });
      if (error) throw error;
      await loadWorkspace(selected);
   }

   async function assignTeamMember(teamId: string, userId: string, role: string) {
      if (!db || !selected || !manager) throw new Error("Unable to assign");
      const { error } = await db.rpc("tw_assign_team_member", { target_team: teamId, target_user: userId, target_role: role });
      if (error) throw error;
      await loadWorkspace(selected);
   }

   async function unassignTeamMember(teamId: string, userId: string, displayName: string) {
      if (!db || !selected || !manager) return;
      if (!window.confirm("Remove " + displayName + " from this team? They will remain a member of your organization.")) return;
      const { error } = await db.rpc("tw_unassign_team_member", { target_team: teamId, target_user: userId });
      if (error) throw error;
      await loadWorkspace(selected);
   }

   async function createProject(name: string, description: string | null, goalId: string | null, teamId: string | null) {
      if (!db || !selected || !manager) throw new Error("Unable to create project");
      const { error } = await db.from("tw_projects").insert({
         organization_id: selected,
         name: name.trim(),
         description: description?.trim() || null,
         goal_id: goalId || null,
         team_id: teamId || null,
      });
      if (error) throw error;
      await loadWorkspace(selected);
   }

   async function editProject(
      id: string,
      name: string,
      description: string | null,
      goalId: string | null,
      teamId: string | null,
      status: string,
   ) {
      if (!db || !selected || !manager) throw new Error("Unable to edit project");
      const { error } = await db.rpc("tw_edit_project", {
         target_project: id,
         project_name: name.trim(),
         project_description: description?.trim() || null,
         project_goal: goalId || null,
         project_team: teamId || null,
         project_status: status,
      });
      if (error) throw error;
      await loadWorkspace(selected);
   }

   async function createGoal(title: string, description: string | null, targetDate: string | null) {
      if (!db || !selected || !manager) throw new Error("Unable to create goal");
      const { error } = await db.from("tw_goals").insert({
         organization_id: selected,
         title: title.trim(),
         description: description?.trim() || null,
         target_date: targetDate || null,
      });
      if (error) throw error;
      await loadWorkspace(selected);
   }

   async function editGoal(id: string, title: string, description: string | null, targetDate: string | null, status: string) {
      if (!db || !selected || !manager) throw new Error("Unable to edit goal");
      const { error } = await db.rpc("tw_edit_goal", {
         target_goal: id,
         new_title: title.trim(),
         new_description: description?.trim() || null,
         new_date: targetDate || null,
         new_status: status,
      });
      if (error) throw error;
      await loadWorkspace(selected);
   }

   async function inviteMember(email: string, role: string) {
      if (!db || !selected || !manager) throw new Error("Unable to invite");
      const recipient = email.trim().toLowerCase();
      const { error } = await db.rpc("tw_invite_member", { org_id: selected, invite_email: recipient, invite_role: role });
      if (error) throw error;
      const { data: invitation, error: invitationError } = await db
         .from("tw_invitations")
         .select("id")
         .eq("organization_id", selected)
         .eq("email", recipient)
         .single();
      if (invitationError || !invitation) throw invitationError ?? new Error("Unable to load invitation link.");
      await loadOutgoingInvites(selected);
      return { invitationId: invitation.id as string, email: recipient };
   }

   async function revokeInvite(id: string) {
      if (!db || !selected || !manager) return;
      if (!window.confirm("Revoke this invitation? Its link will stop working.")) return;
      setInviteAction(id);
      clear();
      try {
         const { error } = await db.rpc("tw_revoke_invitation", { invitation_id: id });
         if (error) throw error;
         await loadOutgoingInvites(selected);
      } catch (e) {
         setError(displayError(e, "Unable to revoke invitation"));
      } finally {
         setInviteAction("");
      }
   }

   async function removeMember(memberId: string, displayName: string) {
      if (!db || !selected || role !== "admin" || !user || memberId === user.id) return;
      if (!window.confirm("Remove " + displayName + " from this organization? They will lose access immediately.")) return;
      const { error } = await db.rpc("tw_remove_member", { org_id: selected, member_id: memberId });
      if (error) throw error;
      await loadWorkspace(selected);
   }

   async function updateMemberRole(memberId: string, newRole: string) {
      if (!db || !selected || role !== "admin") return;
      const previous = directory.find((m) => m.user_id === memberId)?.role;
      if (previous === newRole) return;
      const willUnassign = ["stakeholder", "observer"].includes(newRole) && tasks.some((task) => task.owner_id === memberId);
      if (willUnassign && !window.confirm("Changing this person to a read-only role will unassign their current tasks. Continue?"))
         return;
      const { error } = await db.rpc("tw_change_member_role", { org_id: selected, member_id: memberId, new_role: newRole });
      if (error) throw error;
      await loadWorkspace(selected);
   }

   async function deleteOrganization() {
      if (!db || !selected || role !== "admin") return;
      if (!window.confirm("Delete this organization and all its data? This cannot be undone.")) return;
      const { error } = await db.rpc("tw_delete_organization", { org_id: selected });
      if (error) throw error;
      await loadOrgs();
   }

   async function leaveOrganization() {
      if (!db || !selected || !user) return;
      if (!window.confirm("Leave this organization? You will lose access until invited back.")) return;
      const { error } = await db.rpc("tw_leave_organization", { org_id: selected, member_id: user.id });
      if (error) throw error;
      await loadOrgs();
   }

   async function createTask(values: {
      title: string;
      description: string | null;
      priority: string;
      due_at: string | null;
      project_id: string | null;
      assigneeIds: string[];
      frequency: string;
   }) {
      if (!db || !selected || !user || !manager) throw new Error("Unable to create task");
      const title = values.title.trim();
      if (title.length < 2) throw new Error("Enter a task title with at least two characters.");
      const due = values.due_at ? new Date(values.due_at).toISOString() : null;
      const ownerId = values.assigneeIds[0] || null;

      if (values.frequency !== "none") {
         if (!values.due_at) throw new Error("Choose a first due date for a repeating task.");
         const { error } = await db.rpc("tw_create_recurring_task", {
            org_id: selected,
            first_due_at: due,
            task_title: title,
            task_description: values.description?.trim() || null,
            task_priority: values.priority,
            task_owner: ownerId,
            task_project: values.project_id,
            task_frequency: values.frequency,
         });
         if (error) throw error;
      } else {
         const { data: saved, error } = await db
            .from("tw_tasks")
            .insert({
               organization_id: selected,
               created_by: user.id,
               title,
               description: values.description?.trim() || null,
               priority: values.priority,
               due_at: due,
               owner_id: ownerId,
               project_id: values.project_id,
            })
            .select("id,title,description,status,priority,due_at,owner_id,created_at,project_id,source_request_id")
            .single();
         if (error) throw error;
         if (!saved) throw new Error("The database did not confirm that your task was saved.");
         if (values.assigneeIds.length) {
            const { error: assigneeError } = await db.from("tw_task_assignees").insert(
               values.assigneeIds.map((userId) => ({
                  organization_id: selected,
                  task_id: saved.id,
                  user_id: userId,
               })),
            );
            if (assigneeError) throw assigneeError;
         }
         setTasks((old) =>
            old.some((t) => t.id === saved.id)
               ? old
               : [{ ...(saved as Task), assignees: values.assigneeIds.map((id) => ({ user_id: id })) }, ...old],
         );
      }
      await loadWorkspace(selected);
   }

   async function editTask(
      id: string,
      values: {
         title: string;
         description: string | null;
         priority: string;
         due_at: string | null;
         project_id: string | null;
         assigneeIds: string[];
      },
   ) {
      if (!db || !selected || !manager) throw new Error("Unable to edit task");
      const { error } = await db.rpc("tw_edit_task", {
         target_task: id,
         task_title: values.title.trim(),
         task_description: values.description?.trim() || null,
         task_priority: values.priority,
         task_due: values.due_at ? new Date(values.due_at).toISOString() : null,
         task_project: values.project_id,
      });
      if (error) throw error;
      const ownerId = values.assigneeIds[0] || null;
      const { error: ownerError } = await db
         .from("tw_tasks")
         .update({ owner_id: ownerId })
         .eq("id", id)
         .eq("organization_id", selected);
      if (ownerError) throw ownerError;
      const { error: deleteError } = await db.from("tw_task_assignees").delete().eq("task_id", id).eq("organization_id", selected);
      if (deleteError) throw deleteError;
      if (values.assigneeIds.length) {
         const { error: insertError } = await db.from("tw_task_assignees").insert(
            values.assigneeIds.map((userId) => ({
               organization_id: selected,
               task_id: id,
               user_id: userId,
            })),
         );
         if (insertError) throw insertError;
      }
      await loadWorkspace(selected);
   }

   async function updateTaskStatus(id: string, status: string) {
      if (!db || !selected || !user) return;
      if (status === "completed" && !manager) {
         setError("Only an organization leader can approve and complete tasks.");
         return;
      }
      let reason: string | null = null;
      if (status === "blocked") {
         reason = window.prompt("What is blocking this task? Add a short explanation so your team can help.");
         if (!reason?.trim()) return;
      }
      const { error } = await db.rpc("tw_set_task_status", { task_id: id, new_status: status, new_blocker: reason });
      if (error) throw error;
      await loadWorkspace(selected);
   }

   async function deleteTask(id: string) {
      if (!db || !selected || !manager) return;
      if (!window.confirm("Delete this task permanently?")) return;
      const { error } = await db.from("tw_tasks").delete().eq("id", id).eq("organization_id", selected);
      if (error) throw error;
      await loadWorkspace(selected);
   }

   async function markNotificationRead(id: string) {
      if (!db) return;
      const { error } = await db.rpc("tw_mark_notification_read", { notification_id: id });
      if (error) throw error;
      setNotifications((old) => old.map((n) => (n.id === id ? { ...n, read_at: new Date().toISOString() } : n)));
   }

   async function sendTeamMessage(teamId: string, content: string) {
      if (!db || !user) throw new Error("Unable to send message");
      const { error } = await db.from("tw_messages").insert({ team_id: teamId, sender_id: user.id, content: content.trim() });
      if (error) throw error;
      await loadWorkspace(selected);
   }

   async function createRequest(title: string, details: string) {
      if (!db || !selected || !user) throw new Error("Unable to submit request");
      const { error } = await db.from("tw_requests").insert({
         organization_id: selected,
         submitted_by: user.id,
         title: title.trim(),
         details: details.trim() || null,
      });
      if (error) throw error;
      await loadWorkspace(selected);
   }

   async function decideRequest(id: string, decision: string, reason: string) {
      if (!db || !selected || !manager) throw new Error("Unable to decide request");
      const { error } = await db.rpc("tw_decide_request", { request_id: id, new_decision: decision, reason: reason.trim() });
      if (error) throw error;
      await loadWorkspace(selected);
   }

   async function loadTaskUpdates(taskId: string) {
      if (!db) return [];
      const { data, error } = await db
         .from("tw_task_updates")
         .select("id,progress,next_action,created_at,author_id")
         .eq("task_id", taskId)
         .order("created_at", { ascending: false })
         .limit(50);
      if (error) throw error;
      return (data ?? []) as TaskUpdate[];
   }

   async function addTaskProgress(taskId: string, progress: string, nextStep: string | null) {
      if (!db || !selected) return;
      const { error } = await db.rpc("tw_add_task_update", {
         target_task: taskId,
         progress_text: progress.trim(),
         next_step: nextStep?.trim() || null,
      });
      if (error) throw error;
   }

   async function reassignTask(taskId: string, newOwner: string, note: string) {
      if (!db || !selected || !manager) return;
      const { error } = await db.rpc("tw_reassign_task", {
         target_task: taskId,
         new_owner: newOwner,
         handover_message: note.trim(),
      });
      if (error) throw error;
   }

   function closeGuide() {
      if (user && selected && typeof window !== "undefined")
         window.localStorage.setItem("tw-onboarding-v2:" + user.id + ":" + selected, "seen");
      setShowGuide(false);
   }

   if (recovery && user) {
      return (
         <main className="recoveryPage">
            <section className="card recoveryCard">
               <h1>Choose a new password</h1>
               <p className="muted">Set a secure password for your Trackwise account.</p>
               {error && <p className="feedback bad">{error}</p>}
               {notice && <p className="feedback good">{notice}</p>}
               <form onSubmit={changePassword}>
                  <label htmlFor="newPassword">New password</label>
                  <input
                     id="newPassword"
                     type="password"
                     autoComplete="new-password"
                     minLength={10}
                     required
                     value={newPassword}
                     onChange={(e) => setNewPassword(e.target.value)}
                  />
                  <button className="primary" disabled={working}>
                     Update password
                  </button>
               </form>
            </section>
         </main>
      );
   }

   if (!ready) {
      return (
         <main className="center">
            <div className="card">
               <h1>Trackwise</h1>
               <h2>Setup required</h2>
               <p>Supabase environment variables are missing from this deployment.</p>
            </div>
         </main>
      );
   }

   if (initial) {
      return (
         <main className="center">
            <div className="spinner" />
            <p>Preparing your workspace…</p>
         </main>
      );
   }

   if (!user) {
      return (
         <main className="authShell">
            <div className="authHero">
               <div className="logo light">
                  <span className="mark">T</span> Trackwise
               </div>
               <div>
                  <span className="eyebrow">A clearer way to lead</span>
                  <h1>
                     Every task.
                     <br />
                     Every team.
                     <br />
                     <em>One clear picture.</em>
                  </h1>
                  <p>Turn scattered updates into focused action, shared accountability, and measurable progress.</p>
                  <div className="heroChips">
                     <span>✓ Clear ownership</span>
                     <span>✓ Live progress</span>
                     <span>✓ Team visibility</span>
                  </div>
               </div>
               <small>Designed for leaders who value clarity.</small>
            </div>
            <div className="authSide">
               <div className="authCard">
                  <div className="mobileLogo logo">
                     <span className="mark">T</span> Trackwise
                  </div>
                  <span className="eyebrow blue">YOUR WORKSPACE STARTS HERE</span>
                  <h2>{mode === "signin" ? "Welcome back" : mode === "signup" ? "Create your account" : "Reset your password"}</h2>
                  <p className="muted">
                     {mode === "signin"
                        ? "Sign in to pick up where your team left off."
                        : mode === "signup"
                          ? "Bring your people and priorities together."
                          : "We'll send a reset link to your email."}
                  </p>
                  <form onSubmit={auth}>
                     <label htmlFor="email">Email address</label>
                     <input
                        id="email"
                        type="email"
                        placeholder="you@example.com"
                        autoComplete="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                     />
                     {mode !== "reset" && (
                        <>
                           <label htmlFor="password">Password</label>
                           <input
                              id="password"
                              type="password"
                              minLength={mode === "signup" ? 10 : 1}
                              placeholder={mode === "signup" ? "At least 10 characters" : "Enter your password"}
                              autoComplete={mode === "signin" ? "current-password" : "new-password"}
                              value={password}
                              onChange={(e) => setPassword(e.target.value)}
                              required
                           />
                           {mode === "signup" && <p className="muted">Use at least 10 characters and a unique password.</p>}
                        </>
                     )}
                     <button className="primary wide" disabled={working}>
                        {working
                           ? "Please wait…"
                           : mode === "signin"
                             ? "Sign in →"
                             : mode === "signup"
                               ? "Create account →"
                               : "Send reset link →"}
                     </button>
                  </form>
                  {mode === "signin" && (
                     <>
                        <button className="linkButton" type="button" onClick={() => setMode("signup")}>
                           Create an account
                        </button>
                        <button className="linkButton" type="button" onClick={() => setMode("reset")}>
                           Forgot your password?
                        </button>
                     </>
                  )}
                  {(mode === "signup" || mode === "reset") && (
                     <button className="linkButton" type="button" onClick={() => setMode("signin")}>
                        Back to sign in
                     </button>
                  )}
                  {error && <p className="feedback bad">{error}</p>}
                  {notice && <p className="feedback good">{notice}</p>}
               </div>
            </div>
         </main>
      );
   }

   return (
      <Dashboard
         user={user}
         role={role}
         orgs={orgs}
         selected={selected}
         onSelectOrg={setSelected}
         active={active}
         tasks={tasks}
         projects={projects}
         teams={teams}
         members={members}
         directory={directory}
         teamMembers={teamMembers}
         goals={goals}
         requests={requests}
         activity={activity}
         handovers={handovers}
         outgoingInvites={outgoingInvites}
         pendingInvites={pendingInvites}
         notifications={notifications}
         onMarkNotificationRead={markNotificationRead}
         teamMessages={teamMessages}
         onSendTeamMessage={sendTeamMessage}
         workspaceLoading={workspaceLoading}
         onRefresh={() => loadWorkspace(selected)}
         onCreateTask={createTask}
         onEditTask={editTask}
         onUpdateTaskStatus={updateTaskStatus}
         onDeleteTask={deleteTask}
         onCreateTeam={createTeam}
         onAssignTeamMember={assignTeamMember}
         onUnassignTeamMember={unassignTeamMember}
         onCreateProject={createProject}
         onEditProject={editProject}
         onCreateGoal={createGoal}
         onEditGoal={editGoal}
         onInviteMember={inviteMember}
         onRevokeInvite={revokeInvite}
         onRemoveMember={removeMember}
         onUpdateMemberRole={updateMemberRole}
         onDeleteOrganization={deleteOrganization}
         onLeaveOrganization={leaveOrganization}
         onCreateOrganization={createOrg}
         onCreateRequest={createRequest}
         onDecideRequest={decideRequest}
         onAcceptInvite={acceptInvite}
         onSaveProfile={saveProfile}
         onChangePassword={async (pwd) => {
            setNewPassword(pwd);
            await changePassword({ preventDefault: () => {} } as FormEvent);
         }}
         onSignOut={signOut}
         onLoadTaskUpdates={loadTaskUpdates}
         onAddTaskProgress={addTaskProgress}
         onReassignTask={reassignTask}
         showGuide={showGuide}
         onOpenGuide={() => setShowGuide(true)}
         onCloseGuide={closeGuide}
      />
   );
}
