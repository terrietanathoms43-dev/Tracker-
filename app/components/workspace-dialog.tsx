"use client";

import { type FormEvent, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import DialogShell from "./dialog-shell";
import Reports from "../reports";
import { canManageOrganization, canOwnTask } from "../../lib/task-rules";

const WorkspaceBackup = dynamic(() => import("../workspace-backup"), { ssr: false, loading: () => null });

const statusLabel = (s: string) => s.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());

type DirectoryMember = { user_id: string; display_name: string; role: string };
type Member = { user_id: string; role: string };
type Team = { id: string; name: string; organization_id: string };
type TeamMember = { team_id: string; user_id: string; role: string };
type Project = {
   id: string;
   name: string;
   description: string | null;
   status: string;
   team_id: string | null;
   goal_id: string | null;
};
type Goal = { id: string; title: string; description: string | null; status: string; target_date: string | null };
type Activity = { id: string; entity_type: string; action: string; created_at: string; details: Record<string, unknown> };
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
};
type OutgoingInvite = { id: string; email: string; role: string; expires_at: string; accepted_at: string | null };
type RequestItem = {
   id: string;
   title: string;
   details: string | null;
   decision: string;
   submitted_by: string;
   decision_reason: string | null;
   created_at: string;
};

export type WorkspaceDialogTab =
   | "overview"
   | "planning"
   | "members"
   | "teams"
   | "invitations"
   | "requests"
   | "activity"
   | "reports"
   | "backup";

type WorkspaceDialogProps = {
   open: boolean;
   onOpenChange: (open: boolean) => void;
   initialTab?: WorkspaceDialogTab;
   organizationId: string;
   organizationName: string;
   organizationCount: number;
   userId: string;
   role: string | null | undefined;
   directory: DirectoryMember[];
   members: Member[];
   teams: Team[];
   teamMembers: TeamMember[];
   tasks: Task[];
   projects: Project[];
   goals: Goal[];
   activity: Activity[];
   outgoingInvites: OutgoingInvite[];
   requests: RequestItem[];
   createdAt: string;
   onRefresh: () => Promise<void>;
   onCreateTeam: (name: string) => Promise<void>;
   onAssignTeamMember: (teamId: string, userId: string, role: string) => Promise<void>;
   onUnassignTeamMember: (teamId: string, userId: string, displayName: string) => Promise<void>;
   onInviteMember: (email: string, role: string) => Promise<{ invitationId?: string; email: string } | undefined>;
   onRevokeInvite: (id: string) => Promise<void>;
   onRemoveMember: (userId: string, displayName: string) => Promise<void>;
   onUpdateMemberRole: (userId: string, role: string) => Promise<void>;
   onDeleteOrganization: () => Promise<void>;
   onLeaveOrganization: (orgId?: string) => Promise<boolean>;
   onCreateOrganization: (name: string) => Promise<string | undefined>;
   onCreateRequest: (title: string, details: string) => Promise<void>;
   onDecideRequest: (id: string, decision: string, reason: string) => Promise<void>;
   onCreateGoal: (title: string, description: string | null, targetDate: string | null) => Promise<void>;
   onEditGoal: (id: string, title: string, description: string | null, targetDate: string | null, status: string) => Promise<void>;
};

