"use client";

import { type FormEvent, useState } from "react";
import DialogShell from "./dialog-shell";

const statusLabel = (s: string) => s.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());

type User = { id: string; email?: string | undefined; user_metadata?: { display_name?: string } };
type PendingInvite = { id: string; email: string; role: string; organization_id: string; expires_at: string };

type UserDialogProps = {
   open: boolean;
   onOpenChange: (open: boolean) => void;
   user: User | null;
   role: string | null | undefined;
   pendingInvites: PendingInvite[];
   profileName: string;
   onProfileNameChange: (value: string) => void;
   onSaveProfile: (name: string) => Promise<void>;
   onChangePassword: (password: string) => Promise<void>;
   onAcceptInvite: (id: string) => Promise<void>;
   onSignOut: () => Promise<void>;
};

type Tab = "profile" | "invitations";

export default function UserDialog({
   open,
   onOpenChange,
   user,
   role,
   pendingInvites,
   profileName,
   onProfileNameChange,
   onSaveProfile,
   onChangePassword,
   onAcceptInvite,
   onSignOut,
}: UserDialogProps) {
   const [tab, setTab] = useState<Tab>("profile");
   const [newPassword, setNewPassword] = useState("");
   const [busy, setBusy] = useState(false);
   const [error, setError] = useState("");
   const [notice, setNotice] = useState("");

   const clear = () => {
      setError("");
      setNotice("");
   };

   async function handleSaveProfile(e: FormEvent) {
      e.preventDefault();
      if (!profileName.trim() || profileName.trim().length < 2) {
         setError("Display name must be between 2 and 80 characters.");
         return;
      }
      setBusy(true);
      clear();
      try {
         await onSaveProfile(profileName.trim());
         setNotice("Profile updated.");
      } catch (e) {
         setError(e instanceof Error ? e.message : "Unable to update profile");
      } finally {
         setBusy(false);
      }
   }

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

   return (
      <DialogShell open={open} onOpenChange={onOpenChange} title="Account">
         <div className="dialogTabs" role="tablist" aria-label="Account sections">
            <button type="button" role="tab" aria-selected={tab === "profile"} className={tab === "profile" ? "active" : ""} onClick={() => setTab("profile")}>
               Profile
            </button>
            <button type="button" role="tab" aria-selected={tab === "invitations"} className={tab === "invitations" ? "active" : ""} onClick={() => setTab("invitations")}>
               Invitations ({pendingInvites.length})
            </button>
         </div>

         {error && <p className="feedback bad">{error}</p>}
         {notice && <p className="feedback good">{notice}</p>}

         {tab === "profile" && (
            <div className="space-y-5">
               <div className="peopleIdentity">
                  <span className="peopleAvatar">{(user?.email ?? "U").slice(0, 1).toUpperCase()}</span>
                  <div>
                     <strong>{user?.email?.split("@")[0] ?? "Account"}</strong>
                     <small>{user?.email ?? ""}</small>
                     <small>{role ? statusLabel(role) : "Signed in"}</small>
                  </div>
               </div>

               <form onSubmit={handleSaveProfile} className="formGrid">
                  <div className="span2">
                     <label htmlFor="ud-display-name">Display name</label>
                     <input
                        id="ud-display-name"
                        value={profileName}
                        onChange={(e) => onProfileNameChange(e.target.value)}
                        minLength={2}
                        maxLength={80}
                        required
                     />
                  </div>
                  <div className="span2">
                     <button className="primary" type="submit" disabled={busy}>
                        Save display name
                     </button>
                  </div>
               </form>

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
                     />
                  </div>
                  <div className="span2">
                     <button className="primary" type="submit" disabled={busy || newPassword.length < 10}>
                        Update password
                     </button>
                  </div>
               </form>

               <div className="taskInlineActions">
                  <button type="button" onClick={() => void onSignOut()}>
                     Sign out
                  </button>
               </div>
            </div>
         )}

         {tab === "invitations" && (
            <section className="card">
               <div className="sectionHead">
                  <h2>Invitations for you</h2>
                  <span className="chip">{pendingInvites.length}</span>
               </div>
               {pendingInvites.length ? (
                  pendingInvites.map((i) => (
                     <div className="reportRow" key={i.id}>
                        <span>
                           Invitation to join as {statusLabel(i.role)} · {i.email}
                        </span>
                        <button type="button" className="primary" disabled={busy} onClick={() => void handleAccept(i.id)}>
                           Accept
                        </button>
                     </div>
                  ))
               ) : (
                  <p className="muted">You have no pending invitations.</p>
               )}
            </section>
         )}
      </DialogShell>
   );
}
