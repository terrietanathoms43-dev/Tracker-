"use client";

import { type FormEvent, useMemo, useState } from "react";
import DialogShell from "./dialog-shell";
import Reports from "../reports";
import { canManageOrganization, canOwnTask } from "../../lib/task-rules";

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

type WorkspaceDialogProps = {
   open: boolean;
   onOpenChange: (open: boolean) => void;
   organizationId: string;
   organizationName: string;
   userId: string;
   role: string | null | undefined;
   directory: DirectoryMember[];
   members: Member[];
   teams: Team[];
   teamMembers: TeamMember[];
   tasks: Task[];
   projects: Project[];
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
   onLeaveOrganization: () => Promise<void>;
   onCreateOrganization: (name: string) => Promise<string | undefined>;
   onCreateRequest: (title: string, details: string) => Promise<void>;
   onDecideRequest: (id: string, decision: string, reason: string) => Promise<void>;
};

type Tab = "overview" | "members" | "teams" | "requests" | "activity" | "reports";

export default function WorkspaceDialog({
   open,
   onOpenChange,
   organizationId,
   organizationName,
   userId,
   role,
   directory,
   members,
   teams,
   teamMembers,
   tasks,
   projects,
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
}: WorkspaceDialogProps) {
   const [tab, setTab] = useState<Tab>("overview");
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
   const [busy, setBusy] = useState(false);
   const [error, setError] = useState("");
   const [notice, setNotice] = useState("");
   const [inviteShareId, setInviteShareId] = useState("");
   const [inviteShareEmail, setInviteShareEmail] = useState("");
   const [inviteShareReady, setInviteShareReady] = useState(false);

   const manager = canManageOrganization(role);
   const isAdmin = role === "admin";

   const clear = () => {
      setError("");
      setNotice("");
   };

   const tabs = useMemo(
      () => [
         { value: "overview" as Tab, label: "Overview" },
         { value: "members" as Tab, label: `Members (${members.length})` },
         { value: "teams" as Tab, label: `Teams (${teams.length})` },
         { value: "requests" as Tab, label: `Requests (${requests.length})` },
         { value: "activity" as Tab, label: "Activity" },
         { value: "reports" as Tab, label: "Reports" },
      ],
      [members.length, teams.length, requests.length],
   );

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

   async function handleDecide(e: FormEvent) {
      e.preventDefault();
      if (!decidingRequest || !decisionReason.trim()) return;
      setBusy(true);
      clear();
      try {
         await onDecideRequest(decidingRequest, "approved", decisionReason.trim());
         setDecidingRequest("");
         setDecisionReason("");
         setNotice("Request approved.");
         await onRefresh();
      } catch (err) {
         setError(err instanceof Error ? err.message : "Unable to decide request");
      } finally {
         setBusy(false);
      }
   }

   const inviteLink =
      typeof window !== "undefined" && inviteShareReady
         ? `${window.location.origin}${window.location.pathname}?invite=${inviteShareId}`
         : "";

   const pendingInvites = outgoingInvites.filter((i) => !i.accepted_at && new Date(i.expires_at) > new Date());

   return (
      <DialogShell open={open} onOpenChange={onOpenChange} title="Workspace">
         <div className="dialogTabs" role="tablist" aria-label="Workspace sections">
            {tabs.map((t) => (
               <button
                  key={t.value}
                  type="button"
                  role="tab"
                  aria-selected={tab === t.value}
                  className={tab === t.value ? "active" : ""}
                  onClick={() => setTab(t.value)}
               >
                  {t.label}
               </button>
            ))}
         </div>

         {error && <p className="feedback bad">{error}</p>}
         {notice && <p className="feedback good">{notice}</p>}

         {tab === "overview" && (
            <div className="space-y-5">
               <div className="flex items-center gap-3">
                  <div className="mark">W</div>
                  <div>
                     <p className="font-semibold text-lg">{organizationName}</p>
                     <p className="muted text-xs">Created {new Date(createdAt).toLocaleDateString()}</p>
                  </div>
               </div>
               <div className="reportStats">
                  <div className="card reportMetric">
                     <span>Members</span>
                     <strong>{members.length}</strong>
                  </div>
                  <div className="card reportMetric">
                     <span>Teams</span>
                     <strong>{teams.length}</strong>
                  </div>
                  <div className="card reportMetric">
                     <span>Tasks</span>
                     <strong>{tasks.length}</strong>
                  </div>
                  <div className="card reportMetric">
                     <span>Projects</span>
                     <strong>{projects.length}</strong>
                  </div>
               </div>
               <p>
                  Your role: <strong>{statusLabel(role ?? "member")}</strong>
               </p>
               <div className="taskInlineActions">
                  <button type="button" onClick={() => void onLeaveOrganization()}>
                     Leave workspace
                  </button>
                  {isAdmin && (
                     <button type="button" className="dangerAction" onClick={() => void onDeleteOrganization()}>
                        Delete workspace
                     </button>
                  )}
               </div>

               <section className="card">
                  <h2>Create another workspace</h2>
                  <p className="muted">You can belong to multiple Trackwise workspaces.</p>
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
               </section>
            </div>
         )}

         {tab === "members" && (
            <div className="space-y-5">
               {isAdmin && (
                  <form onSubmit={handleInvite} className="formGrid">
                     <div className="span2">
                        <label htmlFor="wd-invite-email">Invite by email</label>
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
                        <label htmlFor="wd-invite-role">Role</label>
                        <select id="wd-invite-role" value={inviteRole} onChange={(e) => setInviteRole(e.target.value)}>
                           <option value="member">Member</option>
                           <option value="leader">Leader</option>
                           <option value="stakeholder">Stakeholder</option>
                           <option value="observer">Observer</option>
                        </select>
                     </div>
                     <div className="formAction">
                        <button className="primary" type="submit" disabled={busy || !inviteEmail.trim()}>
                           Send invitation
                        </button>
                     </div>
                     {inviteShareReady && (
                        <div className="inviteShare span2">
                           <p>Share this invitation link with {inviteShareEmail}:</p>
                           <input value={inviteLink} readOnly onFocus={(e) => e.target.select()} />
                           <p className="muted">The link will stop working if you revoke the invitation.</p>
                        </div>
                     )}
                  </form>
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
                                          <option value="member">Member</option>
                                          <option value="leader">Leader</option>
                                          <option value="stakeholder">Stakeholder</option>
                                          <option value="observer">Observer</option>
                                       </select>
                                       <button type="button" className="primary" onClick={() => void handleUpdateRole(m.user_id)}>
                                          Save
                                       </button>
                                       <button type="button" onClick={() => setRoleEditing("")}>
                                          Cancel
                                       </button>
                                    </>
                                 ) : (
                                    <>
                                       <button
                                          type="button"
                                          className="textAction"
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

               {isAdmin && pendingInvites.length > 0 && (
                  <section className="card">
                     <div className="sectionHead">
                        <h2>Pending invitations</h2>
                        <span className="chip">{pendingInvites.length}</span>
                     </div>
                     {pendingInvites.map((i) => (
                        <div className="reportRow" key={i.id}>
                           <span>
                              {i.email} · {statusLabel(i.role)}
                           </span>
                           <button type="button" className="textAction" disabled={busy} onClick={() => void handleRevoke(i.id)}>
                              Revoke
                           </button>
                        </div>
                     ))}
                  </section>
               )}
            </div>
         )}

         {tab === "teams" && (
            <div className="space-y-5">
               <section className="card">
                  <div className="sectionHead">
                     <h2>Teams</h2>
                     <span className="chip">{teams.length}</span>
                  </div>
                  {teams.length ? (
                     teams.map((t) => (
                        <div className="budgetItem" key={t.id}>
                           <div className="reportRow">
                              <span>{t.name}</span>
                              <strong>{teamMembers.filter((tm) => tm.team_id === t.id).length} member(s)</strong>
                           </div>
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
                                                   void onUnassignTeamMember(t.id, tm.user_id, member?.display_name ?? "This member")
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
                     ))
                  ) : (
                     <p className="muted">No teams yet.</p>
                  )}
               </section>

               {manager && (
                  <section className="card">
                     <h2>Create a team</h2>
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

         {tab === "requests" && (
            <div className="space-y-5">
               {!manager && (
                  <section className="card">
                     <h2>Submit a request</h2>
                     <p className="muted">Ask a workspace leader to approve, defer, or reject a proposal.</p>
                     <form onSubmit={handleCreateRequest} className="formGrid">
                        <div className="span2">
                           <label htmlFor="wd-request-title">Title</label>
                           <input
                              id="wd-request-title"
                              value={requestTitle}
                              onChange={(e) => setRequestTitle(e.target.value)}
                              placeholder="What are you requesting?"
                              required
                              minLength={2}
                              maxLength={180}
                           />
                        </div>
                        <div className="span2">
                           <label htmlFor="wd-request-details">Details</label>
                           <textarea
                              id="wd-request-details"
                              rows={3}
                              value={requestDetails}
                              onChange={(e) => setRequestDetails(e.target.value)}
                              placeholder="Add context so leaders can decide."
                              maxLength={4000}
                           />
                        </div>
                        <div className="span2">
                           <button className="primary" type="submit" disabled={busy || !requestTitle.trim()}>
                              Submit request
                           </button>
                        </div>
                     </form>
                  </section>
               )}

               <section className="card">
                  <div className="sectionHead">
                     <h2>{manager ? "Requests & approvals" : "Your requests"}</h2>
                     <span className="chip">{requests.length}</span>
                  </div>
                  {requests.length ? (
                     requests.map((r) => (
                        <div className="reportRow" key={r.id}>
                           <div>
                              <strong>{r.title}</strong>
                              <p className="muted">{r.details || "No details"}</p>
                              <small>
                                 {statusLabel(r.decision)} · Submitted by{" "}
                                 {directory.find((m) => m.user_id === r.submitted_by)?.display_name ?? "Member"} ·{" "}
                                 {new Date(r.created_at).toLocaleDateString()}
                              </small>
                              {r.decision_reason && <small className="muted">Reason: {r.decision_reason}</small>}
                           </div>
                           {manager && (r.decision === "submitted" || r.decision === "deferred") && (
                              <div className="requestActions">
                                 {decidingRequest === r.id ? (
                                    <form onSubmit={handleDecide} className="inlineForm">
                                       <input
                                          aria-label="Decision reason"
                                          value={decisionReason}
                                          onChange={(e) => setDecisionReason(e.target.value)}
                                          placeholder="Reason for decision"
                                          required
                                       />
                                       <button className="primary" type="submit" disabled={busy || !decisionReason.trim()}>
                                          Approve
                                       </button>
                                       <button
                                          type="button"
                                          disabled={busy}
                                          onClick={() => void onDecideRequest(r.id, "rejected", decisionReason.trim() || "Rejected")}
                                       >
                                          Reject
                                       </button>
                                       <button type="button" onClick={() => setDecidingRequest("")}>
                                          Cancel
                                       </button>
                                    </form>
                                 ) : (
                                    <button type="button" className="textAction" onClick={() => setDecidingRequest(r.id)}>
                                       Decide
                                    </button>
                                 )}
                              </div>
                           )}
                        </div>
                     ))
                  ) : (
                     <p className="muted">No requests yet.</p>
                  )}
               </section>
            </div>
         )}

         {tab === "activity" && (
            <section className="card">
               <div className="sectionHead">
                  <h2>Workspace activity</h2>
                  <span className="chip">{activity.length}</span>
               </div>
               {activity.length ? (
                  activity.map((a) => (
                     <div className="reportRow" key={a.id}>
                        <span>
                           {statusLabel(a.entity_type)} · {statusLabel(a.action)}
                        </span>
                        <strong>{new Date(a.created_at).toLocaleString()}</strong>
                     </div>
                  ))
               ) : (
                  <p className="muted">No activity recorded yet.</p>
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
      </DialogShell>
   );
}
