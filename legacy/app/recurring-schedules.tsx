"use client";

import {useCallback,useEffect,useState} from "react";
import {supabase as makeClient} from "../lib/supabase";

const db=makeClient();
type Recurrence={id:string;title:string;description:string|null;frequency:string;next_due_at:string;active:boolean;owner_id:string|null;project_id:string|null};
type Member={user_id:string;display_name:string};
type Project={id:string;name:string};
type Props={organizationId:string;manager:boolean;refreshKey:number;directory:Member[];projects:Project[]};
export default function RecurringSchedules({organizationId,manager,refreshKey,directory,projects}:Props){
 const [rules,setRules]=useState<Recurrence[]>([]);
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(""),[error,setError]=useState(""),[notice,setNotice]=useState("");
 const refresh=useCallback(async()=>{
  setLoading(true);
  const {data,error}=await db.from("tw_recurring_tasks")
   .select("id,title,description,frequency,next_due_at,active,owner_id,project_id")
   .eq("organization_id",organizationId).order("created_at",{ascending:false}).limit(100);
  if(error)setError(error.message);else {setRules(data??[]);setError("")}
  setLoading(false);
 },[organizationId]);
 useEffect(()=>{void refresh()},[refresh,refreshKey]);
 async function toggle(rule:Recurrence){
  if(!manager||busy)return;
  setBusy(rule.id);setNotice("");setError("");
  try{
   const {error}=await db.rpc("tw_set_recurring_active",{rule_id:rule.id,enabled:!rule.active});
   if(error)throw error;
   await refresh();setNotice(rule.active?"Repeating assignment paused. Existing tasks stay saved.":"Repeating assignment resumed.");
  }catch(e){setError(e instanceof Error?e.message:"Unable to update recurring schedule");}
  finally{setBusy("")}
 }
 const humanFrequency=(value:string)=>value==="daily"?"Every day":value==="weekly"?"Every week":"Every month";
 return <details className="card recurringSchedules">
  <summary><strong>Repeating assignments</strong><span className="chip">{rules.filter(r=>r.active).length} active</span></summary>
  <p className="muted">When you create a task, you can choose to repeat it daily, weekly, or monthly. Trackwise creates the next assignments automatically as their deadlines approach. Pausing a schedule does not remove existing tasks.</p>
  {error&&<p role="alert" className="feedback bad">{error}</p>}
  {notice&&<p role="status" className="feedback good">{notice}</p>}
  {loading?<p className="muted">Loading schedules…</p>:rules.length===0?<p className="muted">No repeating tasks yet. Select Add task and choose a repeat option to create one.</p>:
   <div className="recurrenceList">{rules.map(r=><div className="recurrenceRow" key={r.id}>
    <div><strong>{r.title}</strong><small>{humanFrequency(r.frequency)} · {r.active?"Active":"Paused"} · Next due {new Date(r.next_due_at).toLocaleDateString()}</small>
    <small>{r.owner_id?(directory.find(m=>m.user_id===r.owner_id)?.display_name??"Assigned member"):"Unassigned"} · {projects.find(p=>p.id===r.project_id)?.name??"No project"}</small></div>
    {manager&&<button type="button" disabled={busy===r.id} onClick={()=>void toggle(r)}>{busy===r.id?"Working…":r.active?"Pause":"Resume"}</button>}
   </div>)}</div>}
  <button className="textAction" type="button" disabled={loading} onClick={()=>void refresh()}>↻ Refresh schedules</button>
 </details>
}