export default function WorkspaceDialog({
   open,
   onOpenChange,
   initialTab = "overview",
   organizationId,
   organizationName,
   organizationCount,
   userId,
   role,
   directory,
   members,
   teams,
   teamMembers,
   tasks,
   projects,
   goals,
   activity,
   outgoingInvites,
   requests,
   createdAt,
   onRefresh,
   onCreateTeam,
   onAssignTeamMember,
   onUnassignTeamMember,
   onInviteMember,
   onRevokeInvite,
   onRemoveMember,
   onUpdateMemberRole,
   onDeleteOrganization,
   onLeaveOrganization,
   onCreateOrganization,
   onCreateRequest,
   onDecideRequest,
   onCreateGoal,
   onEditGoal,
}: WorkspaceDialogProps) {
   const [tab, setTab] = useState<WorkspaceDialogTab>(initialTab);
   const [teamName, setTeamName] = useState("");
   const [assignTeam, setAssignTeam] = useState("");
   const [assignUser, setAssignUser] = useState("");
   const [assignRole, setAssignRole] = useState("member");
   const [inviteEmail, setInviteEmail] = useState("");
   const [inviteRole, setInviteRole] = useState("member");
   const [roleEditing, setRoleEditing] = useState("");
   const [roleChoice, setRoleChoice] = useState("member");
   const [newOrgName, setNewOrgName] = useState("");
   const [requestTitle, setRequestTitle] = useState("");
   const [requestDetails, setRequestDetails] = useState("");
   const [decisionReason, setDecisionReason] = useState("");
   const [decidingRequest, setDecidingRequest] = useState("");
   const [goalTitle, setGoalTitle] = useState("");
   const [goalDescription, setGoalDescription] = useState("");
   const [goalTarget, setGoalTarget] = useState("");
   const [editingGoal, setEditingGoal] = useState("");
   const [editGoalTitle, setEditGoalTitle] = useState("");
   const [editGoalDescription, setEditGoalDescription] = useState("");
   const [editGoalDate, setEditGoalDate] = useState("");
   const [editGoalStatus, setEditGoalStatus] = useState("active");
   const [busy, setBusy] = useState(false);
   const [error, setError] = useState("");
   const [notice, setNotice] = useState("");
   const [inviteShareId, setInviteShareId] = useState("");
   const [inviteShareEmail, setInviteShareEmail] = useState("");
   const [inviteShareReady, setInviteShareReady] = useState(false);

   const manager = canManageOrganization(role);
   const isAdmin = role === "admin";

   useEffect(() => {
      if (open) {
         setTab(initialTab);
         setError("");
         setNotice("");
      }
   }, [open, initialTab]);

   const clear = () => {
      setError("");
      setNotice("");
   };

   const pendingInvites = useMemo(
      () => outgoingInvites.filter((i) => !i.accepted_at && new Date(i.expires_at) > new Date()),
      [outgoingInvites],
   );

   const tabs = useMemo(() => {
      const items: { value: WorkspaceDialogTab; label: string; icon: string }[] = [
         { value: "overview", label: "Overview", icon: "⌂" },
         { value: "members", label: `Members (${members.length})`, icon: "♙" },
         { value: "teams", label: `Teams (${teams.length})`, icon: "◈" },
      ];
      if (manager) {
         items.push({ value: "invitations", label: `Invitations (${pendingInvites.length})`, icon: "✉" });
      }
      items.push(
         { value: "planning", label: "Goals & planning", icon: "◉" },
         { value: "requests", label: `Requests (${requests.length})`, icon: "☑" },
         { value: "activity", label: "Activity", icon: "◷" },
         { value: "reports", label: "Reports", icon: "▤" },
      );
      if (isAdmin) {
         items.push({ value: "backup", label: "Backup & export", icon: "🔒" });
      }
      return items;
   }, [members.length, teams.length, pendingInvites.length, requests.length, manager, isAdmin]);

   const activeTabLabel = tabs.find((t) => t.value === tab)?.label ?? "Workspace";

   async function handleCreateTeam(e: FormEvent) {
      e.preventDefault();
      if (!teamName.trim()) return;
      setBusy(true);
      clear();
      try {
         await onCreateTeam(teamName.trim());
         setTeamName("");
         setNotice("Team created.");
         await onRefresh();
      } catch (e) {
         setError(e instanceof Error ? e.message : "Unable to create team");
      } finally {
         setBusy(false);
      }
   }

   async function handleAssignMember(e: FormEvent) {
      e.preventDefault();
      if (!assignTeam || !assignUser) return;
      setBusy(true);
      clear();
      try {
         await onAssignTeamMember(assignTeam, assignUser, assignRole);
         setAssignTeam("");
         setAssignUser("");
         setAssignRole("member");
         setNotice("Team membership saved.");
         await onRefresh();
      } catch (e) {
         setError(e instanceof Error ? e.message : "Unable to assign team member");
      } finally {
         setBusy(false);
      }
   }

   async function handleInvite(e: FormEvent) {
      e.preventDefault();
      if (!inviteEmail.trim()) return;
      setBusy(true);
      clear();
      try {
         const result = await onInviteMember(inviteEmail.trim().toLowerCase(), inviteRole);
         if (result?.invitationId) {
            setInviteShareId(result.invitationId);
            setInviteShareEmail(result.email);
            setInviteShareReady(true);
         }
         setInviteEmail("");
         setNotice("Invitation created. Copy the link or share it directly with the invited person.");
         await onRefresh();
      } catch (e) {
         setError(e instanceof Error ? e.message : "Unable to invite member");
      } finally {
         setBusy(false);
      }
   }

   async function handleRevoke(id: string) {
      setBusy(true);
      clear();
      try {
         await onRevokeInvite(id);
         if (inviteShareId === id) {
            setInviteShareReady(false);
            setInviteShareId("");
         }
         setNotice("Invitation revoked.");
         await onRefresh();
      } catch (e) {
         setError(e instanceof Error ? e.message : "Unable to revoke invitation");
      } finally {
         setBusy(false);
      }
   }

   async function handleUpdateRole(memberId: string) {
      if (!isAdmin) return;
      clear();
      try {
         await onUpdateMemberRole(memberId, roleChoice);
         setRoleEditing("");
         setNotice("Member role updated.");
         await onRefresh();
      } catch (e) {
         setError(e instanceof Error ? e.message : "Unable to update member role");
      }
   }

   async function handleRemove(memberId: string, displayName: string) {
      if (!isAdmin || memberId === userId) return;
      clear();
      try {
         await onRemoveMember(memberId, displayName);
         setNotice(`${displayName} was removed from the organization.`);
         await onRefresh();
      } catch (e) {
         setError(e instanceof Error ? e.message : "Unable to remove member");
      }
   }

   async function handleCreateOrg(e: FormEvent) {
      e.preventDefault();
      if (!newOrgName.trim()) return;
      setBusy(true);
      clear();
      try {
         await onCreateOrganization(newOrgName.trim());
         setNewOrgName("");
         setNotice("Workspace created. Switch to it from the sidebar.");
      } catch (e) {
         setError(e instanceof Error ? e.message : "Unable to create workspace");
      } finally {
         setBusy(false);
      }
   }

   async function handleCreateRequest(e: FormEvent) {
      e.preventDefault();
      if (!requestTitle.trim()) return;
      setBusy(true);
      clear();
      try {
         await onCreateRequest(requestTitle.trim(), requestDetails.trim());
         setRequestTitle("");
         setRequestDetails("");
         setNotice("Request submitted.");
         await onRefresh();
      } catch (err) {
         setError(err instanceof Error ? err.message : "Unable to submit request");
      } finally {
         setBusy(false);
      }
   }

   async function handleDecide(requestId: string, decision: "approved" | "deferred" | "rejected") {
      if (!decisionReason.trim()) {
         setError("Enter a short reason for your decision.");
         return;
      }
      setBusy(true);
      clear();
      try {
         await onDecideRequest(requestId, decision, decisionReason.trim());
         setDecidingRequest("");
         setDecisionReason("");
         setNotice(`Request ${decision}.`);
         await onRefresh();
      } catch (err) {
         setError(err instanceof Error ? err.message : "Unable to decide request");
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
         setNotice("Goal created.");
         await onRefresh();
      } catch (err) {
         setError(err instanceof Error ? err.message : "Unable to create goal");
      } finally {
         setBusy(false);
      }
   }

   function startGoalEdit(g: Goal) {
      setEditingGoal(g.id);
      setEditGoalTitle(g.title);
      setEditGoalDescription(g.description ?? "");
      setEditGoalDate(g.target_date ?? "");
      setEditGoalStatus(g.status);
      clear();
   }

   async function handleSaveGoalEdit(e: FormEvent) {
      e.preventDefault();
      if (!editGoalTitle.trim()) return;
      setBusy(true);
      clear();
      try {
         await onEditGoal(editingGoal, editGoalTitle.trim(), editGoalDescription.trim() || null, editGoalDate || null, editGoalStatus);
         setEditingGoal("");
         setNotice("Goal updated.");
         await onRefresh();
      } catch (err) {
         setError(err instanceof Error ? err.message : "Unable to update goal");
      } finally {
         setBusy(false);
      }
   }

   const inviteLink =
      typeof window !== "undefined" && inviteShareReady
         ? `${window.location.origin}${window.location.pathname}?invite=${encodeURIComponent(inviteShareId)}`
         : "";

   const sidebarNav = (
      <nav aria-label="Workspace sections">
         {tabs.map((t) => (
            <button
               key={t.value}
               type="button"
               className={"navItem " + (tab === t.value ? "selected" : "")}
               onClick={() => {
                  setTab(t.value);
                  clear();
               }}
            >
               <span aria-hidden="true">{t.icon}</span>
               {t.label}
            </button>
         ))}
      </nav>
   );

   return (
      <DialogShell
         open={open}
         onOpenChange={onOpenChange}
         title={organizationName}
         subtitle={activeTabLabel}
         sidebar={sidebarNav}
         wide
      >
         {error && <p className="feedback bad">{error}</p>}
         {notice && <p className="feedback good">{notice}</p>}

         {tab === "overview" && (
            <div>
               <section className="card">
                  <div className="peopleIdentity" style={{ marginBottom: 18 }}>
                     <div className="mark">{organizationName.slice(0, 1).toUpperCase()}</div>
                     <div>
                        <strong style={{ fontSize: 18, display: "block" }}>{organizationName}</strong>
                        <small className="muted">
                           Created {new Date(createdAt).toLocaleDateString()} · Your role: {statusLabel(role ?? "member")}
                        </small>
                     </div>
                  </div>
                  <div className="stats" style={{ marginBottom: 16 }}>
                     <div className="stat">
                        <span>Members</span>
                        <strong>{members.length}</strong>
                     </div>
                     <div className="stat">
                        <span>Teams</span>
                        <strong>{teams.length}</strong>
                     </div>
                     <div className="stat">
                        <span>Projects</span>
                        <strong>{projects.length}</strong>
                     </div>
                     <div className="stat">
                        <span>Tasks</span>
                        <strong>{tasks.length}</strong>
                     </div>
                  </div>
                  <div className="taskInlineActions">
                     <button type="button" className="secondary" onClick={() => void onLeaveOrganization()}>
                        Leave workspace
                     </button>
                     {isAdmin && (
                        <button type="button" className="dangerAction" onClick={() => void onDeleteOrganization()}>
                           Delete workspace
                        </button>
                     )}
                  </div>
               </section>

               <section className="card">
                  <h2>Create another workspace</h2>
                  {organizationCount >= 2 ? (
                     <p className="muted">You belong to 2 of 2 allowed workspaces. Leave one before creating or joining another.</p>
                  ) : (
                     <>
                        <p className="muted">Start a separate Trackwise workspace for another organization or department.</p>
                        <form onSubmit={handleCreateOrg} className="inlineForm">
                           <input
                              aria-label="New workspace name"
                              value={newOrgName}
                              onChange={(e) => setNewOrgName(e.target.value)}
                              placeholder="New workspace name"
                              minLength={2}
                              maxLength={120}
                              required
                           />
                           <button className="primary" type="submit" disabled={busy || !newOrgName.trim()}>
                              Create workspace
                           </button>
                        </form>
                     </>
                  )}
               </section>
            </div>
         )}

         {tab === "planning" && (
            <div>
               <section className="card">
                  <div className="sectionHead">
                     <h2>
                        Organization goals <span className="count">{goals.length}</span>
                     </h2>
                  </div>
                  {goals.length ? (
                     goals.map((g) => (
                        <div className="goalRecord" key={g.id}>
                           <div className="taskLine">
                              <span className="taskDot underway" />
                              <div>
                                 <strong>{g.title}</strong>
                                 <small>
                                    {statusLabel(g.status)}
                                    {g.target_date ? " · Target " + new Date(g.target_date + "T12:00:00").toLocaleDateString() : ""}
                                 </small>
                                 {g.description && <p className="muted">{g.description}</p>}
                              </div>
                           </div>
                           {manager && (
                              <button type="button" className="textAction" onClick={() => startGoalEdit(g)}>
                                 Edit goal
                              </button>
                           )}
                           {manager && editingGoal === g.id && (
                              <form className="projectEditForm" onSubmit={handleSaveGoalEdit}>
                                 <div className="formGrid">
                                    <div>
                                       <label>Goal title</label>
                                       <input value={editGoalTitle} onChange={(e) => setEditGoalTitle(e.target.value)} required />
                                    </div>
                                    <div>
                                       <label>Target date</label>
                                       <input type="date" value={editGoalDate} onChange={(e) => setEditGoalDate(e.target.value)} />
                                    </div>
                                    <div className="span2">
                                       <label>Description</label>
                                       <textarea
                                          rows={2}
                                          value={editGoalDescription}
                                          onChange={(e) => setEditGoalDescription(e.target.value)}
                                       />
                                    </div>
                                    <div>
                                       <label>Status</label>
                                       <select value={editGoalStatus} onChange={(e) => setEditGoalStatus(e.target.value)}>
                                          <option value="active">Active</option>
                                          <option value="paused">Paused</option>
                                          <option value="achieved">Achieved</option>
                                       </select>
                                    </div>
                                    <div className="formAction">
                                       <button type="submit" className="primary" disabled={busy || !editGoalTitle.trim()}>
                                          Save goal
                                       </button>
                                       <button type="button" className="secondary" onClick={() => setEditingGoal("")}>
                                          Cancel
                                       </button>
                                    </div>
                                 </div>
                              </form>
                           )}
                        </div>
                     ))
                  ) : (
                     <p className="muted">Create a goal to define what success looks like.</p>
                  )}
                  {manager && (
                     <form onSubmit={handleCreateGoal} className="formGrid">
                        <div>
                           <label>New goal</label>
                           <input
                              value={goalTitle}
                              onChange={(e) => setGoalTitle(e.target.value)}
                              placeholder="e.g. Improve service response time"
                              required
                           />
                        </div>
                        <div>
                           <label>Target date</label>
                           <input type="date" value={goalTarget} onChange={(e) => setGoalTarget(e.target.value)} />
                        </div>
                        <div className="span2">
                           <label>Description (optional)</label>
                           <textarea
                              rows={2}
                              value={goalDescription}
                              onChange={(e) => setGoalDescription(e.target.value)}
                              placeholder="What will success look like?"
                           />
                        </div>
                        <div className="formAction span2">
                           <button type="submit" className="primary" disabled={busy || !goalTitle.trim()}>
                              Create goal
                           </button>
                        </div>
                     </form>
                  )}
               </section>

               <section className="card">
                  <div className="sectionHead">
                     <h2>
                        Projects <span className="count">{projects.length}</span>
                     </h2>
                  </div>
                  <button type="button" className="textAction" onClick={() => onOpenChange(false)}>
                     Open Projects to manage and create projects →
                  </button>
                  {projects.length ? (
                     projects.map((p) => (
                        <div className="taskLine" key={p.id}>
                           <span className="taskDot" />
                           <div>
                              <strong>{p.name}</strong>
                              <small>
                                 {statusLabel(p.status)} · {tasks.filter((t) => t.project_id === p.id).length} tasks
                              </small>
                           </div>
                        </div>
                     ))
                  ) : (
                     <p className="muted">Projects organize the work needed to reach goals.</p>
                  )}
               </section>
            </div>
         )}

         {tab === "members" && (
            <div>
               {manager && (
                  <section className="card">
                     <div className="sectionHead">
                        <h2>Invite a colleague</h2>
                        <button type="button" className="textAction" onClick={() => setTab("invitations")}>
                           Manage invitations ({pendingInvites.length}) →
                        </button>
                     </div>
                     <p className="muted">Choose a role, create an invitation, and share the generated link.</p>
                     <form onSubmit={handleInvite} className="formGrid">
                        <div>
                           <label htmlFor="wd-invite-email">Member email</label>
                           <input
                              id="wd-invite-email"
                              type="email"
                              value={inviteEmail}
                              onChange={(e) => setInviteEmail(e.target.value)}
                              placeholder="colleague@example.com"
                              required
                           />
                        </div>
                        <div>
                           <label htmlFor="wd-invite-role">Organization role</label>
                           <select id="wd-invite-role" value={inviteRole} onChange={(e) => setInviteRole(e.target.value)}>
                              <option value="member">Member</option>
                              <option value="leader">Leader</option>
                              <option value="stakeholder">Stakeholder</option>
                              <option value="observer">Observer</option>
                           </select>
                        </div>
                        <div className="formAction span2">
                           <button className="primary" type="submit" disabled={busy || !inviteEmail.trim()}>
                              Create invitation
                           </button>
                        </div>
                     </form>
                     {inviteShareReady && (
                        <div className="inviteShare">
                           <p>
                              Invitation ready for <strong>{inviteShareEmail}</strong>:
                           </p>
                           <input value={inviteLink} readOnly onFocus={(e) => e.target.select()} />
                           <div className="inviteActions">
                              <button
                                 type="button"
                                 className="primary"
                                 onClick={async () => {
                                    try {
                                       await navigator.clipboard.writeText(inviteLink);
                                       setNotice("Invitation link copied.");
                                    } catch {
                                       setError("Could not copy automatically. Select and copy the link above.");
                                    }
                                 }}
                              >
                                 Copy invitation link
                              </button>
                           </div>
                        </div>
                     )}
                  </section>
               )}

               <section className="card">
                  <div className="sectionHead">
                     <h2>Organization members</h2>
                     <span className="chip">{members.length}</span>
                  </div>
                  {directory.length ? (
                     directory.map((m) => (
                        <div key={m.user_id} className="memberManageRow">
                           <div className="peopleIdentity">
                              <span className="peopleAvatar">{m.display_name.slice(0, 1).toUpperCase()}</span>
                              <div>
                                 <strong>
                                    {m.display_name}
                                    {m.user_id === userId ? " (You)" : ""}
                                 </strong>
                                 <small>
                                    {statusLabel(m.role)} · {teamMembers.filter((tm) => tm.user_id === m.user_id).length} team(s)
                                 </small>
                              </div>
                           </div>
                           {isAdmin && m.user_id !== userId && (
                              <div className="memberManageActions">
                                 {roleEditing === m.user_id ? (
                                    <>
                                       <select
                                          value={roleChoice}
                                          onChange={(e) => setRoleChoice(e.target.value)}
                                          aria-label={`Role for ${m.display_name}`}
                                       >
                                          <option value="admin">Admin</option>
                                          <option value="leader">Leader</option>
                                          <option value="member">Member</option>
                                          <option value="stakeholder">Stakeholder</option>
                                          <option value="observer">Observer</option>
                                       </select>
                                       <button type="button" className="primary" onClick={() => void handleUpdateRole(m.user_id)}>
                                          Save
                                       </button>
                                       <button type="button" className="secondary" onClick={() => setRoleEditing("")}>
                                          Cancel
                                       </button>
                                    </>
                                 ) : (
                                    <>
                                       <button
                                          type="button"
                                          className="secondary"
                                          onClick={() => {
                                             setRoleEditing(m.user_id);
                                             setRoleChoice(m.role);
                                          }}
                                       >
                                          Change role
                                       </button>
                                       <button
                                          type="button"
                                          className="dangerAction"
                                          disabled={busy}
                                          onClick={() => void handleRemove(m.user_id, m.display_name)}
                                       >
                                          Remove
                                       </button>
                                    </>
                                 )}
                              </div>
                           )}
                        </div>
                     ))
                  ) : (
                     <p className="muted">No members found.</p>
                  )}
               </section>
            </div>
         )}

         {tab === "teams" && (
            <div>
               <section className="card">
                  <div className="sectionHead">
                     <h2>
                        Teams <span className="count">{teams.length}</span>
                     </h2>
                  </div>
                  {teams.length ? (
                     <div className="teamGrid">
                        {teams.map((t) => (
                           <div className="teamCard" key={t.id}>
                              <div className="teamSymbol">♙</div>
                              <h3>{t.name}</h3>
                              <p className="muted">{teamMembers.filter((tm) => tm.team_id === t.id).length} assigned members</p>
                              <div className="teamMemberList">
                                 {teamMembers
                                    .filter((tm) => tm.team_id === t.id)
                                    .map((tm) => {
                                       const member = directory.find((d) => d.user_id === tm.user_id);
                                       return (
                                          <div className="teamMemberRow" key={tm.user_id}>
                                             <span>
                                                <strong>{member?.display_name ?? "Member"}</strong>
                                                <small>{statusLabel(tm.role)}</small>
                                             </span>
                                             {manager && (
                                                <button
                                                   type="button"
                                                   className="textAction"
                                                   disabled={busy}
                                                   onClick={() =>
                                                      void onUnassignTeamMember(
                                                         t.id,
                                                         tm.user_id,
                                                         member?.display_name ?? "This member",
                                                      )
                                                   }
                                                >
                                                   Remove
                                                </button>
                                             )}
                                          </div>
                                       );
                                    })}
                              </div>
                           </div>
                        ))}
                     </div>
                  ) : (
                     <p className="muted">No teams yet. Create a team below and assign members to it.</p>
                  )}
               </section>

               {manager && (
                  <section className="card">
                     <h2>Create a team</h2>
                     <p className="muted">Enter a clear team name, then add people using Assign a team member below.</p>
                     <form onSubmit={handleCreateTeam} className="inlineForm">
                        <input
                           aria-label="Team name"
                           value={teamName}
                           onChange={(e) => setTeamName(e.target.value)}
                           placeholder="e.g. Operations team"
                           minLength={2}
                           maxLength={120}
                           required
                        />
                        <button className="primary" disabled={busy || !teamName.trim()}>
                           + Add team
                        </button>
                     </form>
                  </section>
               )}

               {manager && members.length > 0 && teams.length > 0 && (
                  <section className="card">
                     <h2>Assign a team member</h2>
                     <form onSubmit={handleAssignMember} className="formGrid">
                        <div>
                           <label htmlFor="wd-assign-team">Team</label>
                           <select id="wd-assign-team" required value={assignTeam} onChange={(e) => setAssignTeam(e.target.value)}>
                              <option value="">Choose a team</option>
                              {teams.map((t) => (
                                 <option key={t.id} value={t.id}>
                                    {t.name}
                                 </option>
                              ))}
                           </select>
                        </div>
                        <div>
                           <label htmlFor="wd-assign-user">Organization member</label>
                           <select id="wd-assign-user" required value={assignUser} onChange={(e) => setAssignUser(e.target.value)}>
                              <option value="">Choose a member</option>
                              {directory
                                 .filter((d) => canOwnTask(d.role))
                                 .map((m) => (
                                    <option key={m.user_id} value={m.user_id}>
                                       {m.user_id === userId ? "Me" : m.display_name} ({m.role})
                                    </option>
                                 ))}
                           </select>
                        </div>
                        <div>
                           <label htmlFor="wd-assign-role">Team role</label>
                           <select id="wd-assign-role" value={assignRole} onChange={(e) => setAssignRole(e.target.value)}>
                              <option value="member">Member</option>
                              <option value="leader">Leader</option>
                           </select>
                        </div>
                        <div className="formAction">
                           <button className="primary" disabled={busy || !assignTeam || !assignUser}>
                              Save assignment
                           </button>
                        </div>
                     </form>
                  </section>
               )}
            </div>
         )}

         {tab === "invitations" && manager && (
            <div>
               <section className="card">
                  <h2>Invite organization members</h2>
                  <p className="muted">
                     Choose a role, create an invitation, then copy its link. The invited person must sign in using the email you
                     enter.
                  </p>
                  <form onSubmit={handleInvite} className="formGrid">
                     <div>
                        <label htmlFor="wd-inv-email">Member email</label>
                        <input
                           id="wd-inv-email"
                           type="email"
                           required
                           value={inviteEmail}
                           onChange={(e) => setInviteEmail(e.target.value)}
                           placeholder="colleague@example.com"
                        />
                     </div>
                     <div>
                        <label htmlFor="wd-inv-role">Organization role</label>
                        <select id="wd-inv-role" value={inviteRole} onChange={(e) => setInviteRole(e.target.value)}>
                           <option value="member">Member</option>
                           <option value="leader">Leader</option>
                           <option value="observer">Observer</option>
                           <option value="stakeholder">Stakeholder</option>
                        </select>
                     </div>
                     <div className="formAction span2">
                        <button className="primary" type="submit" disabled={busy || !inviteEmail.trim()}>
                           Create invitation
                        </button>
                     </div>
                  </form>
                  {inviteShareReady && inviteShareId && (
                     <div className="inviteShare">
                        <p>
                           Invitation ready for <strong>{inviteShareEmail}</strong>. It expires in 14 days.
                        </p>
                        <input aria-label="Invitation link" readOnly value={inviteLink} onFocus={(e) => e.target.select()} />
                        <div className="inviteActions">
                           <button
                              className="primary"
                              type="button"
                              onClick={async () => {
                                 try {
                                    await navigator.clipboard.writeText(inviteLink);
                                    setNotice("Invitation link copied.");
                                 } catch {
                                    setError("Could not copy automatically. Select and copy the invitation link above.");
                                 }
                              }}
                           >
                              Copy invitation link
                           </button>
                        </div>
                     </div>
                  )}
               </section>

               <section className="card">
                  <div className="sectionHead">
                     <h2>Sent invitations</h2>
                     <span className="chip">{outgoingInvites.length}</span>
                  </div>
                  {outgoingInvites.length === 0 ? (
                     <p className="muted">No invitations sent yet.</p>
                  ) : (
                     outgoingInvites.map((inv) => {
                        const expired = new Date(inv.expires_at).getTime() < Date.now();
                        return (
                           <div className="memberManageRow" key={inv.id}>
                              <div>
                                 <strong>{inv.email}</strong>
                                 <small>
                                    {statusLabel(inv.role)} · {inv.accepted_at ? "Accepted" : expired ? "Expired" : "Pending"} ·
                                    Expires {new Date(inv.expires_at).toLocaleDateString()}
                                 </small>
                              </div>
                              <div className="memberManageActions">
                                 {!inv.accepted_at && !expired && (
                                    <>
                                       <button
                                          type="button"
                                          className="secondary"
                                          onClick={() => {
                                             setInviteShareEmail(inv.email);
                                             setInviteShareId(inv.id);
                                             setInviteShareReady(true);
                                             setNotice("Invitation link ready to share.");
                                          }}
                                       >
                                          Share link
                                       </button>
                                       <button
                                          type="button"
                                          className="dangerAction"
                                          disabled={busy}
                                          onClick={() => void handleRevoke(inv.id)}
                                       >
                                          Revoke
                                       </button>
                                    </>
                                 )}
                              </div>
                           </div>
                        );
                     })
                  )}
               </section>
            </div>
         )}

         {tab === "requests" && (
            <div>
               <section className="card">
                  <h2>Submit a request</h2>
                  <p className="muted">Ask a workspace leader to approve, defer, or reject a proposal.</p>
                  <form onSubmit={handleCreateRequest}>
                     <label htmlFor="wd-request-title">Request title</label>
                     <input
                        id="wd-request-title"
                        value={requestTitle}
                        onChange={(e) => setRequestTitle(e.target.value)}
                        placeholder="What do you need?"
                        required
                        minLength={2}
                        maxLength={180}
                     />
                     <label htmlFor="wd-request-details">Details</label>
                     <textarea
                        id="wd-request-details"
                        rows={3}
                        value={requestDetails}
                        onChange={(e) => setRequestDetails(e.target.value)}
                        placeholder="Provide context and expected outcome"
                        maxLength={4000}
                     />
                     <button className="primary" type="submit" style={{ marginTop: 14 }} disabled={busy || !requestTitle.trim()}>
                        Submit request
                     </button>
                  </form>
               </section>

               <section className="card">
                  <div className="sectionHead">
                     <h2>Request inbox</h2>
                     <span className="chip">{requests.length}</span>
                  </div>
                  {requests.length ? (
                     requests.map((r) => (
                        <div className="requestRow" key={r.id}>
                           <div>
                              <strong>{r.title}</strong>
                              <p className="muted">{r.details || "No additional details"}</p>
                              <span className="chip">{statusLabel(r.decision)}</span>{" "}
                              <small className="muted">
                                 · Submitted by {directory.find((m) => m.user_id === r.submitted_by)?.display_name ?? "Member"} ·{" "}
                                 {new Date(r.created_at).toLocaleDateString()}
                              </small>
                              {r.decision_reason && <p className="muted">Decision: {r.decision_reason}</p>}
                           </div>
                           {manager && (r.decision === "submitted" || r.decision === "deferred") && (
                              <div className="rowActions">
                                 {decidingRequest === r.id ? (
                                    <div className="inlineForm">
                                       <input
                                          aria-label="Decision reason"
                                          value={decisionReason}
                                          onChange={(e) => setDecisionReason(e.target.value)}
                                          placeholder="Reason for decision"
                                          required
                                       />
                                       <button
                                          className="primary"
                                          type="button"
                                          disabled={busy || !decisionReason.trim()}
                                          onClick={() => void handleDecide(r.id, "approved")}
                                       >
                                          Approve
                                       </button>
                                       <button
                                          type="button"
                                          className="secondary"
                                          disabled={busy || !decisionReason.trim()}
                                          onClick={() => void handleDecide(r.id, "deferred")}
                                       >
                                          Defer
                                       </button>
                                       <button
                                          type="button"
                                          className="dangerAction"
                                          disabled={busy || !decisionReason.trim()}
                                          onClick={() => void handleDecide(r.id, "rejected")}
                                       >
                                          Reject
                                       </button>
                                       <button type="button" className="secondary" onClick={() => setDecidingRequest("")}>
                                          Cancel
                                       </button>
                                    </div>
                                 ) : (
                                    <button type="button" onClick={() => setDecidingRequest(r.id)}>
                                       Review & decide
                                    </button>
                                 )}
                              </div>
                           )}
                        </div>
                     ))
                  ) : (
                     <p className="muted">No requests submitted yet.</p>
                  )}
               </section>
            </div>
         )}

         {tab === "activity" && (
            <section className="card">
               <div className="sectionHead">
                  <h2>Recent activity</h2>
                  <span className="chip">{activity.length}</span>
               </div>
               {activity.length ? (
                  activity.map((a) => (
                     <div className="taskLine" key={a.id}>
                        <span className="taskDot" />
                        <div>
                           <strong>
                              {statusLabel(a.entity_type.replace("tw_", ""))} · {statusLabel(a.action)}
                           </strong>
                           <small>{new Date(a.created_at).toLocaleString()}</small>
                        </div>
                     </div>
                  ))
               ) : (
                  <p className="muted">Activity will appear as your team starts working.</p>
               )}
            </section>
         )}

         {tab === "reports" && (
            <Reports
               tasks={tasks}
               projects={projects}
               teams={teams}
               directory={directory}
               organizationName={organizationName}
               organizationId={organizationId}
            />
         )}

         {tab === "backup" && isAdmin && (
            <WorkspaceBackup organizationId={organizationId} organizationName={organizationName} userId={userId} />
         )}
      </DialogShell>
   );
}
