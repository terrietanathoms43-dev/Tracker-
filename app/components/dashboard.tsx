"use client";

import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { type User } from "@supabase/supabase-js";
import {
   DndContext,
   DragOverlay,
   PointerSensor,
   closestCorners,
   useDraggable,
   useDroppable,
   useSensor,
   useSensors,
   type DragEndEvent,
   type DragStartEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import DialogShell from "./dialog-shell";
import TaskDialog from "./task-dialog";
import UserDialog from "./user-dialog";
import WorkspaceDialog, { type WorkspaceDialogTab } from "./workspace-dialog";
import Reports from "../reports";
import ProfileAvatar from "../profile-avatar";
import { supabase } from "../../lib/supabase";
import { canManageOrganization, canOwnTask, taskStatusLabel } from "../../lib/task-rules";

const statusLabel = (s: string) => s.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
const statuses = ["not_started", "underway", "awaiting_approval", "blocked", "rejected", "completed"] as const;

export type DashboardTask = {
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
export type DashboardProject = {
   id: string;
   name: string;
   description: string | null;
   status: string;
   team_id: string | null;
   goal_id: string | null;
};
export type DashboardTeam = { id: string; name: string; organization_id: string };
export type DashboardMember = { user_id: string; role: string };
export type DashboardDirectoryMember = { user_id: string; display_name: string; role: string };
export type DashboardTeamMember = { team_id: string; user_id: string; role: string };
export type DashboardGoal = { id: string; title: string; description: string | null; status: string; target_date: string | null };
export type DashboardRequest = {
   id: string;
   title: string;
   details: string | null;
   decision: string;
   submitted_by: string;
   decision_reason: string | null;
   created_at: string;
};
export type DashboardActivity = {
   id: string;
   entity_type: string;
   action: string;
   created_at: string;
   details: Record<string, unknown>;
};
export type DashboardHandover = {
   id: string;
   task_id: string;
   from_user: string | null;
   to_user: string;
   note: string;
   created_at: string;
};
export type DashboardNotification = {
   id: string;
   user_id: string;
   organization_id: string;
   type: string;
   title: string;
   message: string | null;
   read_at: string | null;
   created_at: string;
};
export type DashboardTeamMessage = { id: string; team_id: string; sender_id: string; content: string; created_at: string };
export type DashboardInvite = { id: string; email: string; role: string; expires_at: string; accepted_at: string | null };
export type DashboardPendingInvite = { id: string; email: string; role: string; organization_id: string; expires_at: string };
export type DashboardOrg = { id: string; name: string; created_at: string };

type DashboardProps = {
   user: User;
   role: string | null | undefined;
   orgs: DashboardOrg[];
   selected: string;
   onSelectOrg: (id: string) => void;
   active: DashboardOrg | undefined;
   tasks: DashboardTask[];
   projects: DashboardProject[];
   teams: DashboardTeam[];
   members: DashboardMember[];
   directory: DashboardDirectoryMember[];
   teamMembers: DashboardTeamMember[];
   goals: DashboardGoal[];
   requests: DashboardRequest[];
   activity: DashboardActivity[];
   handovers: DashboardHandover[];
   outgoingInvites: DashboardInvite[];
   pendingInvites: DashboardPendingInvite[];
   notifications: DashboardNotification[];
   onMarkNotificationRead: (id: string) => Promise<void>;
   teamMessages: DashboardTeamMessage[];
   onSendTeamMessage: (teamId: string, content: string) => Promise<void>;
   workspaceLoading: boolean;
   onRefresh: () => Promise<void>;
   onCreateTask: (values: {
      title: string;
      description: string | null;
      priority: string;
      due_at: string | null;
      project_id: string | null;
      assigneeIds: string[];
      frequency: string;
   }) => Promise<void>;
   onEditTask: (
      id: string,
      values: {
         title: string;
         description: string | null;
         priority: string;
         due_at: string | null;
         project_id: string | null;
         assigneeIds: string[];
      },
   ) => Promise<void>;
   onUpdateTaskStatus: (id: string, status: string) => Promise<void>;
   onDeleteTask: (id: string) => Promise<void>;
   onCreateTeam: (name: string) => Promise<void>;
   onAssignTeamMember: (teamId: string, userId: string, role: string) => Promise<void>;
   onUnassignTeamMember: (teamId: string, userId: string, displayName: string) => Promise<void>;
   onCreateProject: (name: string, description: string | null, goalId: string | null, teamId: string | null) => Promise<void>;
   onEditProject: (
      id: string,
      name: string,
      description: string | null,
      goalId: string | null,
      teamId: string | null,
      status: string,
   ) => Promise<void>;
   onCreateGoal: (title: string, description: string | null, targetDate: string | null) => Promise<void>;
   onEditGoal: (id: string, title: string, description: string | null, targetDate: string | null, status: string) => Promise<void>;
   onInviteMember: (email: string, role: string) => Promise<{ invitationId?: string; email: string } | undefined>;
   onRevokeInvite: (id: string) => Promise<void>;
   onRemoveMember: (userId: string, displayName: string) => Promise<void>;
   onUpdateMemberRole: (userId: string, role: string) => Promise<void>;
   onDeleteOrganization: () => Promise<void>;
   onLeaveOrganization: (orgId?: string) => Promise<boolean>;
   onCreateOrganization: (name: string) => Promise<string | undefined>;
   onCreateRequest: (title: string, details: string) => Promise<void>;
   onDecideRequest: (id: string, decision: string, reason: string) => Promise<void>;
   onAcceptInvite: (id: string) => Promise<void>;
   onUserRefresh: () => Promise<void>;
   onChangePassword: (password: string) => Promise<void>;
   onSignOut: () => Promise<void>;
   onLoadTaskUpdates: (
      taskId: string,
   ) => Promise<{ id: string; progress: string; next_action: string | null; created_at: string; author_id: string }[]>;
   onAddTaskProgress: (taskId: string, progress: string, nextStep: string | null) => Promise<void>;
   onReassignTask: (taskId: string, newOwner: string, note: string) => Promise<void>;
   showGuide: boolean;
   onOpenGuide: () => void;
   onCloseGuide: () => void;
};

type Tab = "summary" | "kanban" | "reports" | "messages";

export default function Dashboard({
   user,
   role,
   orgs,
   selected,
   onSelectOrg,
   active,
   tasks,
   projects,
   teams,
   members,
   directory,
   teamMembers,
   goals,
   requests,
   activity,
   handovers,
   outgoingInvites,
   pendingInvites,
   notifications,
   onMarkNotificationRead,
   teamMessages,
   onSendTeamMessage,
   workspaceLoading,
   onRefresh,
   onCreateTask,
   onEditTask,
   onUpdateTaskStatus,
   onDeleteTask,
   onCreateTeam,
   onAssignTeamMember,
   onUnassignTeamMember,
   onCreateProject,
   onEditProject,
   onCreateGoal,
   onEditGoal,
   onInviteMember,
   onRevokeInvite,
   onRemoveMember,
   onUpdateMemberRole,
   onDeleteOrganization,
   onLeaveOrganization,
   onCreateOrganization,
   onCreateRequest,
   onDecideRequest,
   onAcceptInvite,
   onUserRefresh,
   onChangePassword,
   onSignOut,
   onLoadTaskUpdates,
   onAddTaskProgress,
   onReassignTask,
   showGuide,
   onOpenGuide,
   onCloseGuide,
}: DashboardProps) {
   const [tab, setTab] = useState<Tab>("summary");
   const [projectFilter, setProjectFilter] = useState<string>("all");
   const [search, setSearch] = useState("");
   const [statusFilter, setStatusFilter] = useState("all");
   const [myTasksOnly, setMyTasksOnly] = useState(false);
   const [workspaceDialogOpen, setWorkspaceDialogOpen] = useState(false);
   const [workspaceTab, setWorkspaceTab] = useState<WorkspaceDialogTab>("overview");
   const [userDialogOpen, setUserDialogOpen] = useState(false);
   const [userTab, setUserTab] = useState<"profile" | "security" | "invitations" | "workspaces">("profile");
   const [confirmSignOut, setConfirmSignOut] = useState(false);
   const [taskDialogOpen, setTaskDialogOpen] = useState(false);
   const [notificationOpen, setNotificationOpen] = useState(false);
   const [editingTask, setEditingTask] = useState<DashboardTask | null>(null);
   const [selectedTask, setSelectedTask] = useState<string>("");
   const [taskUpdates, setTaskUpdates] = useState<
      { id: string; progress: string; next_action: string | null; created_at: string; author_id: string }[]
   >([]);
   const [progressText, setProgressText] = useState("");
   const [nextStep, setNextStep] = useState("");
   const [createOrgName, setCreateOrgName] = useState("");
   const [mobileMenu, setMobileMenu] = useState(false);
   const [error, setError] = useState("");
   const [notice, setNotice] = useState("");
   const [profileName, setProfileName] = useState(String(user?.user_metadata?.display_name ?? ""));
   const [profilePhotoUrl, setProfilePhotoUrl] = useState<string | null>(null);
   const [hideChecklist, setHideChecklist] = useState(() => {
      if (typeof window === "undefined" || !user?.id || !selected) return false;
      return window.localStorage.getItem("tw-setup-hidden:" + user.id + ":" + selected) === "yes";
   });
   const [showTaskHandover, setShowTaskHandover] = useState(false);
   const [handoverOwner, setHandoverOwner] = useState("");
   const [handoverNote, setHandoverNote] = useState("");
   const [projectName, setProjectName] = useState("");
   const [projectDescription, setProjectDescription] = useState("");
   const [projectGoal, setProjectGoal] = useState("");
   const [projectTeam, setProjectTeam] = useState("");
   const [editingProject, setEditingProject] = useState<string>("");
   const [editProjectName, setEditProjectName] = useState("");
   const [editProjectDescription, setEditProjectDescription] = useState("");
   const [editProjectGoal, setEditProjectGoal] = useState("");
   const [editProjectTeam, setEditProjectTeam] = useState("");
   const [editProjectStatus, setEditProjectStatus] = useState("active");
   const [messageTeam, setMessageTeam] = useState("");
   const [messageText, setMessageText] = useState("");
   const [activeDragId, setActiveDragId] = useState<string | null>(null);
   const [busy, setBusy] = useState(false);

   const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

   const userId = user.id;
   const manager = canManageOrganization(role);

   useEffect(() => {
      setProfileName(String(user?.user_metadata?.display_name ?? ""));
   }, [user?.id]);

   useEffect(() => {
      const path = user?.user_metadata?.avatar_path;
      if (!user?.id || typeof path !== "string" || !path.startsWith(user.id + "/")) {
         setProfilePhotoUrl(null);
         return;
      }
      let live = true;
      setProfilePhotoUrl(null);
      void supabase()
         .storage.from("tw-profile-avatars")
         .createSignedUrl(path, 3600)
         .then(({ data, error }) => {
            if (live) setProfilePhotoUrl(!error ? (data?.signedUrl ?? null) : null);
         })
         .catch(() => {
            if (live) setProfilePhotoUrl(null);
         });
      return () => {
         live = false;
      };
   }, [user?.id, user?.user_metadata?.avatar_path]);

   useEffect(() => {
      setHideChecklist(() => {
         if (typeof window === "undefined" || !user?.id || !selected) return false;
         return window.localStorage.getItem("tw-setup-hidden:" + user.id + ":" + selected) === "yes";
      });
      setProjectFilter("all");
   }, [selected, user?.id]);

   useEffect(() => {
      if (!messageTeam && teams.length > 0) {
         setMessageTeam(teams[0].id);
      }
   }, [teams, messageTeam]);

   const projectScopedTasks = useMemo(() => {
      return tasks.filter((t) =>
         projectFilter === "all" ? true : projectFilter === "none" ? !t.project_id : t.project_id === projectFilter,
      );
   }, [tasks, projectFilter]);

   const filteredTasks = useMemo(() => {
      return projectScopedTasks.filter((t) => {
         const matchesSearch = t.title.toLowerCase().includes(search.trim().toLowerCase());
         const matchesStatus = statusFilter === "all" || t.status === statusFilter;
         const matchesOwner = !myTasksOnly || t.assignees?.some((a) => a.user_id === userId) || t.owner_id === userId;
         return matchesSearch && matchesStatus && matchesOwner;
      });
   }, [projectScopedTasks, search, statusFilter, myTasksOnly, userId]);

   const homeTasks = useMemo(
      () =>
         manager
            ? projectScopedTasks
            : projectScopedTasks.filter((t) => t.assignees?.some((a) => a.user_id === userId) || t.owner_id === userId),
      [projectScopedTasks, manager, userId],
   );

   const counts = useMemo(() => {
      const source = projectScopedTasks;
      return {
         total: source.length,
         assignedToMe: source.filter((t) => t.assignees?.some((a) => a.user_id === userId) || t.owner_id === userId).length,
         overdue: source.filter((t) => t.due_at && new Date(t.due_at) < new Date() && t.status !== "completed").length,
         done: source.filter((t) => t.status === "completed").length,
         unassigned: source.filter((t) => (!t.assignees || t.assignees.length === 0) && !t.owner_id && t.status !== "completed")
            .length,
         forReview: source.filter((t) => t.status === "awaiting_approval").length,
      };
   }, [projectScopedTasks, userId]);

   function taskAllowedStatuses(t: DashboardTask): string[] {
      const canUpdate = manager || (t.assignees ?? []).some((a) => a.user_id === userId) || t.owner_id === userId;
      if (!canUpdate) return [];
      return statuses.filter((st) =>
         manager ? st === t.status || st !== "rejected" || t.status === "awaiting_approval" : st !== "completed" && st !== "rejected",
      );
   }

   function taskAssigneeNames(t: DashboardTask) {
      return t.assignees?.length
         ? t.assignees.map((a) => directory.find((m) => m.user_id === a.user_id)?.display_name ?? "Member").join(", ")
         : t.owner_id
           ? (directory.find((m) => m.user_id === t.owner_id)?.display_name ?? "Assigned")
           : "Unassigned";
   }

   function taskProjectName(t: DashboardTask) {
      return t.project_id ? (projects.find((p) => p.id === t.project_id)?.name ?? "Project") : "No project";
   }

   const activeDragTask = activeDragId ? filteredTasks.find((t) => t.id === activeDragId) : null;

   function handleDragStart(e: DragStartEvent) {
      setActiveDragId(String(e.active.id));
   }

   function handleDragEnd(e: DragEndEvent) {
      setActiveDragId(null);
      const taskId = String(e.active.id);
      const overId = e.over ? String(e.over.id) : null;
      if (!overId) return;
      const moving = filteredTasks.find((t) => t.id === taskId);
      if (!moving) return;
      const destination = overId.startsWith("column-")
         ? overId.replace("column-", "")
         : (filteredTasks.find((t) => t.id === overId)?.status ?? null);
      if (!destination || destination === moving.status || !taskAllowedStatuses(moving).includes(destination)) return;
      void onUpdateTaskStatus(taskId, destination);
   }

   const clear = () => {
      setError("");
      setNotice("");
   };

   function openWorkspaceSection(section: WorkspaceDialogTab) {
      setWorkspaceTab(section);
      setWorkspaceDialogOpen(true);
      setMobileMenu(false);
   }

   async function openTask(id: string) {
      setSelectedTask(id);
      setTaskUpdates([]);
      setShowTaskHandover(false);
      setHandoverOwner("");
      setHandoverNote("");
      try {
         const data = await onLoadTaskUpdates(id);
         setTaskUpdates(data);
      } catch {
         setError("Could not load task progress history.");
      }
   }

   async function handleAddProgress(e: FormEvent) {
      e.preventDefault();
      if (!selectedTask || !progressText.trim()) return;
      setBusy(true);
      clear();
      try {
         await onAddTaskProgress(selectedTask, progressText.trim(), nextStep.trim() || null);
         setProgressText("");
         setNextStep("");
         await openTask(selectedTask);
         await onRefresh();
         setNotice("Progress update recorded.");
      } catch (e) {
         setError(e instanceof Error ? e.message : "Unable to save progress");
      } finally {
         setBusy(false);
      }
   }

   async function handleReassign(e: FormEvent) {
      e.preventDefault();
      if (!selectedTask || !handoverOwner) return;
      setBusy(true);
      clear();
      try {
         await onReassignTask(selectedTask, handoverOwner, handoverNote.trim());
         setHandoverOwner("");
         setHandoverNote("");
         setShowTaskHandover(false);
         await onRefresh();
         setNotice("Task reassigned and handover recorded.");
      } catch (e) {
         setError(e instanceof Error ? e.message : "Unable to reassign task");
      } finally {
         setBusy(false);
      }
   }

   async function handleCreateTask(values: Parameters<DashboardProps["onCreateTask"]>[0]) {
      await onCreateTask(values);
      setTaskDialogOpen(false);
      setTab("kanban");
   }

   async function handleEditTask(values: Parameters<DashboardProps["onEditTask"]>[1]) {
      if (!editingTask) return;
      await onEditTask(editingTask.id, values);
      setTaskDialogOpen(false);
      setEditingTask(null);
   }

   async function handleCreateOrg(e: FormEvent) {
      e.preventDefault();
      if (!createOrgName.trim()) return;
      setBusy(true);
      clear();
      try {
         const id = await onCreateOrganization(createOrgName.trim());
         if (id) {
            setCreateOrgName("");
            onSelectOrg(id);
         }
      } catch (e) {
         setError(e instanceof Error ? e.message : "Unable to create workspace");
      } finally {
         setBusy(false);
      }
   }

   async function handleCreateProject(e: FormEvent) {
      e.preventDefault();
      if (!projectName.trim()) return;
      setBusy(true);
      clear();
      try {
         await onCreateProject(projectName.trim(), projectDescription.trim() || null, projectGoal || null, projectTeam || null);
         setProjectName("");
         setProjectDescription("");
         setProjectGoal("");
         setProjectTeam("");
         await onRefresh();
         setNotice("Project saved.");
      } catch (e) {
         setError(e instanceof Error ? e.message : "Unable to save project");
      } finally {
         setBusy(false);
      }
   }

   async function handleSaveProjectEdit(e: FormEvent) {
      e.preventDefault();
      if (!editingProject || !editProjectName.trim()) return;
      setBusy(true);
      clear();
      try {
         await onEditProject(
            editingProject,
            editProjectName.trim(),
            editProjectDescription.trim() || null,
            editProjectGoal || null,
            editProjectTeam || null,
            editProjectStatus,
         );
         setEditingProject("");
         await onRefresh();
         setNotice("Project changes saved.");
      } catch (e) {
         setError(e instanceof Error ? e.message : "Unable to save project changes");
      } finally {
         setBusy(false);
      }
   }

   async function handleSendMessage(e: FormEvent) {
      e.preventDefault();
      if (!messageTeam || !messageText.trim()) return;
      setBusy(true);
      clear();
      try {
         await onSendTeamMessage(messageTeam, messageText.trim());
         setMessageText("");
         setNotice("Message sent.");
         await onRefresh();
      } catch (err) {
         setError(err instanceof Error ? err.message : "Unable to send message");
      } finally {
         setBusy(false);
      }
   }

   function startProjectEdit(p: DashboardProject) {
      setEditingProject(p.id);
      setEditProjectName(p.name);
      setEditProjectDescription(p.description ?? "");
      setEditProjectGoal(p.goal_id ?? "");
      setEditProjectTeam(p.team_id ?? "");
      setEditProjectStatus(p.status);
   }

   const selectedProject = projects.find((p) => p.id === projectFilter);
   const selectedProjectName =
      projectFilter === "all"
         ? "All projects"
         : projectFilter === "none"
           ? "Unassigned project"
           : (selectedProject?.name ?? "Project");

   const headerSubtitle =
      tab === "summary"
         ? "Overview, analytics, projects, and goals."
         : tab === "kanban"
           ? "Track, assign, and update tasks."
           : tab === "reports"
             ? "Delivery metrics and workload breakdown."
             : "Team conversations and updates.";

   if (!active) {
      return (
         <div className="appShell">
            <main className="content">
               <div className="contentWidth">
                  <div className="card emptyState">
                     {pendingInvites.length > 0 && (
                        <section>
                           <h2>Invitations for you</h2>
                           {pendingInvites.map((i) => (
                              <div className="reportRow" key={i.id}>
                                 <span>Invitation to join as {statusLabel(i.role)}</span>
                                 <button className="primary" disabled={busy} onClick={() => void onAcceptInvite(i.id)}>
                                    Accept
                                 </button>
                              </div>
                           ))}
                        </section>
                     )}
                     <span className="bigIcon">✦</span>
                     <span className="eyebrow blue">WELCOME TO TRACKWISE</span>
                     <h2>Let's get your workspace ready</h2>
                     <p className="muted">
                        Create an organization to organize projects and tasks, or join someone else's through an invitation link.
                     </p>
                     <form onSubmit={handleCreateOrg} className="inlineForm">
                        <input
                           aria-label="Organization name"
                           minLength={2}
                           maxLength={120}
                           value={createOrgName}
                           onChange={(e) => setCreateOrgName(e.target.value)}
                           placeholder="Your organization name"
                           required
                        />
                        <button className="primary" disabled={busy || !createOrgName.trim()}>
                           Create workspace
                        </button>
                     </form>
                  </div>
               </div>
            </main>
         </div>
      );
   }

   return (
      <div className="appShell">
         <div className="mobileTopbar">
            <div className="logo">
               <span className="mark">T</span> Trackwise
            </div>
            <button
               type="button"
               className="mobileMenuToggle"
               aria-label="Open workspace menu"
               aria-expanded={mobileMenu}
               onClick={() => setMobileMenu((v) => !v)}
            >
               ☰ <span>Menu</span>
            </button>
         </div>
         {mobileMenu && <button className="mobileBackdrop" aria-label="Close menu" onClick={() => setMobileMenu(false)} />}

         <aside className={"sidebar " + (mobileMenu ? "mobileOpen" : "")}>
            <div className="logo">
               <span className="mark">T</span> Trackwise
            </div>

            <div className="sideLabel">WORKSPACE</div>
            <select
               className="orgSelect"
               aria-label="Current organization"
               value={selected}
               onChange={(e) => {
                  onSelectOrg(e.target.value);
                  setProjectFilter("all");
                  setMobileMenu(false);
               }}
            >
               <option value="">Select organization</option>
               {orgs.map((o) => (
                  <option key={o.id} value={o.id}>
                     {o.name}
                  </option>
               ))}
            </select>
            <button
               type="button"
               className="navItem"
               onClick={() => {
                  setUserTab("workspaces");
                  setUserDialogOpen(true);
                  setMobileMenu(false);
               }}
            >
               <span>＋</span> New workspace
            </button>
            {orgs.length >= 2 && (
               <p className="muted" style={{ fontSize: 12, margin: "4px 4px 0" }}>
                  You belong to 2 of 2 allowed workspaces.
               </p>
            )}

            <div className="sideSectionHead">
               <span className="sideLabel">PROJECTS</span>
               {manager && (
                  <button
                     type="button"
                     className="sideAddBtn"
                     title="Add a project"
                     onClick={() => {
                        setTab("summary");
                        setMobileMenu(false);
                        setTimeout(() => document.getElementById("projectCreator")?.scrollIntoView({ behavior: "smooth" }), 60);
                     }}
                  >
                     ＋ Add
                  </button>
               )}
            </div>
            <nav aria-label="Projects">
               <button
                  type="button"
                  className={"navItem " + (projectFilter === "all" ? "selected" : "")}
                  onClick={() => {
                     setProjectFilter("all");
                     setMobileMenu(false);
                  }}
               >
                  <span>▤</span> All projects
               </button>
               <button
                  type="button"
                  className={"navItem " + (projectFilter === "none" ? "selected" : "")}
                  onClick={() => {
                     setProjectFilter("none");
                     setMobileMenu(false);
                  }}
               >
                  <span>—</span> No project
               </button>
               {projects.map((p) => (
                  <button
                     type="button"
                     key={p.id}
                     className={"navItem " + (projectFilter === p.id ? "selected" : "")}
                     onClick={() => {
                        setProjectFilter(p.id);
                        setMobileMenu(false);
                     }}
                  >
                     <span>▧</span> {p.name}
                  </button>
               ))}
            </nav>

            <div className="sideFoot">
               <button type="button" className="navItem" onClick={() => openWorkspaceSection("overview")}>
                  <span>⚙</span> Workspace settings
               </button>
               <div className="sideAccountRow">
                  <button
                     type="button"
                     className="sideUserBtn"
                     onClick={() => {
                        setUserDialogOpen(true);
                        setMobileMenu(false);
                     }}
                  >
                     <ProfileAvatar
                        size="md"
                        name={profileName.trim() || user.email?.split("@")[0] || "Member"}
                        photoUrl={profilePhotoUrl}
                        styleName={user.user_metadata?.avatar_style}
                     />
                     <span className="userDetails">
                        <strong>{profileName.trim() || user.email?.split("@")[0]}</strong>
                        <small>{role ? statusLabel(role) : "Account"}</small>
                     </span>
                  </button>
                  <button
                     type="button"
                     className="logout"
                     title="Sign out"
                     aria-label="Sign out"
                     onClick={() => setConfirmSignOut(true)}
                  >
                     ↪
                  </button>
               </div>
            </div>
         </aside>

         <div className="workspace">
            <header className="appHeader">
               <div className="pageHeading">
                  <span className="eyebrow blue">TRACKWISE / {selectedProjectName.toUpperCase()}</span>
                  <h1>{selectedProject ? selectedProject.name : active.name}</h1>
                  <p className="muted">{headerSubtitle}</p>
               </div>
               <div className="headerControls">
                  <button type="button" className="headerHelp" onClick={() => setNotificationOpen(true)} aria-label="Notifications">
                     🔔 <span>Notifications</span>
                     {notifications.some((n) => !n.read_at) && <span className="notificationBadge" aria-hidden="true" />}
                  </button>
                  <button type="button" className="headerHelp" onClick={() => onOpenGuide()} aria-label="How to use Trackwise">
                     ? <span>Help</span>
                  </button>
               </div>
            </header>

            <main className="content">
               <div className="contentWidth">
                  {error && <p className="feedback bad">{error}</p>}
                  {notice && <p className="feedback good">{notice}</p>}

                  <nav className="sectionTabs" aria-label="Dashboard sections">
                     {[
                        { value: "summary" as Tab, label: "Summary & analytics" },
                        { value: "kanban" as Tab, label: `Kanban (${projectScopedTasks.length})` },
                        { value: "reports" as Tab, label: "Reports" },
                        { value: "messages" as Tab, label: "Team messages" },
                     ].map((t) => (
                        <button
                           type="button"
                           key={t.value}
                           className={tab === t.value ? "active" : ""}
                           onClick={() => setTab(t.value)}
                        >
                           {t.label}
                        </button>
                     ))}
                  </nav>

                  {tab === "summary" && (
                     <>
                        {!hideChecklist && (
                           <section className="card setupChecklist">
                              <div className="sectionHead">
                                 <div>
                                    <span className="eyebrow blue">GETTING STARTED</span>
                                    <h2>{manager ? "Set up your workspace" : "Make Trackwise your own"}</h2>
                                 </div>
                                 <button
                                    type="button"
                                    className="textAction"
                                    onClick={() => {
                                       setHideChecklist(true);
                                       if (user?.id && selected)
                                          window.localStorage.setItem("tw-setup-hidden:" + user.id + ":" + selected, "yes");
                                    }}
                                 >
                                    Hide checklist ×
                                 </button>
                              </div>
                              <p className="muted">
                                 {manager
                                    ? "Complete these steps to organize your work."
                                    : "Trackwise helps you follow your tasks and stay in touch with your team."}
                              </p>
                              {manager ? (
                                 <div className="setupSteps">
                                    {[
                                       {
                                          label: "Invite a person",
                                          done: members.length > 1 || outgoingInvites.length > 0,
                                          help: "Share a link so a teammate can join.",
                                          action: () => openWorkspaceSection("invitations"),
                                       },
                                       {
                                          label: "Create a project",
                                          done: projects.length > 0,
                                          help: "Group related tasks together.",
                                          action: () =>
                                             document.getElementById("projectCreator")?.scrollIntoView({ behavior: "smooth" }),
                                       },
                                       {
                                          label: "Create a team",
                                          done: teams.length > 0,
                                          help: "Organize people working together.",
                                          action: () => openWorkspaceSection("teams"),
                                       },
                                       {
                                          label: "Add a task",
                                          done: tasks.length > 0,
                                          help: "Assign something and set a deadline.",
                                          action: () => {
                                             setEditingTask(null);
                                             setTaskDialogOpen(true);
                                          },
                                       },
                                    ].map((item) => (
                                       <button
                                          type="button"
                                          key={item.label}
                                          className={"setupStep " + (item.done ? "done" : "")}
                                          onClick={item.action}
                                       >
                                          <span className="setupCheck" aria-hidden="true">
                                             {item.done ? "✓" : "○"}
                                          </span>
                                          <span>
                                             <strong>{item.label}</strong>
                                             <small>{item.done ? "Done!" : item.help}</small>
                                          </span>
                                          <span aria-hidden="true">→</span>
                                       </button>
                                    ))}
                                 </div>
                              ) : (
                                 <div className="setupSteps">
                                    <button type="button" className="setupStep" onClick={() => setTab("kanban")}>
                                       <span className="setupCheck">☑</span>
                                       <span>
                                          <strong>Find your tasks</strong>
                                          <small>See what your team has assigned to you.</small>
                                       </span>
                                       <span aria-hidden="true">→</span>
                                    </button>
                                    <button type="button" className="setupStep" onClick={() => setTab("messages")}>
                                       <span className="setupCheck">◈</span>
                                       <span>
                                          <strong>Team messages</strong>
                                          <small>Stay in touch with your team.</small>
                                       </span>
                                       <span aria-hidden="true">→</span>
                                    </button>
                                 </div>
                              )}
                              <button type="button" className="textAction setupHelpLink" onClick={() => onOpenGuide()}>
                                 How does Trackwise work? →
                              </button>
                           </section>
                        )}

                        <div className="stats statsSix">
                           <div className="stat">
                              <span>Total tasks</span>
                              <strong>{counts.total}</strong>
                              <small>{projectFilter === "all" ? "Across this workspace" : selectedProjectName}</small>
                           </div>
                           <div className="stat">
                              <span>Assigned to me</span>
                              <strong>{counts.assignedToMe}</strong>
                              <small>Your responsibilities</small>
                           </div>
                           <div className="stat">
                              <span>Overdue</span>
                              <strong>{counts.overdue}</strong>
                              <small>Still awaiting completion</small>
                           </div>
                           <div className="stat">
                              <span>Completed</span>
                              <strong>{counts.done}</strong>
                              <small>Approved work</small>
                           </div>
                           <div className="stat">
                              <span>Unassigned</span>
                              <strong>{counts.unassigned}</strong>
                              <small>Needs an owner</small>
                           </div>
                           <div className="stat">
                              <span>For review</span>
                              <strong>{counts.forReview}</strong>
                              <small>Awaiting approval</small>
                           </div>
                        </div>

                        <div className="twoCol">
                           <section className="card">
                              <div className="sectionHead">
                                 <h2>{manager ? "Recent work" : "My recent tasks"}</h2>
                                 <button className="textAction" onClick={() => setTab("kanban")}>
                                    Open Kanban →
                                 </button>
                              </div>
                              {homeTasks.slice(0, 5).length ? (
                                 homeTasks.slice(0, 5).map((t) => (
                                    <div className="taskLine" key={t.id}>
                                       <span className={"taskDot " + t.status} />
                                       <div>
                                          <strong>{t.title}</strong>
                                          <small>
                                             {taskStatusLabel(t.status)} · {statusLabel(t.priority)} priority
                                          </small>
                                       </div>
                                    </div>
                                 ))
                              ) : (
                                 <p className="muted">
                                    {manager
                                       ? "Tasks will appear here after you create them."
                                       : "Your leader can assign tasks to you."}
                                 </p>
                              )}
                           </section>

                           <section className="card" id="projectCreator">
                              <div className="sectionHead">
                                 <h2>{manager ? "＋ Add a project" : "Saved projects"}</h2>
                                 <span className="chip">{projects.length}</span>
                              </div>
                              {manager ? (
                                 <form onSubmit={handleCreateProject} className="formGrid">
                                    <div className="span2">
                                       <label htmlFor="dash-project-name">Project name *</label>
                                       <input
                                          id="dash-project-name"
                                          value={projectName}
                                          onChange={(e) => setProjectName(e.target.value)}
                                          required
                                          maxLength={180}
                                          placeholder="e.g. School beautification project"
                                       />
                                    </div>
                                    <div className="span2">
                                       <label htmlFor="dash-project-description">Description (optional)</label>
                                       <textarea
                                          id="dash-project-description"
                                          rows={2}
                                          maxLength={4000}
                                          value={projectDescription}
                                          onChange={(e) => setProjectDescription(e.target.value)}
                                          placeholder="What is this project meant to achieve?"
                                       />
                                    </div>
                                    <div>
                                       <label htmlFor="dash-project-goal">Linked goal (optional)</label>
                                       <select
                                          id="dash-project-goal"
                                          value={projectGoal}
                                          onChange={(e) => setProjectGoal(e.target.value)}
                                       >
                                          <option value="">No linked goal</option>
                                          {goals.map((g) => (
                                             <option key={g.id} value={g.id}>
                                                {g.title}
                                             </option>
                                          ))}
                                       </select>
                                    </div>
                                    <div>
                                       <label htmlFor="dash-project-team">Responsible team (optional)</label>
                                       <select
                                          id="dash-project-team"
                                          value={projectTeam}
                                          onChange={(e) => setProjectTeam(e.target.value)}
                                       >
                                          <option value="">No team assigned</option>
                                          {teams.map((t) => (
                                             <option key={t.id} value={t.id}>
                                                {t.name}
                                             </option>
                                          ))}
                                       </select>
                                    </div>
                                    <div className="formAction span2">
                                       <button type="submit" className="primary" disabled={busy || !projectName.trim()}>
                                          Save project
                                       </button>
                                    </div>
                                 </form>
                              ) : projects.length ? (
                                 projects.map((p) => (
                                    <div className="taskLine" key={p.id}>
                                       <span className="taskDot underway" />
                                       <div>
                                          <strong>{p.name}</strong>
                                          <small>
                                             {statusLabel(p.status)} · {tasks.filter((t) => t.project_id === p.id).length} tasks
                                          </small>
                                       </div>
                                    </div>
                                 ))
                              ) : (
                                 <p className="muted">Your workspace leaders have not created any projects yet.</p>
                              )}
                           </section>
                        </div>

                        {projects.length > 0 && (
                           <section className="card">
                              <div className="sectionHead">
                                 <h2>
                                    Projects <span className="count">{projects.length}</span>
                                 </h2>
                                 <button type="button" className="textAction" onClick={() => openWorkspaceSection("planning")}>
                                    Goals & planning →
                                 </button>
                              </div>
                              <div className="projectGrid">
                                 {projects.map((p) => (
                                    <article className="projectCard" key={p.id}>
                                       <div className="projectTop">
                                          <strong>{p.name}</strong>
                                          <span className="chip">{statusLabel(p.status)}</span>
                                       </div>
                                       {p.description && <p className="muted">{p.description}</p>}
                                       <p className="muted">
                                          {p.goal_id
                                             ? "Goal: " + (goals.find((g) => g.id === p.goal_id)?.title ?? "Linked goal")
                                             : "No linked goal"}{" "}
                                          ·{" "}
                                          {p.team_id
                                             ? "Team: " + (teams.find((t) => t.id === p.team_id)?.name ?? "Assigned team")
                                             : "No team assigned"}
                                       </p>
                                       <div className="projectFoot">
                                          <span>
                                             <strong>{tasks.filter((t) => t.project_id === p.id).length}</strong> saved tasks
                                          </span>
                                          <div className="projectActions">
                                             <button
                                                type="button"
                                                onClick={() => {
                                                   setProjectFilter(p.id);
                                                   setTab("kanban");
                                                }}
                                             >
                                                Filter tasks →
                                             </button>
                                             {manager && (
                                                <button
                                                   type="button"
                                                   onClick={() =>
                                                      editingProject === p.id ? setEditingProject("") : startProjectEdit(p)
                                                   }
                                                >
                                                   {editingProject === p.id ? "Cancel" : "✎ Edit"}
                                                </button>
                                             )}
                                          </div>
                                       </div>
                                       {manager && editingProject === p.id && (
                                          <form className="projectEditForm formGrid" onSubmit={handleSaveProjectEdit}>
                                             <div className="span2">
                                                <h3>Edit project</h3>
                                                <label htmlFor="editProjectName">Project name</label>
                                                <input
                                                   id="editProjectName"
                                                   required
                                                   minLength={2}
                                                   maxLength={180}
                                                   value={editProjectName}
                                                   onChange={(e) => setEditProjectName(e.target.value)}
                                                />
                                             </div>
                                             <div className="span2">
                                                <label htmlFor="editProjectDescription">Description</label>
                                                <textarea
                                                   id="editProjectDescription"
                                                   rows={3}
                                                   maxLength={4000}
                                                   value={editProjectDescription}
                                                   onChange={(e) => setEditProjectDescription(e.target.value)}
                                                />
                                             </div>
                                             <div>
                                                <label htmlFor="editProjectStatus">Status</label>
                                                <select
                                                   id="editProjectStatus"
                                                   value={editProjectStatus}
                                                   onChange={(e) => setEditProjectStatus(e.target.value)}
                                                >
                                                   <option value="active">Active</option>
                                                   <option value="on_hold">On hold</option>
                                                   <option value="completed">Completed</option>
                                                </select>
                                             </div>
                                             <div>
                                                <label htmlFor="editProjectGoal">Goal</label>
                                                <select
                                                   id="editProjectGoal"
                                                   value={editProjectGoal}
                                                   onChange={(e) => setEditProjectGoal(e.target.value)}
                                                >
                                                   <option value="">No linked goal</option>
                                                   {goals.map((g) => (
                                                      <option key={g.id} value={g.id}>
                                                         {g.title}
                                                      </option>
                                                   ))}
                                                </select>
                                             </div>
                                             <div className="span2">
                                                <label htmlFor="editProjectTeam">Team</label>
                                                <select
                                                   id="editProjectTeam"
                                                   value={editProjectTeam}
                                                   onChange={(e) => setEditProjectTeam(e.target.value)}
                                                >
                                                   <option value="">No team assigned</option>
                                                   {teams.map((t) => (
                                                      <option key={t.id} value={t.id}>
                                                         {t.name}
                                                      </option>
                                                   ))}
                                                </select>
                                             </div>
                                             <div className="span2">
                                                <button type="submit" className="primary" disabled={busy}>
                                                   {busy ? "Saving…" : "Save project changes"}
                                                </button>
                                                <button type="button" onClick={() => setEditingProject("")}>
                                                   Cancel
                                                </button>
                                             </div>
                                          </form>
                                       )}
                                    </article>
                                 ))}
                              </div>
                           </section>
                        )}
                     </>
                  )}

                  {tab === "kanban" && (
                     <>
                        <section className="card">
                           <div className="sectionHead">
                              <div>
                                 <h2>
                                    {selectedProjectName} · Tasks <span className="count">{filteredTasks.length}</span>
                                 </h2>
                                 <p className="muted" style={{ margin: "4px 0 0" }}>
                                    Drag cards between columns to change status, or use the menu on each card. Click a title to edit.
                                 </p>
                              </div>
                              <div className="headerActions">
                                 {manager && (
                                    <button
                                       type="button"
                                       className="primary"
                                       onClick={() => {
                                          setEditingTask(null);
                                          setTaskDialogOpen(true);
                                       }}
                                    >
                                       ＋ Add task
                                    </button>
                                 )}
                              </div>
                           </div>

                           <div className="filterBar">
                              <label className="taskOwnerFilter">
                                 <input type="checkbox" checked={myTasksOnly} onChange={(e) => setMyTasksOnly(e.target.checked)} /> My
                                 tasks only
                              </label>
                              <input
                                 aria-label="Search tasks"
                                 placeholder="Search tasks…"
                                 value={search}
                                 onChange={(e) => setSearch(e.target.value)}
                              />
                              <select
                                 aria-label="Filter by status"
                                 value={statusFilter}
                                 onChange={(e) => setStatusFilter(e.target.value)}
                              >
                                 <option value="all">All statuses</option>
                                 {statuses.map((x) => (
                                    <option key={x} value={x}>
                                       {taskStatusLabel(x)}
                                    </option>
                                 ))}
                              </select>
                           </div>

                           {selectedTask && (
                              <div className="card taskComposer" style={{ marginBottom: 18 }}>
                                 <div className="sectionHead">
                                    <h2>{tasks.find((t) => t.id === selectedTask)?.title}</h2>
                                    <div className="headerActions">
                                       <button
                                          type="button"
                                          className="secondary"
                                          onClick={() => {
                                             const found = tasks.find((t) => t.id === selectedTask);
                                             if (found) {
                                                setEditingTask(found);
                                                setTaskDialogOpen(true);
                                             }
                                          }}
                                       >
                                          ✎ Edit details
                                       </button>
                                       <button type="button" className="textAction" onClick={() => setSelectedTask("")}>
                                          Close ×
                                       </button>
                                    </div>
                                 </div>
                                 <div className="taskActionPanel">
                                    <p className="muted">
                                       {manager
                                          ? "Leaders can mark completed work as finished."
                                          : "Mark work as ready for approval when you finish."}
                                    </p>
                                    {manager && tasks.find((t) => t.id === selectedTask)?.status !== "completed" && (
                                       <button
                                          type="button"
                                          className="primary"
                                          disabled={busy}
                                          onClick={() => void onUpdateTaskStatus(selectedTask, "completed")}
                                       >
                                          ✓ Mark completed
                                       </button>
                                    )}
                                    {!manager &&
                                       (tasks.find((t) => t.id === selectedTask)?.assignees?.some((a) => a.user_id === userId) ||
                                          tasks.find((t) => t.id === selectedTask)?.owner_id === userId) &&
                                       tasks.find((t) => t.id === selectedTask)?.status !== "completed" &&
                                       tasks.find((t) => t.id === selectedTask)?.status !== "awaiting_approval" && (
                                          <button
                                             type="button"
                                             className="primary"
                                             disabled={busy}
                                             onClick={() => void onUpdateTaskStatus(selectedTask, "awaiting_approval")}
                                          >
                                             Submit for approval →
                                          </button>
                                       )}
                                 </div>
                                 <h3>Progress history</h3>
                                 {taskUpdates.length ? (
                                    taskUpdates.map((u) => (
                                       <div className="taskLine" key={u.id}>
                                          <span className="taskDot" />
                                          <div>
                                             <strong>{u.progress}</strong>
                                             <small>
                                                {u.next_action ? "Next: " + u.next_action + " · " : ""}
                                                {new Date(u.created_at).toLocaleString()}
                                             </small>
                                          </div>
                                       </div>
                                    ))
                                 ) : (
                                    <p className="muted">No progress updates recorded.</p>
                                 )}
                                 {(manager ||
                                    tasks.find((t) => t.id === selectedTask)?.assignees?.some((a) => a.user_id === userId) ||
                                    tasks.find((t) => t.id === selectedTask)?.owner_id === userId) && (
                                    <form onSubmit={handleAddProgress}>
                                       <label htmlFor="dash-progress">Progress update</label>
                                       <textarea
                                          id="dash-progress"
                                          rows={2}
                                          value={progressText}
                                          onChange={(e) => setProgressText(e.target.value)}
                                          placeholder="What changed?"
                                          required
                                       />
                                       <label htmlFor="dash-next-step">Next step (optional)</label>
                                       <input
                                          id="dash-next-step"
                                          value={nextStep}
                                          onChange={(e) => setNextStep(e.target.value)}
                                          placeholder="What happens next?"
                                       />
                                       <button className="primary" style={{ marginTop: 12 }} disabled={busy || !progressText.trim()}>
                                          Add update
                                       </button>
                                    </form>
                                 )}
                                 {manager && (
                                    <>
                                       <div className="detailAction">
                                          <button className="textAction" onClick={() => setShowTaskHandover((v) => !v)}>
                                             {showTaskHandover ? "Hide reassignment" : "↗ Reassign task"}
                                          </button>
                                       </div>
                                       {showTaskHandover && (
                                          <form onSubmit={handleReassign} className="handoverForm">
                                             <h3>Reassign task</h3>
                                             <label htmlFor="dash-handover-owner">New owner</label>
                                             <select
                                                id="dash-handover-owner"
                                                value={handoverOwner}
                                                onChange={(e) => setHandoverOwner(e.target.value)}
                                                required
                                             >
                                                <option value="">Choose a member</option>
                                                {directory
                                                   .filter(
                                                      (m) =>
                                                         canOwnTask(m.role) &&
                                                         m.user_id !== tasks.find((t) => t.id === selectedTask)?.owner_id,
                                                   )
                                                   .map((m) => (
                                                      <option key={m.user_id} value={m.user_id}>
                                                         {m.display_name}
                                                      </option>
                                                   ))}
                                             </select>
                                             <label htmlFor="dash-handover-note">Handover instructions</label>
                                             <textarea
                                                id="dash-handover-note"
                                                rows={3}
                                                required
                                                minLength={3}
                                                maxLength={2000}
                                                value={handoverNote}
                                                onChange={(e) => setHandoverNote(e.target.value)}
                                             />
                                             <button className="primary" style={{ marginTop: 12 }} disabled={busy}>
                                                Confirm handover
                                             </button>
                                          </form>
                                       )}
                                    </>
                                 )}
                              </div>
                           )}

                           <DndContext
                              sensors={sensors}
                              collisionDetection={closestCorners}
                              onDragStart={handleDragStart}
                              onDragEnd={handleDragEnd}
                              onDragCancel={() => setActiveDragId(null)}
                           >
                              <div className="kanbanBoard">
                                 {statuses.map((status) => {
                                    const columnTasks = filteredTasks.filter((t) => t.status === status);
                                    return (
                                       <KanbanColumn key={status} status={status} count={columnTasks.length}>
                                          {columnTasks.map((t) => {
                                             const allowed = taskAllowedStatuses(t);
                                             return (
                                                <KanbanCard
                                                   key={t.id}
                                                   task={t}
                                                   assigneeNames={taskAssigneeNames(t)}
                                                   projectName={taskProjectName(t)}
                                                   canDrag={allowed.some((s) => s !== t.status)}
                                                   statusOptions={allowed}
                                                   busy={busy}
                                                   onEdit={() => {
                                                      setEditingTask(t);
                                                      setTaskDialogOpen(true);
                                                   }}
                                                   onProgress={() => void openTask(t.id)}
                                                   onStatusChange={(s) => void onUpdateTaskStatus(t.id, s)}
                                                />
                                             );
                                          })}
                                       </KanbanColumn>
                                    );
                                 })}
                              </div>
                              <DragOverlay>
                                 {activeDragTask ? (
                                    <article className="kanbanCard kanbanOverlay">
                                       <div className="kanbanCardTop">
                                          <strong>{activeDragTask.title}</strong>
                                          <span className={"priority " + activeDragTask.priority}>
                                             {statusLabel(activeDragTask.priority)}
                                          </span>
                                       </div>
                                    </article>
                                 ) : null}
                              </DragOverlay>
                           </DndContext>
                           {!filteredTasks.length && (
                              <p className="muted">
                                 {workspaceLoading
                                    ? "Loading saved tasks from the database…"
                                    : manager
                                      ? "No saved tasks match your filters. Select ＋ Add task above to create one."
                                      : "No saved tasks match your filters."}
                              </p>
                           )}
                        </section>
                     </>
                  )}

                  {tab === "reports" && (
                     <Reports
                        tasks={projectScopedTasks}
                        projects={projects}
                        teams={teams}
                        directory={directory}
                        organizationName={selectedProject ? `${active.name} · ${selectedProject.name}` : active.name}
                        organizationId={selected}
                     />
                  )}

                  {tab === "messages" && (
                     <div className="operations">
                        <section className="card">
                           <div className="sectionHead">
                              <div>
                                 <h2>Team messages</h2>
                                 <p className="muted" style={{ margin: "4px 0 0" }}>
                                    Messages are organized by team channel. Select a team to post and read updates.
                                 </p>
                              </div>
                              {manager && teams.length === 0 && (
                                 <button type="button" className="primary" onClick={() => openWorkspaceSection("teams")}>
                                    ＋ Create a team
                                 </button>
                              )}
                           </div>
                           {teams.length > 0 ? (
                              <>
                                 <label htmlFor="dash-msg-team">Team channel</label>
                                 <select id="dash-msg-team" value={messageTeam} onChange={(e) => setMessageTeam(e.target.value)}>
                                    {teams.map((t) => (
                                       <option key={t.id} value={t.id}>
                                          {t.name}
                                       </option>
                                    ))}
                                 </select>
                                 <form onSubmit={handleSendMessage}>
                                    <label htmlFor="dash-msg-text">New message</label>
                                    <textarea
                                       id="dash-msg-text"
                                       rows={3}
                                       maxLength={3000}
                                       required
                                       value={messageText}
                                       onChange={(e) => setMessageText(e.target.value)}
                                       placeholder="Share an update with your team"
                                    />
                                    <button className="primary" type="submit" disabled={busy || !messageTeam || !messageText.trim()}>
                                       Post message
                                    </button>
                                 </form>
                              </>
                           ) : (
                              <p className="muted">
                                 No teams created yet.{" "}
                                 {manager
                                    ? "Create a team in Workspace settings to start messaging."
                                    : "Ask a workspace leader to create a team and assign you."}
                              </p>
                           )}

                           <div className="messageFeed">
                              {teamMessages.filter((m) => !messageTeam || m.team_id === messageTeam).length ? (
                                 teamMessages
                                    .filter((m) => !messageTeam || m.team_id === messageTeam)
                                    .map((msg) => (
                                       <div className="messageItem" key={msg.id}>
                                          <p>{msg.content}</p>
                                          <small>
                                             <strong>
                                                {msg.sender_id === userId
                                                   ? "You"
                                                   : (directory.find((m) => m.user_id === msg.sender_id)?.display_name ?? "Member")}
                                             </strong>{" "}
                                             · {teams.find((t) => t.id === msg.team_id)?.name ?? "Team"} ·{" "}
                                             {new Date(msg.created_at).toLocaleString()}
                                          </small>
                                       </div>
                                    ))
                              ) : (
                                 <p className="muted">No messages in this channel yet.</p>
                              )}
                           </div>
                        </section>
                     </div>
                  )}
               </div>
            </main>
         </div>

         <WorkspaceDialog
            open={workspaceDialogOpen}
            onOpenChange={setWorkspaceDialogOpen}
            initialTab={workspaceTab}
            organizationId={selected}
            organizationName={active.name}
            organizationCount={orgs.length}
            userId={userId}
            role={role}
            directory={directory}
            members={members}
            teams={teams}
            teamMembers={teamMembers}
            tasks={tasks}
            projects={projects}
            goals={goals}
            activity={activity}
            outgoingInvites={outgoingInvites}
            requests={requests}
            createdAt={active.created_at}
            onRefresh={onRefresh}
            onCreateTeam={onCreateTeam}
            onAssignTeamMember={onAssignTeamMember}
            onUnassignTeamMember={onUnassignTeamMember}
            onInviteMember={onInviteMember}
            onRevokeInvite={onRevokeInvite}
            onRemoveMember={onRemoveMember}
            onUpdateMemberRole={onUpdateMemberRole}
            onDeleteOrganization={onDeleteOrganization}
            onLeaveOrganization={onLeaveOrganization}
            onCreateOrganization={onCreateOrganization}
            onCreateRequest={onCreateRequest}
            onDecideRequest={onDecideRequest}
            onCreateGoal={onCreateGoal}
            onEditGoal={onEditGoal}
         />

         <UserDialog
            open={userDialogOpen}
            onOpenChange={setUserDialogOpen}
            initialTab={userTab}
            user={user}
            role={role}
            pendingInvites={pendingInvites}
            orgs={orgs}
            selectedOrg={selected}
            onSelectOrg={onSelectOrg}
            profileName={profileName}
            organizationName={active?.name ?? ""}
            assignedTasks={
               tasks.filter((t) => t.owner_id === user.id || (t.assignees ?? []).some((a) => a.user_id === user.id)).length
            }
            projectsCount={projects.length}
            photoUrl={profilePhotoUrl}
            onUserRefresh={onUserRefresh}
            onChangePassword={onChangePassword}
            onAcceptInvite={onAcceptInvite}
            onCreateOrganization={onCreateOrganization}
            onLeaveOrganization={onLeaveOrganization}
            onSignOut={() => {
               setUserDialogOpen(false);
               setConfirmSignOut(true);
            }}
         />

         <DialogShell open={confirmSignOut} onOpenChange={setConfirmSignOut} title="Sign out" subtitle="Confirm">
            <p className="muted">Are you sure you want to sign out of Trackwise?</p>
            <div className="taskInlineActions" style={{ marginTop: 14 }}>
               <button type="button" className="secondary" onClick={() => setConfirmSignOut(false)}>
                  Stay signed in
               </button>
               <button
                  type="button"
                  className="dangerAction"
                  onClick={() => {
                     setConfirmSignOut(false);
                     void onSignOut();
                  }}
               >
                  Sign out ↪
               </button>
            </div>
         </DialogShell>

         <TaskDialog
            open={taskDialogOpen}
            onOpenChange={(open) => {
               setTaskDialogOpen(open);
               if (!open) setEditingTask(null);
            }}
            task={editingTask}
            organizationId={selected}
            userId={userId}
            role={role}
            directory={directory}
            projects={projects}
            onSave={editingTask ? handleEditTask : handleCreateTask}
            onDelete={
               editingTask
                  ? async () => {
                       await onDeleteTask(editingTask.id);
                       setTaskDialogOpen(false);
                       setEditingTask(null);
                    }
                  : undefined
            }
         />

         <DialogShell open={notificationOpen} onOpenChange={setNotificationOpen} title="Notifications">
            {notifications.length ? (
               notifications.map((n) => (
                  <div className={"notificationRow " + (n.read_at ? "read" : "unread")} key={n.id}>
                     <div>
                        <strong>{n.title}</strong>
                        <p className="muted">{n.message}</p>
                        <small>{new Date(n.created_at).toLocaleString()}</small>
                     </div>
                     {!n.read_at && (
                        <button type="button" className="textAction" onClick={() => void onMarkNotificationRead(n.id)}>
                           Mark read
                        </button>
                     )}
                  </div>
               ))
            ) : (
               <p className="muted">You have no notifications.</p>
            )}
         </DialogShell>

         {showGuide && (
            <div className="guideOverlay" role="dialog" aria-modal="true" aria-label="Trackwise quick-start guide">
               <div className="guidePanel">
                  <div className="guideTop">
                     <span className="eyebrow blue">TRACKWISE QUICK START</span>
                     <button type="button" className="guideClose" onClick={onCloseGuide} aria-label="Close guide">
                        ×
                     </button>
                  </div>
                  <h2>{manager ? "Welcome! Let's organize your team 👋" : "Welcome to your workspace 👋"}</h2>
                  <p className="muted">
                     {manager
                        ? "Here's a simple path from starting a project to getting things done."
                        : "You can focus on your work while your leaders manage projects and assignments."}
                  </p>
                  <div className="guideCards">
                     <div>
                        <span>1</span>
                        <strong>Projects live in the sidebar</strong>
                        <p>Select any project on the left to filter its Summary, Kanban tasks, and Reports.</p>
                     </div>
                     <div>
                        <span>2</span>
                        <strong>Assign multiple people to tasks</strong>
                        <p>Open the Kanban tab and click ＋ Add task to assign one or more teammates and set deadlines.</p>
                     </div>
                     <div>
                        <span>3</span>
                        <strong>Workspace & account dialogs</strong>
                        <p>Use Workspace settings in the bottom-left to invite people, manage teams, and review requests.</p>
                     </div>
                  </div>
                  <div className="guideActions">
                     <button
                        type="button"
                        className="primary"
                        onClick={() => {
                           onCloseGuide();
                           setTab("kanban");
                        }}
                     >
                        Go to Kanban →
                     </button>
                     <button type="button" onClick={onCloseGuide}>
                        Got it
                     </button>
                  </div>
               </div>
            </div>
         )}
      </div>
   );
}

function KanbanColumn({ status, count, children }: { status: string; count: number; children: ReactNode }) {
   const { setNodeRef, isOver } = useDroppable({ id: "column-" + status });
   return (
      <section
         ref={setNodeRef}
         className={"kanbanColumn" + (isOver ? " over" : "")}
         aria-label={taskStatusLabel(status) + " column"}
      >
         <div className="kanbanColumnHead">
            <h3>{taskStatusLabel(status)}</h3>
            <span className="count">{count}</span>
         </div>
         <div className="kanbanCards">{count ? children : <div className="kanbanDropHint">Drop a task here</div>}</div>
      </section>
   );
}

type KanbanCardProps = {
   task: DashboardTask;
   assigneeNames: string;
   projectName: string;
   canDrag: boolean;
   statusOptions: string[];
   busy: boolean;
   onEdit: () => void;
   onProgress: () => void;
   onStatusChange: (status: string) => void;
};

function KanbanCard({
   task,
   assigneeNames,
   projectName,
   canDrag,
   statusOptions,
   busy,
   onEdit,
   onProgress,
   onStatusChange,
}: KanbanCardProps) {
   const { attributes, listeners, setNodeRef: setDragRef, setActivatorNodeRef, transform, isDragging } = useDraggable({
      id: task.id,
      disabled: !canDrag,
   });
   const { setNodeRef: setDropRef } = useDroppable({ id: task.id });
   const setRefs = (el: HTMLElement | null) => {
      setDragRef(el);
      setDropRef(el);
   };
   return (
      <article
         ref={setRefs}
         style={{ transform: CSS.Translate.toString(transform) }}
         className={"kanbanCard" + (isDragging ? " dragging" : "")}
      >
         <div className="kanbanCardTop">
            {canDrag && (
               <button
                  type="button"
                  ref={setActivatorNodeRef}
                  className="kanbanDragHandle"
                  aria-label={"Drag " + task.title}
                  {...attributes}
                  {...listeners}
               >
                  ⠿
               </button>
            )}
            <button type="button" className="kanbanCardTitle" onClick={onEdit}>
               {task.title}
            </button>
            <span className={"priority " + task.priority}>{statusLabel(task.priority)}</span>
         </div>
         {task.description && <p className="kanbanCardDesc">{task.description}</p>}
         <p className="kanbanCardMeta">
            <span>{task.due_at ? "Due " + new Date(task.due_at).toLocaleDateString() : "No deadline"}</span>
            <span aria-hidden="true">·</span>
            <span>{assigneeNames}</span>
            <span aria-hidden="true">·</span>
            <span>{projectName}</span>
         </p>
         <div className="kanbanCardFoot">
            <button type="button" className="textAction" onClick={onProgress}>
               Progress
            </button>
            {statusOptions.length ? (
               <select
                  aria-label={"Status for " + task.title}
                  value={task.status}
                  disabled={busy}
                  onChange={(e) => onStatusChange(e.target.value)}
               >
                  {statusOptions.map((st) => (
                     <option key={st} value={st}>
                        {st === task.status ? taskStatusLabel(st) : st === "awaiting_approval" ? "Submit for approval" : taskStatusLabel(st)}
                     </option>
                  ))}
               </select>
            ) : (
               <span className="chip">{taskStatusLabel(task.status)}</span>
            )}
         </div>
      </article>
   );
}
