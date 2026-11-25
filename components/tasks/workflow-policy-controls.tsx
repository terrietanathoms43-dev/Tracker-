"use client";

import { useState, useTransition } from "react";
import { createWorkflowPolicy, attachWorkflowPolicy, applyWorkflowPolicies } from "@/actions/workflow-policies";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toastResult } from "@/lib/toast-result";

type Option = { id: string; name: string };
type Scope = { kind: "workspace" | "project" | "goal"; id: string };

export function WorkflowPolicyControls({ scope, policies, attached }: { scope: Scope; policies: Option[]; attached: string[] }) {
  const [name, setName] = useState("");
  const [labels, setLabels] = useState("");
  const [automatic, setAutomatic] = useState(true);
  const [selected, setSelected] = useState("");
  const [pending, startTransition] = useTransition();
  return <section className="grid min-w-0 gap-3 rounded-lg border bg-card p-4">
    <h3 className="font-semibold">Workflow policies</h3>
    <p className="text-sm text-muted-foreground">Automatic attachments apply to new tasks here. Existing tasks can synchronize explicitly.</p>
    {policies.filter((p) => attached.includes(p.id)).map((p) => <p key={p.id} className="text-sm">{p.name} · automatic</p>)}
    <details><summary className="cursor-pointer text-sm font-medium">Create reusable policy</summary>
      <div className="mt-3 grid gap-2">
        <label className="text-sm">Policy name<Input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} /></label>
        <label className="text-sm">Required steps (one per line)<Textarea value={labels} onChange={(e) => setLabels(e.target.value)} rows={4} maxLength={4000} /></label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={automatic} onChange={(e) => setAutomatic(e.target.checked)} />Automatically attach here</label>
        <Button type="button" disabled={pending || !name.trim() || !labels.trim()} onClick={() => startTransition(async () => {
          const result = await createWorkflowPolicy({ scope, name, labels: labels.split(/\r?\n/).map((s) => s.trim()).filter(Boolean), automatic });
          toastResult(result); if (result.ok) { setName(""); setLabels(""); }
        })}>Create policy</Button>
      </div>
    </details>
    <label className="grid gap-1 text-sm">Attach existing policy<select className="min-w-0 rounded-md border bg-background p-2" value={selected} onChange={(e) => setSelected(e.target.value)}>
      <option value="">Select policy</option>{policies.filter((p) => !attached.includes(p.id)).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
    </select></label>
    <Button type="button" variant="outline" disabled={pending || !selected} onClick={() => startTransition(async () => { const result = await attachWorkflowPolicy({ scope, policyId: selected }); toastResult(result); if (result.ok) setSelected(""); })}>Attach automatically</Button>
  </section>;
}
export function TaskPolicyControls({ taskId, policies, applied }: { taskId: string; policies: Option[]; applied: string[] }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();
  const available = policies.filter((p) => !applied.includes(p.id));
  return <section className="grid min-w-0 gap-2 rounded-lg border bg-card p-3">
    <h3 className="font-semibold">Reusable policies</h3>
    {available.map((p) => <label key={p.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={selected.includes(p.id)} onChange={(e) => setSelected((old) => e.target.checked ? [...old, p.id] : old.filter((id) => id !== p.id))} />{p.name}</label>)}
    {available.length ? <Button type="button" variant="outline" disabled={pending || !selected.length} onClick={() => startTransition(async () => { const result = await applyWorkflowPolicies({ taskId, policyIds: selected }); toastResult(result); if (result.ok) setSelected([]); })}>Apply selected policies</Button> : null}
    <Button type="button" variant="outline" disabled={pending} onClick={() => startTransition(async () => { toastResult(await applyWorkflowPolicies({ taskId, policyIds: [] })); })}>Synchronize inherited policies</Button>
  </section>;
}
