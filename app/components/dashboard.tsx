"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { type User } from "@supabase/supabase-js";
import DialogShell from "./dialog-shell";
import TaskDialog from "./task-dialog";
import UserDialog from "./user-dialog";
import WorkspaceDialog from "./workspace-dialog";
import Reports from "../reports";
import { canCompleteTask, canManageOrganization, canOwnTask, taskStatusLabel } from "../../lib/task-rules";

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
   onLeaveOrganization: () => Promise<void>;
   onCreateOrganization: (name: string) => Promise<string | undefined>;
   onCreateRequest: (title: string, details: string) => Promise<void>;
   onDecideRequest: (id: string, decision: string, reason: string) => Promise<void>;
   onAcceptInvite: (id: string) => Promise<void>;
   onSaveProfile: (name: string) => Promise<void>;
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

type Tab = "summary" | "kanban" | "reports";

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
   onSaveProfile,
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
   const [workspaceTab, setWorkspaceTab] = useState<"overview" | "members" | "teams" | "activity" | "reports">("overview");
   const [userDialogOpen, setUserDialogOpen] = useState(false);
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
   const [goalTitle, setGoalTitle] = useState("");
   const [goalDescription, setGoalDescription] = useState("");
   const [goalTarget, setGoalTarget] = useState("");
   const [editingProject, setEditingProject] = useState<string>("");
   const [editProjectName, setEditProjectName] = useState("");
   const [editProjectDescription, setEditProjectDescription] = useState("");
   const [editProjectGoal, setEditProjectGoal] = useState("");
   const [editProjectTeam, setEditProjectTeam] = useState("");
   const [editProjectStatus, setEditProjectStatus] = useState("active");
   const [editingGoal, setEditingGoal] = useState<string>("");
   const [editGoalTitle, setEditGoalTitle] = useState("");
   const [editGoalDescription, setEditGoalDescription] = useState("");
   const [editGoalDate, setEditGoalDate] = useState("");
   const [editGoalStatus, setEditGoalStatus] = useState("active");
   const [busy, setBusy] = useState(false);

   const userId = user.id;
   const manager = canManageOrganization(role);

   useEffect(() => {
      setProfileName(String(user?.user_metadata?.display_name ?? ""));
   }, [user?.id]);

   useEffect(() => {
      setHideChecklist(() => {
         if (typeof window === "undefined" || !user?.id || !selected) return false;
         return window.localStorage.getItem("tw-setup-hidden:" + user.id + ":" + selected) === "yes";
      });
      setProjectFilter("all");
   }, [selected, user?.id]);

   const filteredTasks = useMemo(() => {
      return tasks.filter((t) => {
         const matchesProject = projectFilter === "all" || (projectFilter === "none" ? !t.project_id : t.project_id === projectFilter);
         const matchesSearch = t.title.toLowerCase().includes(search.trim().toLowerCase());
         const matchesStatus = statusFilter === "all" || t.status === statusFilter;
         const matchesOwner = !myTasksOnly || t.assignees?.some((a) => a.user_id === userId) || t.owner_id === userId;
         return matchesProject && matchesSearch && matchesStatus && matchesOwner;
      });
   }, [tasks, projectFilter, search, statusFilter, myTasksOnly, userId]);

   const homeTasks = manager ? tasks : tasks.filter((t) => t.assignees?.some((a) => a.user_id === userId) || t.owner_id === userId);
   const counts = useMemo(() => {
      const source = homeTasks;
      return {
         total: source.length,
         active: source.filter((t) => t.status === "underway").length,
         blocked: source.filter((t) => t.status === "blocked").length,
         done: source.filter((t) => t.status === "completed").length,
         overdue: source.filter((t) => t.due_at && new Date(t.due_at) < new Date() && t.status !== "completed").length,
      };
   }, [homeTasks]);

   const clear = () => {
      setError("");
      setNotice("");
   };

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

   async function handleCreateGoal(e: FormEvent) {
      e.preventDefault();
      if (!goalTitle.trim()) return;
      setBusy(true);
      clear();
      try {
         await onCreateGoal(goalTitle.trim(), goalDescription.trim() || null, goalTarget || null);
         setGoalTitle("");
         setGoalDescription("");
         setGoalTarget("");
         await onRefresh();
         setNotice("Goal created.");
      } catch (e) {
         setError(e instanceof Error ? e.message : "Unable to create goal");
      } finally {
         setBusy(false);
      }
   }

   async function handleSaveGoalEdit(e: FormEvent) {
      e.preventDefault();
      if (!editingGoal || !editGoalTitle.trim()) return;
      setBusy(true);
      clear();
      try {
         await onEditGoal(editingGoal, editGoalTitle.trim(), editGoalDescription.trim() || null, editGoalDate || null, editGoalStatus);
         setEditingGoal("");
         await onRefresh();
         setNotice("Goal updated.");
      } catch (e) {
         setError(e instanceof Error ? e.message : "Unable to save goal changes");
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

   function startGoalEdit(g: DashboardGoal) {
      setEditingGoal(g.id);
      setEditGoalTitle(g.title);
      setEditGoalDescription(g.description ?? "");
      setEditGoalDate(g.target_date ?? "");
      setEditGoalStatus(g.status);
   }

   const selectedProjectName =
      projectFilter === "all"
         ? "All projects"
         : projectFilter === "none"
           ? "No project"
           : (projects.find((p) => p.id === projectFilter)?.name ?? "Project");

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

            <div className="sideLabel">QUICK ACTIONS</div>
            <div className="sideQuickActions">
               {manager && (
                  <button
                     type="button"
                     className="primary"
                     onClick={() => {
                        setEditingTask(null);
                        setTaskDialogOpen(true);
                        setMobileMenu(false);
                     }}
                  >
                     ＋ New task
                  </button>
               )}
               <button
                  type="button"
                  className="secondary"
                  onClick={() => {
                     setTab("summary");
                     setTimeout(() => document.getElementById("projectCreator")?.scrollIntoView({ behavior: "smooth" }), 50);
                     setMobileMenu(false);
                  }}
               >
                  ＋ New project
               </button>
               <button
                  type="button"
                  className="secondary"
                  onClick={() => {
                     setWorkspaceTab("overview");
                     setWorkspaceDialogOpen(true);
                     setMobileMenu(false);
                  }}
               >
                  ＋ New workspace
               </button>
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

            <div className="sideLabel">PROJECTS</div>
            <nav aria-label="Projects">
               <button
                  type="button"
                  className={"navItem " + (projectFilter === "all" ? "selected" : "")}
                  onClick={() => setProjectFilter("all")}
               >
                  <span>▤</span> All projects
               </button>
               <button
                  type="button"
                  className={"navItem " + (projectFilter === "none" ? "selected" : "")}
                  onClick={() => setProjectFilter("none")}
               >
                  <span>—</span> No project
               </button>
               {projects.map((p) => (
                  <button
                     type="button"
                     key={p.id}
                     className={"navItem " + (projectFilter === p.id ? "selected" : "")}
                     onClick={() => setProjectFilter(p.id)}
                  >
                     <span>▧</span> {p.name}
                  </button>
               ))}
            </nav>

            <div className="sideFoot">
               <button
                  type="button"
                  className="navItem"
                  onClick={() => {
                     setWorkspaceTab("overview");
                     setWorkspaceDialogOpen(true);
                     setMobileMenu(false);
                  }}
               >
                  <span>⚙</span> Workspace
               </button>
               <button
                  type="button"
                  className="navItem"
                  onClick={() => {
                     setUserDialogOpen(true);
                     setMobileMenu(false);
                  }}
               >
                  <span>♙</span> Account
               </button>
            </div>
         </aside>

         <div className="workspace">
            <header className="appHeader">
               <div className="pageHeading">
                  <span className="eyebrow blue">TRACKWISE / {selectedProjectName.toUpperCase()}</span>
                  <h1>{active.name}</h1>
                  <p className="muted">Everything your team needs, organized in one place.</p>
               </div>
               <div className="headerControls">
                  <button type="button" className="headerHelp" onClick={() => setNotificationOpen(true)} aria-label="Notifications">
                     🔔 <span>Notifications</span>
                     {notifications.some((n) => !n.read_at) && <span className="notificationBadge" aria-hidden="true" />}
                  </button>
                  <button
                     type="button"
                     className="headerHelp"
                     onClick={() => setWorkspaceDialogOpen(true)}
                     aria-label="Workspace information"
                  >
                     ⚙ <span>Workspace</span>
                  </button>
                  {manager && (
                     <button
                        type="button"
                        className="primary mainCreateButton"
                        onClick={() => {
                           setEditingTask(null);
                           setTaskDialogOpen(true);
                        }}
                     >
                        ＋ New task
                     </button>
                  )}
                  <button type="button" className="headerHelp" onClick={() => onOpenGuide()} aria-label="How to use Trackwise">
                     ? <span>Help</span>
                  </button>
                  <button
                     type="button"
                     className="headerHelp"
                     onClick={() => setUserDialogOpen(true)}
                     aria-label="Account"
                     title={user.email ?? "Account"}
                  >
                     ♙ <span>Account</span>
                  </button>
               </div>
            </header>

            <main className="content">
               <div className="contentWidth">
                  {error && <p className="feedback bad">{error}</p>}
                  {notice && <p className="feedback good">{notice}</p>}

                  <nav className="sectionTabs" aria-label="Dashboard sections">
                     {[
                        { value: "summary" as Tab, label: "Summary" },
                        { value: "kanban" as Tab, label: "Kanban" },
                        { value: "reports" as Tab, label: "Reports" },
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
                                       { label: "Invite a person", done: members.length > 1 || outgoingInvites.length > 0 },
                                       { label: "Create a project", done: projects.length > 0 },
                                       { label: "Create a team", done: teams.length > 0 },
                                       { label: "Add a task", done: tasks.length > 0 },
                                    ].map((item) => (
                                       <button type="button" key={item.label} className={"setupStep " + (item.done ? "done" : "")}>
                                          <span className="setupCheck" aria-hidden="true">
                                             {item.done ? "✓" : "○"}
                                          </span>
                                          <span>
                                             <strong>{item.label}</strong>
                                             <small>{item.done ? "Done!" : "Get started"}</small>
                                          </span>
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
                                    </button>
                                    <button type="button" className="setupStep" onClick={() => setTab("reports")}>
                                       <span className="setupCheck">▤</span>
                                       <span>
                                          <strong>Check reports</strong>
                                          <small>Track progress and workload.</small>
                                       </span>
                                    </button>
                                 </div>
                              )}
                              <button type="button" className="textAction setupHelpLink" onClick={() => onCloseGuide()}>
                                 How does Trackwise work? →
                              </button>
                           </section>
                        )}

                        <div className="welcome">
                           <div>
                              <span className="eyebrow">YOUR WORKSPACE · {role ? statusLabel(role) : "Role pending"}</span>
                              <h2>{active.name}</h2>
                              <p>Everything your team needs, organized in one place.</p>
                           </div>
                           <button onClick={() => setTab("kanban")}>Open tasks ↗</button>
                        </div>

                        <section className="quickActions" aria-label="Quick actions">
                           {manager ? (
                              <>
                                 <button type="button" onClick={() => setTaskDialogOpen(true)}>
                                    <span className="quickIcon">＋</span>
                                    <span>
                                       <strong>New task</strong>
                                       <small>Create & assign</small>
                                    </span>
                                 </button>
                                 <button
                                    type="button"
                                    onClick={() => document.getElementById("projectCreator")?.scrollIntoView({ behavior: "smooth" })}
                                 >
                                    <span className="quickIcon">▧</span>
                                    <span>
                                       <strong>New project</strong>
                                       <small>Organize work</small>
                                    </span>
                                 </button>
                                 <button
                                    type="button"
                                    onClick={() => {
                                       setWorkspaceTab("members");
                                       setWorkspaceDialogOpen(true);
                                    }}
                                 >
                                    <span className="quickIcon">✉</span>
                                    <span>
                                       <strong>Invite person</strong>
                                       <small>Grow your team</small>
                                    </span>
                                 </button>
                                 <button type="button" onClick={() => setTab("reports")}>
                                    <span className="quickIcon">▤</span>
                                    <span>
                                       <strong>Reports</strong>
                                       <small>Track results</small>
                                    </span>
                                 </button>
                              </>
                           ) : (
                              <>
                                 <button type="button" onClick={() => setTab("kanban")}>
                                    <span className="quickIcon">☑</span>
                                    <span>
                                       <strong>My tasks</strong>
                                       <small>See assignments</small>
                                    </span>
                                 </button>
                                 <button type="button" onClick={() => setTab("reports")}>
                                    <span className="quickIcon">▤</span>
                                    <span>
                                       <strong>Reports</strong>
                                       <small>Track results</small>
                                    </span>
                                 </button>
                              </>
                           )}
                        </section>

                        <section className="card">
                           <div className="sectionHead">
                              <h2>My assignments</h2>
                              <button type="button" onClick={() => setTab("kanban")}>
                                 View my tasks →
                              </button>
                           </div>
                           <div className="stats">
                              <div className="stat">
                                 <span>Assigned to me</span>
                                 <strong>
                                    {
                                       tasks.filter((t) => t.assignees?.some((a) => a.user_id === userId) || t.owner_id === userId)
                                          .length
                                    }
                                 </strong>
                              </div>
                              <div className="stat">
                                 <span>Due soon</span>
                                 <strong>
                                    {
                                       tasks.filter(
                                          (t) =>
                                             (t.assignees?.some((a) => a.user_id === userId) || t.owner_id === userId) &&
                                             t.due_at &&
                                             new Date(t.due_at).getTime() >= Date.now() &&
                                             new Date(t.due_at).getTime() < Date.now() + 7 * 86400000 &&
                                             t.status !== "completed",
                                       ).length
                                    }
                                 </strong>
                              </div>
                              <div className="stat">
                                 <span>Overdue</span>
                                 <strong>
                                    {
                                       tasks.filter(
                                          (t) =>
                                             (t.assignees?.some((a) => a.user_id === userId) || t.owner_id === userId) &&
                                             t.due_at &&
                                             new Date(t.due_at) < new Date() &&
                                             t.status !== "completed",
                                       ).length
                                    }
                                 </strong>
                              </div>
                           </div>
                        </section>

                        <div className="stats">
                           <div className="stat">
                              <span>{manager ? "All tasks" : "My tasks"}</span>
                              <strong>{counts.total}</strong>
                              <small>{manager ? "Across your workspace" : "Assigned to you"}</small>
                           </div>
                           <div className="stat">
                              <span>In progress</span>
                              <strong>{counts.active}</strong>
                              <small>Currently underway</small>
                           </div>
                           <div className="stat">
                              <span>Blocked</span>
                              <strong>{counts.blocked}</strong>
                              <small>Need attention</small>
                           </div>
                           <div className="stat">
                              <span>Completed</span>
                              <strong>{counts.done}</strong>
                              <small>Finished tasks</small>
                           </div>
                        </div>

                        <div className="twoCol">
                           <section className="card">
                              <div className="sectionHead">
                                 <h2>{manager ? "Recent work" : "My recent tasks"}</h2>
                                 <button className="textAction" onClick={() => setTab("kanban")}>
                                    View all →
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

                           {manager && (
                              <section className="card" id="projectCreator">
                                 <div className="sectionHead">
                                    <h2>＋ Add a project</h2>
                                 </div>
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
                                          rows={3}
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
                                    <div className="span2">
                                       <button type="submit" className="primary" disabled={busy || !projectName.trim()}>
                                          Save project
                                       </button>
                                    </div>
                                 </form>
                              </section>
                           )}
                        </div>

                        {manager && goals.length > 0 && (
                           <section className="card">
                              <div className="sectionHead">
                                 <h2>Goals</h2>
                              </div>
                              {goals.map((g) => (
                                 <div className="goalRecord" key={g.id}>
                                    <div className="taskLine">
                                       <span className="taskDot underway" />
                                       <div>
                                          <strong>{g.title}</strong>
                                          <small>
                                             {statusLabel(g.status)}
                                             {g.target_date
                                                ? " · Target " + new Date(g.target_date + "T12:00:00").toLocaleDateString()
                                                : ""}
                                          </small>
                                          {g.description && <p className="muted">{g.description}</p>}
                                       </div>
                                    </div>
                                    <button
                                       type="button"
                                       className="textAction"
                                       onClick={() => (editingGoal === g.id ? setEditingGoal("") : startGoalEdit(g))}
                                    >
                                       {editingGoal === g.id ? "Cancel" : "✎ Edit goal"}
                                    </button>
                                    {editingGoal === g.id && (
                                       <form className="goalEditForm" onSubmit={handleSaveGoalEdit}>
                                          <input value={editGoalTitle} onChange={(e) => setEditGoalTitle(e.target.value)} required />
                                          <textarea
                                             value={editGoalDescription}
                                             onChange={(e) => setEditGoalDescription(e.target.value)}
                                             rows={2}
                                          />
                                          <input type="date" value={editGoalDate} onChange={(e) => setEditGoalDate(e.target.value)} />
                                          <select value={editGoalStatus} onChange={(e) => setEditGoalStatus(e.target.value)}>
                                             <option value="active">Active</option>
                                             <option value="paused">Paused</option>
                                             <option value="achieved">Achieved</option>
                                          </select>
                                          <button type="submit" className="primary" disabled={busy || !editGoalTitle.trim()}>
                                             Save goal changes
                                          </button>
                                       </form>
                                    )}
                                 </div>
                              ))}
                           </section>
                        )}

                        {manager && (
                           <section className="card">
                              <div className="sectionHead">
                                 <h2>Create a goal</h2>
                              </div>
                              <form onSubmit={handleCreateGoal}>
                                 <label htmlFor="dash-goal-title">New goal</label>
                                 <input
                                    id="dash-goal-title"
                                    value={goalTitle}
                                    onChange={(e) => setGoalTitle(e.target.value)}
                                    placeholder="e.g. Improve service response time"
                                    required
                                    minLength={2}
                                    maxLength={180}
                                 />
                                 <label htmlFor="dash-goal-description">Description (optional)</label>
                                 <textarea
                                    id="dash-goal-description"
                                    rows={2}
                                    maxLength={4000}
                                    value={goalDescription}
                                    onChange={(e) => setGoalDescription(e.target.value)}
                                    placeholder="What will success look like?"
                                 />
                                 <label htmlFor="dash-goal-target">Target date</label>
                                 <input
                                    id="dash-goal-target"
                                    type="date"
                                    value={goalTarget}
                                    onChange={(e) => setGoalTarget(e.target.value)}
                                 />
                                 <button className="primary" style={{ marginTop: 14 }} disabled={busy || !goalTitle.trim()}>
                                    Create goal
                                 </button>
                              </form>
                           </section>
                        )}
                     </>
                  )}

                  {tab === "kanban" && (
                     <>
                        <section className="card">
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
                                    <button type="button" className="textAction" onClick={() => setSelectedTask("")}>
                                       Close
                                    </button>
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

                           <div className="tablewrap">
                              <table>
                                 <thead>
                                    <tr>
                                       <th>Task</th>
                                       <th>Priority</th>
                                       <th>Due date</th>
                                       <th>Project</th>
                                       <th>Assignees</th>
                                       <th>Status</th>
                                    </tr>
                                 </thead>
                                 <tbody>
                                    {filteredTasks.length ? (
                                       filteredTasks.map((t) => (
                                          <tr key={t.id}>
                                             <td>
                                                <button
                                                   className="taskOpen"
                                                   onClick={() => {
                                                      setEditingTask(t);
                                                      setTaskDialogOpen(true);
                                                   }}
                                                >
                                                   {t.title}
                                                </button>
                                             </td>
                                             <td>
                                                <span className={"priority " + t.priority}>{statusLabel(t.priority)}</span>
                                             </td>
                                             <td>{t.due_at ? new Date(t.due_at).toLocaleDateString() : "—"}</td>
                                             <td>
                                                {t.project_id ? (projects.find((p) => p.id === t.project_id)?.name ?? "Project") : "—"}
                                             </td>
                                             <td>
                                                {t.assignees?.length
                                                   ? t.assignees
                                                        .map(
                                                           (a) =>
                                                              directory.find((m) => m.user_id === a.user_id)?.display_name ?? "Member",
                                                        )
                                                        .join(", ")
                                                   : t.owner_id
                                                     ? (directory.find((m) => m.user_id === t.owner_id)?.display_name ?? "Assigned")
                                                     : "Unassigned"}
                                             </td>
                                             <td>
                                                {manager || t.assignees?.some((a) => a.user_id === userId) || t.owner_id === userId ? (
                                                   <select
                                                      aria-label={"Status for " + t.title}
                                                      value={t.status}
                                                      disabled={busy}
                                                      onChange={(e) => void onUpdateTaskStatus(t.id, e.target.value)}
                                                   >
                                                      {statuses
                                                         .filter((st) =>
                                                            manager
                                                               ? st === t.status ||
                                                                 st !== "rejected" ||
                                                                 t.status === "awaiting_approval"
                                                               : st !== "completed" && st !== "rejected",
                                                         )
                                                         .map((st) => (
                                                            <option key={st} value={st}>
                                                               {st === t.status
                                                                  ? taskStatusLabel(st)
                                                                  : st === "awaiting_approval"
                                                                    ? "Submit for approval"
                                                                    : taskStatusLabel(st)}
                                                            </option>
                                                         ))}
                                                   </select>
                                                ) : (
                                                   <span className="chip">{taskStatusLabel(t.status)}</span>
                                                )}
                                             </td>
                                          </tr>
                                       ))
                                    ) : (
                                       <tr>
                                          <td colSpan={6} className="muted">
                                             {workspaceLoading
                                                ? "Loading saved tasks from the database…"
                                                : "No saved tasks match your filters."}
                                          </td>
                                       </tr>
                                    )}
                                 </tbody>
                              </table>
                           </div>
                           <div className="mobileTaskList">
                              {filteredTasks.length ? (
                                 filteredTasks.map((t) => (
                                    <article className="mobileTaskCard" key={t.id}>
                                       <div className="mobileTaskTop">
                                          <span className={"priority " + t.priority}>{statusLabel(t.priority)}</span>
                                          <span className="mobileTaskDate">
                                             {t.due_at ? "Due " + new Date(t.due_at).toLocaleDateString() : "No deadline"}
                                          </span>
                                       </div>
                                       <button
                                          className="mobileTaskTitle"
                                          onClick={() => {
                                             setEditingTask(t);
                                             setTaskDialogOpen(true);
                                          }}
                                       >
                                          {t.title} <span aria-hidden="true">↗</span>
                                       </button>
                                       <div className="mobileTaskMeta">
                                          <span>
                                             {t.assignees?.length
                                                ? t.assignees
                                                     .map(
                                                        (a) =>
                                                           directory.find((m) => m.user_id === a.user_id)?.display_name ?? "Member",
                                                     )
                                                     .join(", ")
                                                : t.owner_id
                                                  ? (directory.find((m) => m.user_id === t.owner_id)?.display_name ?? "Assigned")
                                                  : "Unassigned"}
                                          </span>
                                          <span>
                                             {t.project_id
                                                ? " · " + (projects.find((p) => p.id === t.project_id)?.name ?? "Project")
                                                : " · No project"}
                                          </span>
                                       </div>
                                       <div className="mobileTaskStatus">
                                          <span className="chip">{taskStatusLabel(t.status)}</span>
                                       </div>
                                    </article>
                                 ))
                              ) : (
                                 <div className="card">
                                    <p className="muted">
                                       {workspaceLoading ? "Loading saved tasks…" : "No saved tasks match these filters."}
                                    </p>
                                 </div>
                              )}
                           </div>
                        </section>
                     </>
                  )}

                  {tab === "reports" && (
                     <Reports
                        tasks={tasks}
                        projects={projects}
                        teams={teams}
                        directory={directory}
                        organizationName={active.name}
                        organizationId={selected}
                     />
                  )}
               </div>
            </main>
         </div>

         <WorkspaceDialog
            open={workspaceDialogOpen}
            onOpenChange={(open) => {
               setWorkspaceDialogOpen(open);
               if (open) setWorkspaceTab("overview");
            }}
            organizationId={selected}
            organizationName={active.name}
            userId={userId}
            role={role}
            directory={directory}
            members={members}
            teams={teams}
            teamMembers={teamMembers}
            tasks={tasks}
            projects={projects}
            activity={activity}
            outgoingInvites={outgoingInvites}
            requests={requests}
            teamMessages={teamMessages}
            onSendTeamMessage={onSendTeamMessage}
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
         />

         <UserDialog
            open={userDialogOpen}
            onOpenChange={setUserDialogOpen}
            user={user}
            role={role}
            pendingInvites={pendingInvites}
            orgs={orgs}
            selectedOrg={selected}
            onSelectOrg={onSelectOrg}
            profileName={profileName}
            onProfileNameChange={setProfileName}
            onSaveProfile={onSaveProfile}
            onChangePassword={onChangePassword}
            onAcceptInvite={onAcceptInvite}
            onCreateOrganization={onCreateOrganization}
            onSignOut={onSignOut}
         />

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
                     <h2>Welcome to Trackwise</h2>
                     <button type="button" className="guideClose" onClick={onCloseGuide} aria-label="Close guide">
                        ×
                     </button>
                  </div>
                  <p className="muted">Three things to know before you start.</p>
                  <div className="guideCards">
                     <div>
                        <span>1</span>
                        <strong>Projects organize your work</strong>
                        <p>Use the sidebar to pick a project, then view its tasks, reports, and summary in the tabs.</p>
                     </div>
                     <div>
                        <span>2</span>
                        <strong>Tasks can have multiple assignees</strong>
                        <p>Select everyone responsible when creating or editing a task so ownership is clear.</p>
                     </div>
                     <div>
                        <span>3</span>
                        <strong>Workspace details are one click away</strong>
                        <p>Invite people, manage teams, and review activity from the Workspace dialog.</p>
                     </div>
                  </div>
                  <div className="guideActions">
                     <button type="button" className="primary" onClick={onCloseGuide}>
                        Got it
                     </button>
                  </div>
               </div>
            </div>
         )}
      </div>
   );
}
