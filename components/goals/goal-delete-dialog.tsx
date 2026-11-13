"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { deleteGoal } from "@/actions/goals";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

// Delete a goal (docs/PLAN.md, 2026-11-04 log): a quiet button in the goal page's actions, a dialog that says
// exactly what happens to what sits under it, then the project page. Leaders and admins only; the page decides.

export function GoalDeleteDialog({ goal }: { goal: { id: string; title: string; projectId: string; projectName: string; tasks: number; subGoals: number } }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [withSubGoals, setWithSubGoals] = useState(false);
  const confirm = () =>
    startTransition(async () => {
      const result = await deleteGoal({ goalId: goal.id, deleteSubGoals: withSubGoals });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setOpen(false);
      toast.success(result.message ?? "Goal deleted.");
      router.push(`/projects/${result.data.projectId}`);
    });
  const consequences = [
    goal.tasks > 0 ? `${goal.tasks} ${goal.tasks === 1 ? "task stays" : "tasks stay"} in ${goal.projectName}, without a goal. Their history keeps a line saying why.` : "No other task is linked to it directly.",
    "Its “Everything completed” task goes with it.",
    goal.subGoals > 0
      ? withSubGoals
        ? `${goal.subGoals} ${goal.subGoals === 1 ? "sub-goal is" : "sub-goals are"} deleted too; their tasks stay in ${goal.projectName} the same way.`
        : `${goal.subGoals} ${goal.subGoals === 1 ? "sub-goal becomes a" : "sub-goals become"} top-level ${goal.subGoals === 1 ? "goal" : "goals"} of ${goal.projectName}, tasks included.`
      : null,
    "Its connections to other goals and its sign-off settings are removed.",
  ].filter((line): line is string => line !== null);

  return (
    <>
      <Button variant="ghost" className="text-muted-foreground hover:text-destructive" onClick={() => setOpen(true)} data-delete-goal>
        <Trash2 aria-hidden />
        Delete
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this goal?</DialogTitle>
            <DialogDescription>&ldquo;{goal.title}&rdquo; is removed for good. Its automatic completion task is deleted; other work is kept:</DialogDescription>
          </DialogHeader>
          <ul className="grid list-disc gap-1.5 pl-5 text-base">
            {consequences.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          {goal.subGoals > 0 ? (
            <label className="flex items-center gap-2.5 rounded-md border bg-muted/40 px-3 py-2 text-sm">
              <Checkbox checked={withSubGoals} onCheckedChange={(next) => setWithSubGoals(next === true)} data-delete-sub-goals />
              Also delete its {goal.subGoals} {goal.subGoals === 1 ? "sub-goal" : "sub-goals"}
            </label>
          ) : null}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirm} disabled={pending}>
              {pending ? "Deleting…" : "Delete goal"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
