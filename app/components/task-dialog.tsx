"use client";

import { type FormEvent, useEffect, useState } from "react";
import DialogShell from "./dialog-shell";
import { canManageOrganization } from "../../lib/task-rules";

const statusLabel = (s: string) => s.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());

type Task = {
   id: string;
   title: string;
   description: string | null;
   status: string;
   priority: string;
   due_at: string | null;
   owner_id: string | null;
   project_id: string | null;
   assignees?: { user_id: string }[];
};
type DirectoryMember = { user_id: string; display_name: string; role: string };
type Project = { id: string; name: string };
type TaskValues = {
   title: string;
   description: string | null;
   priority: string;
   due_at: string | null;
   project_id: string | null;
   assigneeIds: string[];
   frequency: string;
};

type TaskDialogProps = {
   open: boolean;
   onOpenChange: (open: boolean) => void;
   task: Task | null;
   organizationId: string;
   userId: string;
   role: string | null | undefined;
   directory: DirectoryMember[];
   projects: Project[];
   onSave: (values: TaskValues) => Promise<void>;
   onDelete?: () => Promise<void>;
};

const emptyValues = (): TaskValues => ({
   title: "",
   description: "",
   priority: "normal",
   due_at: null,
   project_id: null,
   assigneeIds: [],
   frequency: "none",
});

export default function TaskDialog({
   open,
   onOpenChange,
   task,
   userId,
   role,
   directory,
   projects,
   onSave,
   onDelete,
}: TaskDialogProps) {
   const [values, setValues] = useState<TaskValues>(emptyValues());
   const [busy, setBusy] = useState(false);
   const [error, setError] = useState("");
   const [notice, setNotice] = useState("");

   const manager = canManageOrganization(role);
   const isCreate = !task;
   const canEdit = isCreate ? manager : manager || task?.owner_id === userId || (values.assigneeIds ?? []).includes(userId);

   useEffect(() => {
      if (!open) return;
      if (task) {
         const assigneeIds = task.assignees?.map((a) => a.user_id) ?? (task.owner_id ? [task.owner_id] : []);
         setValues({
            title: task.title,
            description: task.description ?? "",
            priority: task.priority,
            due_at: task.due_at ? task.due_at.slice(0, 10) : "",
            project_id: task.project_id ?? "",
            assigneeIds,
            frequency: "none",
         });
      } else {
         setValues(emptyValues());
      }
      setError("");
      setNotice("");
   }, [open, task]);

   function toggleAssignee(id: string) {
      setValues((v) => ({
         ...v,
         assigneeIds: v.assigneeIds.includes(id) ? v.assigneeIds.filter((x) => x !== id) : [...v.assigneeIds, id],
      }));
   }

   async function handleSubmit(e: FormEvent) {
      e.preventDefault();
      if (!values.title.trim() || values.title.trim().length < 2) {
         setError("Enter a task title with at least two characters.");
         return;
      }
      if (isCreate && values.frequency !== "none" && !values.due_at) {
         setError("Choose a first due date for a repeating task.");
         return;
      }
      setBusy(true);
      setError("");
      setNotice("");
      try {
         await onSave({
            ...values,
            title: values.title.trim(),
            description: values.description?.trim() || null,
            due_at: values.due_at ? new Date(values.due_at + "T23:59:00").toISOString() : null,
            project_id: values.project_id || null,
         });
         setNotice(isCreate ? "Task saved." : "Task updated.");
         if (isCreate) setValues(emptyValues());
      } catch (e) {
         setError(e instanceof Error ? e.message : "Unable to save task.");
      } finally {
         setBusy(false);
      }
   }

   const title = isCreate ? "New task" : "Edit task";

   return (
      <DialogShell
         open={open}
         onOpenChange={onOpenChange}
         title={title}
         footer={
            <>
               {!isCreate && onDelete && (
                  <button type="button" className="dangerAction" disabled={busy} onClick={() => void onDelete()}>
                     Delete
                  </button>
               )}
               <button type="button" onClick={() => onOpenChange(false)} disabled={busy}>
                  Cancel
               </button>
               <button type="submit" form="task-dialog-form" className="primary" disabled={busy || !canEdit}>
                  {busy ? "Saving…" : isCreate ? "Create task" : "Save changes"}
               </button>
            </>
         }
      >
         {error && <p className="feedback bad">{error}</p>}
         {notice && <p className="feedback good">{notice}</p>}

         <form id="task-dialog-form" onSubmit={handleSubmit} className="formGrid">
            <div className="span2">
               <label htmlFor="td-title">Task title</label>
               <input
                  id="td-title"
                  value={values.title}
                  onChange={(e) => setValues((v) => ({ ...v, title: e.target.value }))}
                  minLength={2}
                  maxLength={180}
                  required
                  disabled={!canEdit}
               />
            </div>
            <div className="span2">
               <label htmlFor="td-description">Description</label>
               <textarea
                  id="td-description"
                  rows={3}
                  maxLength={4000}
                  value={values.description ?? ""}
                  onChange={(e) => setValues((v) => ({ ...v, description: e.target.value }))}
                  disabled={!canEdit}
               />
            </div>
            <div>
               <label htmlFor="td-priority">Priority</label>
               <select
                  id="td-priority"
                  value={values.priority}
                  onChange={(e) => setValues((v) => ({ ...v, priority: e.target.value }))}
                  disabled={!canEdit}
               >
                  <option value="low">Low</option>
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
               </select>
            </div>
            <div>
               <label htmlFor="td-due">Due date</label>
               <input
                  id="td-due"
                  type="date"
                  value={values.due_at ?? ""}
                  onChange={(e) => setValues((v) => ({ ...v, due_at: e.target.value || null }))}
                  disabled={!canEdit}
               />
            </div>
            <div>
               <label htmlFor="td-project">Project</label>
               <select
                  id="td-project"
                  value={values.project_id ?? ""}
                  onChange={(e) => setValues((v) => ({ ...v, project_id: e.target.value || null }))}
                  disabled={!canEdit}
               >
                  <option value="">No project</option>
                  {projects.map((p) => (
                     <option key={p.id} value={p.id}>
                        {p.name}
                     </option>
                  ))}
               </select>
            </div>

            {isCreate && (
               <div>
                  <label htmlFor="td-frequency">Repeat</label>
                  <select
                     id="td-frequency"
                     value={values.frequency}
                     onChange={(e) => setValues((v) => ({ ...v, frequency: e.target.value }))}
                     disabled={!canEdit}
                  >
                     <option value="none">No repeat</option>
                     <option value="daily">Daily</option>
                     <option value="weekly">Weekly</option>
                     <option value="monthly">Monthly</option>
                  </select>
               </div>
            )}

            <div className="span2">
               <label>Assignees</label>
               <p className="muted">Select everyone who should be responsible for this task.</p>
               <div className="checklistRows">
                  {directory
                     .filter((m) => ["admin", "leader", "member"].includes(m.role))
                     .map((m) => (
                        <label key={m.user_id} className="checklistRow">
                           <input
                              type="checkbox"
                              checked={values.assigneeIds.includes(m.user_id)}
                              onChange={() => toggleAssignee(m.user_id)}
                              disabled={!canEdit}
                           />
                           <span>{m.display_name}</span>
                        </label>
                     ))}
               </div>
            </div>
         </form>
      </DialogShell>
   );
}
