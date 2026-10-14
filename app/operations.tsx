"use client";
import {useCallback,useEffect,useRef,useState,type FormEvent} from "react";
import {supabase as makeClient} from "../lib/supabase";
const supabase=makeClient();
type Task={id:string;title:string;status:string};
type Team={id:string;name:string};
type Project={id:string;name:string};
type Note={id:string;title:string;body:string|null;read_at:string|null;created_at:string};
type Message={id:string;body:string;created_at:string;author_id:string;team_id:string|null};
type Budget={id:string;label:string;category:string;planned:number;spent:number;currency:string;project_id:string|null};
type Dep={id:string;task_id:string;depends_on_id:string};
type Props={organizationId:string;userId:string;tasks:Task[];teams:Team[];projects:Project[];manager:boolean;section:"collaboration"|"resources"|"notifications"};
export default function Operations({organizationId,userId,tasks,teams,projects,manager,section}:Props){
 const [notes,setNotes]=useState<Note[]>([]),[messages,setMessages]=useState<Message[]>([]),[budgets,setBudgets]=useState<Budget[]>([]),[deps,setDeps]=useState<Dep[]>([]);
 const [channel,setChannel]=useState("all"),[message,setMessage]=useState(""),[task,setTask]=useState(""),[prerequisite,setPrerequisite]=useState("");
 const [label,setLabel]=useState(""),[planned,setPlanned]=useState(""),[spent,setSpent]=useState(""),[project,setProject]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
 const [editingBudget,setEditingBudget]=useState(""),[editBudgetLabel,setEditBudgetLabel]=useState(""),[editBudgetPlanned,setEditBudgetPlanned]=useState(""),[editBudgetSpent,setEditBudgetSpent]=useState(""),[editBudgetProject,setEditBudgetProject]=useState("");
 useEffect(()=>{if(channel!=="all"&&!teams.some(t=>t.id===channel))setChannel("all")},[channel,teams]);
 const [loading,setLoading]=useState(true);
 const refreshCounter=useRef(0);
 const refresh=useCallback(async()=>{
  const request=++refreshCounter.current;
  const [n,m,b,d]=await Promise.all([
   section==="notifications"
    ?supabase.from("tw_notifications").select("id,title,body,read_at,created_at").eq("organization_id",organizationId).eq("user_id",userId).order("created_at",{ascending:false}).limit(100)
    :Promise.resolve(null),
   section==="collaboration"
    ?(channel==="all"
      ?supabase.from("tw_messages").select("id,body,created_at,author_id,team_id").eq("organization_id",organizationId).is("team_id",null).order("created_at",{ascending:false}).limit(100)
      :supabase.from("tw_messages").select("id,body,created_at,author_id,team_id").eq("organization_id",organizationId).eq("team_id",channel).order("created_at",{ascending:false}).limit(100))
    :Promise.resolve(null),
   section==="resources"
    ?supabase.from("tw_budget_items").select("id,label,category,planned,spent,currency,project_id").eq("organization_id",organizationId).is("archived_at",null).order("created_at",{ascending:false})
    :Promise.resolve(null),
   section==="collaboration"
    ?supabase.from("tw_task_dependencies").select("id,task_id,depends_on_id").eq("organization_id",organizationId)
    :Promise.resolve(null)
  ]);
  if(request!==refreshCounter.current)return;
  const problems=[n?.error,m?.error,b?.error,d?.error].filter(Boolean);
  if(n&&!n.error)setNotes(n.data??[]);
  if(m&&!m.error)setMessages(m.data??[]);
  if(b&&!b.error)setBudgets(b.data??[]);
  if(d&&!d.error)setDeps(d.data??[]);
  setError(problems.length?problems.map(v=>v?.message).join(". "):"");
  setLoading(false);
 },[organizationId,userId,section,channel]);
 useEffect(()=>{
  setLoading(true);
  void refresh();
  const refreshWhenVisible=()=>{
   if(document.visibilityState==="visible")void refresh();
  };
  const timer=window.setInterval(refreshWhenVisible,45000);
  window.addEventListener("focus",refreshWhenVisible);
  document.addEventListener("visibilitychange",refreshWhenVisible);
  return()=>{
   window.clearInterval(timer);
   window.removeEventListener("focus",refreshWhenVisible);
   document.removeEventListener("visibilitychange",refreshWhenVisible);
  };
 },[refresh]);
 async function send(e:FormEvent){
  e.preventDefault();
  if(!message.trim())return;
  if(channel!=="all"&&!teams.some(t=>t.id===channel)){
   setError("You no longer belong to this team. Please select another channel.");
   setChannel("all");return;
  }
  setBusy(true);setError("");setNotice("");
  try{
   const {error}=await supabase.from("tw_messages").insert({organization_id:organizationId,team_id:channel==="all"?null:channel,author_id:userId,body:message.trim()});
   if(error)throw error;
   setMessage("");setNotice("Message sent.");await refresh();
  }catch(err){setError(err instanceof Error?err.message:"Could not send message. Please retry.")}
  finally{setBusy(false)}
 }
 async function addBudget(e:FormEvent){e.preventDefault();setBusy(true);setError("");const {error}=await supabase.from("tw_budget_items").insert({organization_id:organizationId,created_by:userId,label:label.trim(),planned:Number(planned),spent:Number(spent||0),project_id:project||null,currency:"JMD"});if(error)setError(error.message);else{setLabel("");setPlanned("");setSpent("");setProject("");setNotice("Budget item added.");await refresh()}setBusy(false)}
 function beginBudgetEdit(b:Budget){
  setEditingBudget(b.id);setEditBudgetLabel(b.label);
  setEditBudgetPlanned(String(b.planned));setEditBudgetSpent(String(b.spent));setEditBudgetProject(b.project_id??"");
 }
 async function saveBudgetEdit(e:FormEvent){
  e.preventDefault();if(!manager||!editingBudget||busy)return;
  setBusy(true);setError("");setNotice("");
  try{
   const {error}=await supabase.rpc("tw_edit_budget_item",{
    target_item:editingBudget,new_label:editBudgetLabel.trim(),new_planned:Number(editBudgetPlanned),
    new_spent:Number(editBudgetSpent),new_project:editBudgetProject||null
   });
   if(error)throw error;
   setEditingBudget("");await refresh();setNotice("Budget item changes saved.");
  }catch(e){setError(e instanceof Error?e.message:"Unable to save budget changes")}
  finally{setBusy(false)}
 }
 async function archiveBudgetItem(b:Budget){
  if(!manager||busy||!window.confirm("Archive "+b.label+"? This will hide the item from the active budget, but its history remains saved."))return;
  setBusy(true);setError("");setNotice("");
  try{
   const {error}=await supabase.rpc("tw_archive_budget_item",{target_item:b.id});
   if(error)throw error;
   if(editingBudget===b.id)setEditingBudget("");
   await refresh();setNotice("Budget item archived. Its audit history was preserved.");
  }catch(e){setError(e instanceof Error?e.message:"Unable to archive budget item")}
  finally{setBusy(false)}
 }
 async function addDependency(e:FormEvent){e.preventDefault();setBusy(true);setError("");const {error}=await supabase.rpc("tw_add_dependency",{target_task:task,prerequisite});if(error)setError(error.message);else{setTask("");setPrerequisite("");setNotice("Dependency linked.");await refresh()}setBusy(false)}
 async function removeDependency(item:Dep){
  if(!manager||busy||!window.confirm("Remove this task dependency? Completing the linked tasks will no longer depend on this relationship."))return;
  setBusy(true);setError("");setNotice("");
  try{
   const {error}=await supabase.rpc("tw_remove_dependency",{dependency_id:item.id});
   if(error)throw error;
   await refresh();setNotice("Task dependency removed.");
  }catch(e){setError(e instanceof Error?e.message:"Unable to remove the dependency")}
  finally{setBusy(false)}
 }
 async function readNote(id:string){const {error}=await supabase.rpc("tw_mark_notification_read",{notification_id:id});if(error)setError(error.message);else{await refresh();window.dispatchEvent(new Event("tw-notifications-updated"))}}
 async function markAllNotesRead(){
  if(busy||notes.every(n=>Boolean(n.read_at)))return;
  setBusy(true);setError("");setNotice("");
  try{
   const {error}=await supabase.rpc("tw_mark_all_notifications_read",{org_id:organizationId});
   if(error)throw error;
   await refresh();
   window.dispatchEvent(new Event("tw-notifications-updated"));
   setNotice("All notifications marked as read.");
  }catch(e){setError(e instanceof Error?e.message:"Unable to mark notifications as read")}
  finally{setBusy(false)}
 }

 const money=(v:number)=>new Intl.NumberFormat("en-JM",{style:"currency",currency:"JMD"}).format(v);
 const total=budgets.reduce((sum,b)=>sum+Number(b.planned),0),used=budgets.reduce((sum,b)=>sum+Number(b.spent),0);
 return <div className="operations">
 {error&&<p className="feedback bad" role="alert">{error}</p>}{notice&&<p className="feedback good">{notice}</p>}
 {section==="notifications"&&<section className="card"><div className="sectionHead"><h2>Notifications</h2><div className="notificationHeadActions"><span className="chip">{notes.filter(n=>!n.read_at).length} unread</span><button type="button" disabled={loading} className="textAction" onClick={()=>void refresh()}>{loading?"Checking…":"↻ Refresh"}</button>{notes.some(n=>!n.read_at)&&<button type="button" disabled={busy} className="textAction" onClick={()=>void markAllNotesRead()}>Mark all read</button>}</div></div><p className="muted">Updates refresh automatically while Trackwise is open.</p>{notes.length?notes.map(n=><div className="reportRow" key={n.id}><div><strong>{n.title}</strong><p className="muted">{n.body}</p><small>{new Date(n.created_at).toLocaleString()}</small></div>{!n.read_at&&<button onClick={()=>void readNote(n.id)}>Mark read</button>}</div>):<p className="muted">You are all caught up.</p>}</section>}
 {section==="collaboration"&&<><section className="card"><h2>Team messages</h2><p className="muted">Messages are organized by channel. Switch channels to load its recent conversation.</p><label htmlFor="channel">Channel</label><select id="channel" value={channel} onChange={e=>setChannel(e.target.value)}><option value="all">Organization channel</option>{teams.map(t=><option value={t.id} key={t.id}>{t.name}</option>)}</select><form onSubmit={send}><label htmlFor="message">New message</label><textarea id="message" rows={3} maxLength={3000} required value={message} onChange={e=>setMessage(e.target.value)} placeholder="Share an update with your team"/><button className="primary" disabled={busy}>Post message</button></form><div className="messageFeed">{loading&&<p className="muted">Loading recent messages…</p>}{!loading&&messages.length===0&&<p className="muted">No messages in this channel yet. Start the conversation above.</p>}{messages.filter(m=>channel==="all"?m.team_id===null:m.team_id===channel).map(m=><div className="messageItem" key={m.id}><p>{m.body}</p><small>{m.author_id===userId?"You":"Team member"} · {new Date(m.created_at).toLocaleString()}</small></div>)}</div></section><section className="card"><h2>Task dependencies</h2><p className="muted">Identify tasks that must finish before another can proceed.</p>{deps.map(d=><div className="reportRow" key={d.id}><span>{tasks.find(t=>t.id===d.task_id)?.title??"Task"}</span><strong>Needs: {tasks.find(t=>t.id===d.depends_on_id)?.title??"Task"}</strong>{manager&&<button type="button" className="textAction" disabled={busy} onClick={()=>void removeDependency(d)}>Remove</button>}</div>)}{manager&&<form onSubmit={addDependency}><label htmlFor="dependent">Dependent task</label><select id="dependent" required value={task} onChange={e=>setTask(e.target.value)}><option value="">Select task</option>{tasks.map(t=><option key={t.id} value={t.id}>{t.title}</option>)}</select><label htmlFor="prerequisite">Must be completed first</label><select id="prerequisite" required value={prerequisite} onChange={e=>setPrerequisite(e.target.value)}><option value="">Select prerequisite</option>{tasks.filter(t=>t.id!==task).map(t=><option key={t.id} value={t.id}>{t.title}</option>)}</select><button className="primary" disabled={busy}>Add dependency</button></form>}</section></>}
 {section==="resources"&&<><div className="reportStats"><div className="card reportMetric"><span>Planned budget</span><strong>{money(total)}</strong></div><div className="card reportMetric"><span>Recorded spending</span><strong>{money(used)}</strong></div><div className="card reportMetric"><span>Remaining</span><strong>{money(total-used)}</strong></div></div><section className="card"><h2>Budget register</h2><p className="muted">Track planned and recorded spending in Jamaican dollars. This is a planning ledger, not a payment system.</p>{budgets.length===0&&<p className="muted">No budget items yet. Leaders can add one below.</p>}
 {budgets.map(b=><div className="budgetItem" key={b.id}>
  <div className="reportRow"><span>{b.label} {b.project_id?"· "+(projects.find(p=>p.id===b.project_id)?.name??"Project"):""}</span><strong>{money(Number(b.spent))} spent / {money(Number(b.planned))} planned</strong></div>
  {manager&&<div className="budgetControls"><button type="button" disabled={busy} onClick={()=>editingBudget===b.id?setEditingBudget(""):beginBudgetEdit(b)}>{editingBudget===b.id?"Cancel editing":"✎ Edit amounts"}</button><button type="button" className="textAction" disabled={busy} onClick={()=>void archiveBudgetItem(b)}>Archive</button></div>}
  {manager&&editingBudget===b.id&&<form className="budgetEditForm" onSubmit={saveBudgetEdit}>
   <div><label htmlFor="budgetEditLabel">Budget item</label><input id="budgetEditLabel" required maxLength={150} minLength={2} value={editBudgetLabel} onChange={e=>setEditBudgetLabel(e.target.value)}/></div>
   <div><label htmlFor="budgetEditProject">Project</label><select id="budgetEditProject" value={editBudgetProject} onChange={e=>setEditBudgetProject(e.target.value)}><option value="">Organization-wide</option>{projects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
   <div><label htmlFor="budgetEditPlanned">Planned amount (JMD)</label><input id="budgetEditPlanned" type="number" min="0" step="0.01" required value={editBudgetPlanned} onChange={e=>setEditBudgetPlanned(e.target.value)}/></div>
   <div><label htmlFor="budgetEditSpent">Spent amount (JMD)</label><input id="budgetEditSpent" type="number" min="0" step="0.01" required value={editBudgetSpent} onChange={e=>setEditBudgetSpent(e.target.value)}/></div>
   <button type="submit" className="primary" disabled={busy}>{busy?"Saving…":"Save budget changes"}</button>
  </form>}
 </div>)}{manager&&<form onSubmit={addBudget}><label htmlFor="budgetLabel">Budget item</label><input id="budgetLabel" value={label} onChange={e=>setLabel(e.target.value)} required maxLength={150} placeholder="e.g. Event materials"/><label htmlFor="budgetProject">Project</label><select id="budgetProject" value={project} onChange={e=>setProject(e.target.value)}><option value="">Organization-wide</option>{projects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select><label htmlFor="planned">Planned amount (JMD)</label><input id="planned" type="number" min="0" step="0.01" value={planned} onChange={e=>setPlanned(e.target.value)} required/><label htmlFor="spent">Spent amount (JMD)</label><input id="spent" type="number" min="0" step="0.01" value={spent} onChange={e=>setSpent(e.target.value)}/><button className="primary" disabled={busy}>Add budget item</button></form>}</section></>}
 </div>;
}
