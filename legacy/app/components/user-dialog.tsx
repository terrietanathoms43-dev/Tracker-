"use client";

import dynamic from "next/dynamic";
import { type FormEvent, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import DialogShell from "./dialog-shell";

const AccountProfile = dynamic(() => import("../account-profile"), { ssr: false, loading: () => null });

const statusLabel = (s: string) => s.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
type PendingInvite = { id: string; email: string; role: string; organization_id: string; expires_at: string };
type Org = { id: string; name: string; created_at: string };

type Tab = "profile" | "security" | "invitations" | "workspaces";

type UserDialogProps = {
   open: boolean;
   onOpenChange: (open: boolean) => void;
   initialTab?: Tab;
   user: User | null;
   role: string | null | undefined;
   pendingInvites: PendingInvite[];
   orgs: Org[];
   selectedOrg: string;
   onSelectOrg: (id: string) => void;
   profileName: string;
   organizationName: string;
   assignedTasks: number;
   projectsCount: number;
   photoUrl: string | null;
   onUserRefresh: () => Promise<void>;
   onChangePassword: (password: string) => Promise<void>;
   onAcceptInvite: (id: string) => Promise<void>;
   onCreateOrganization: (name: string) => Promise<string | undefined>;
   onLeaveOrganization: (orgId: string) => Promise<boolean>;
   onSignOut: () => void;
};

export default function UserDialog({
   open,
   onOpenChange,
   initialTab = "profile",
   user,
   role,
   pendingInvites,
   orgs,
   selectedOrg,
   onSelectOrg,
   profileName,
   organizationName,
   assignedTasks,
   projectsCount,
   photoUrl,
   onUserRefresh,
   onChangePassword,
   onAcceptInvite,
   onCreateOrganization,
   onLeaveOrganization,
   onSignOut,
}: UserDialogProps) {
   const [tab, setTab] = useState<Tab>(initialTab);
   const atWorkspaceLimit = orgs.length >= 2;
   const [newPassword, setNewPassword] = useState("");
   const [newOrgName, setNewOrgName] = useState("");
   const [busy, setBusy] = useState(false);
   const [error, setError] = useState("");
   const [notice, setNotice] = useState("");

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

   async function handleChangePassword(e: FormEvent) {
      e.preventDefault();
      if (newPassword.length < 10) {
         setError("Use at least 10 characters.");
         return;
      }
      setBusy(true);
      clear();
      try {
         await onChangePassword(newPassword);
         setNewPassword("");
         setNotice("Password updated successfully.");
      } catch (e) {
         setError(e instanceof Error ? e.message : "Unable to update password");
      } finally {
         setBusy(false);
      }
   }

   async function handleAccept(id: string) {
      setBusy(true);
      clear();
      try {
         await onAcceptInvite(id);
         setNotice("Invitation accepted.");
      } catch (e) {
         setError(e instanceof Error ? e.message : "Unable to accept invitation");
      } finally {
         setBusy(false);
      }
   }

   async function handleLeaveOrg(orgId: string) {
      setBusy(true);
      clear();
      try {
         const left = await onLeaveOrganization(orgId);
         if (left) setNotice("You left the workspace.");
      } catch (e) {
         setError(e instanceof Error ? e.message : "Unable to leave workspace");
      } finally {
         setBusy(false);
      }
   }

   async function handleCreateOrg(e: FormEvent) {
      e.preventDefault();
      if (!newOrgName.trim()) return;
      setBusy(true);
      clear();
      try {
         const id = await onCreateOrganization(newOrgName.trim());
         if (id) {
            setNewOrgName("");
            setNotice("Workspace created.");
            onSelectOrg(id);
         }
      } catch (e) {
         setError(e instanceof Error ? e.message : "Unable to create workspace");
      } finally {
         setBusy(false);
      }
   }

   const tabs: { value: Tab; label: string; icon: string }[] = [
      { value: "profile", label: "My profile", icon: "♙" },
      { value: "security", label: "Password & security", icon: "🔒" },
      { value: "invitations", label: `Invitations (${pendingInvites.length})`, icon: "✉" },
      { value: "workspaces", label: `Workspaces (${orgs.length})`, icon: "🏢" },
   ];

   const activeTabLabel = tabs.find((t) => t.value === tab)?.label ?? "Account";

   const sidebarNav = (
      <nav aria-label="Account sections">
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

   const activeOrgName = orgs.find((o) => o.id === selectedOrg)?.name ?? "Workspace";

   return (
      <DialogShell
         open={open}
         onOpenChange={onOpenChange}
         title={profileName.trim() || user?.email?.split("@")[0] || "Account"}
         subtitle={activeTabLabel}
         sidebar={sidebarNav}
         wide
      >
         {error && <p className="feedback bad">{error}</p>}
         {notice && <p className="feedback good">{notice}</p>}

         {tab === "profile" && (
            <div>
               {user && (
                  <AccountProfile
                     user={user}
                     role={role ?? null}
                     organizationName={organizationName}
                     organizationCount={orgs.length}
                     assignedTasks={assignedTasks}
                     projectsCount={projectsCount}
                     photoUrl={photoUrl}
                     onUpdated={onUserRefresh}
                  />
               )}

               <section className="card">
                  <h2>Your organization role</h2>
                  <p className="muted">
                     Your role belongs to the active workspace, not your login account. The person who creates a workspace becomes its
                     administrator.
                  </p>
                  <p className="readOnlyValue">
                     <strong>{role ? statusLabel(role) : "No organization role assigned"}</strong> · {activeOrgName}
                  </p>
               </section>

               <section className="card">
                  <div className="sectionHead">
                     <div>
                        <h2>Session</h2>
                        <p className="muted" style={{ margin: 0 }}>
                           Signed in as {user?.email}
                        </p>
                     </div>
                     <button type="button" className="dangerAction" onClick={() => void onSignOut()}>
                        Sign out ↪
                     </button>
                  </div>
               </section>
            </div>
         )}

         {tab === "security" && (
            <section className="card">
               <h2>Change password</h2>
               <p className="muted">Use at least 10 characters and a unique passphrase to keep your Trackwise account secure.</p>
               <form onSubmit={handleChangePassword} className="formGrid">
                  <div className="span2">
                     <label htmlFor="ud-new-password">New password</label>
                     <input
                        id="ud-new-password"
                        type="password"
                        autoComplete="new-password"
                        minLength={10}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="At least 10 characters"
                        required
                     />
                  </div>
                  <div className="formAction span2">
                     <button className="primary" type="submit" disabled={busy || newPassword.length < 10}>
                        {busy ? "Updating…" : "Update password"}
                     </button>
                  </div>
               </form>
            </section>
         )}

         {tab === "invitations" && (
            <section className="card">
               <div className="sectionHead">
                  <h2>Invitations for you</h2>
                  <span className="chip">{pendingInvites.length}</span>
               </div>
               <p className="muted">Invitations sent to {user?.email} appear here before they expire.</p>
               {atWorkspaceLimit && (
                  <p className="muted">You belong to 2 of 2 allowed workspaces. Leave one before joining another.</p>
               )}
               {pendingInvites.length ? (
                  pendingInvites.map((i) => (
                     <div className="reportRow" key={i.id}>
                        <span>
                           Invitation to join as <strong>{statusLabel(i.role)}</strong> · {i.email}
                        </span>
                        <button
                           type="button"
                           className="primary"
                           disabled={busy || atWorkspaceLimit}
                           title={atWorkspaceLimit ? "Leave a workspace before accepting" : "Accept invitation"}
                           onClick={() => void handleAccept(i.id)}
                        >
                           Accept invitation
                        </button>
                     </div>
                  ))
               ) : (
                  <p className="muted">You have no pending invitations.</p>
               )}
            </section>
         )}

         {tab === "workspaces" && (
            <div>
               <section className="card">
                  <div className="sectionHead">
                     <h2>Your workspaces</h2>
                     <span className="chip">{orgs.length}</span>
                  </div>
                  {orgs.length ? (
                     orgs.map((o) => (
                        <div className="memberManageRow" key={o.id}>
                           <div>
                              <strong>{o.name}</strong>
                              <small>
                                 Created {new Date(o.created_at).toLocaleDateString()}
                                 {o.id === selectedOrg ? " · Active workspace" : ""}
                              </small>
                           </div>
                           <div className="memberManageActions">
                              {o.id !== selectedOrg ? (
                                 <button
                                    type="button"
                                    className="secondary"
                                    onClick={() => {
                                       onSelectOrg(o.id);
                                       onOpenChange(false);
                                    }}
                                 >
                                    Switch workspace
                                 </button>
                              ) : (
                                 <span className="chip">Current</span>
                              )}
                              <button
                                 type="button"
                                 className="dangerAction"
                                 disabled={busy}
                                 title={`Leave ${o.name}`}
                                 onClick={() => void handleLeaveOrg(o.id)}
                              >
                                 Leave
                              </button>
                           </div>
                        </div>
                     ))
                  ) : (
                     <p className="muted">You are not in any workspaces yet.</p>
                  )}
               </section>

               <section className="card">
                  <h2>Create a workspace</h2>
                  {atWorkspaceLimit ? (
                     <p className="muted">You belong to 2 of 2 allowed workspaces. Leave one before creating or joining another.</p>
                  ) : (
                     <>
                        <p className="muted">Start a new Trackwise workspace for another team or organization.</p>
                        <form onSubmit={handleCreateOrg} className="inlineForm">
                           <input
                              aria-label="New workspace name"
                              value={newOrgName}
                              onChange={(e) => setNewOrgName(e.target.value)}
                              placeholder="Workspace name"
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
      </DialogShell>
   );
}
