"use client";
import {useCallback,useEffect,useRef,useState,type FormEvent} from "react";
import {supabase as makeClient} from "../lib/supabase";
const supabase=makeClient();
type Task={id:string;title:string;status:string};
type Team={id:string;name:string};
type Project={id:string;name:string};
type Note={id:string;title:string;body:string|null;read_at:string|null;created_at:string};
type Message={id:string;body:string;created_at:string;author_id:string;team_id:string|null};
type Dep={id:string;task_id:string;depends_on_id:string};
type Props={organizationId:string;userId:string;tasks:Task[];teams:Team[];projects:Project[];manager:boolean;section:"collaboration"|"notifications"};
export default function Operations({organizationId,userId,tasks,teams,projects,manager,section}:Props){
 const [notes,setNotes]=useState<Note[]>([]),[messages,setMessages]=useState<Message[]>([]),[deps,setDeps]=useState<Dep[]>([]);
 const [channel,setChannel]=useState("all"),[message,setMessage]=useState(""),[task,setTask]=useState(""),[prerequisite,setPrerequisite]=useState("");
 const [busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
 useEffect(()=>{if(channel!=="all"&&!teams.some(t=>t.id===channel))setChannel("all")},[channel,teams]);
 const [loading,setLoading]=useState(true);
 const refreshCounter=useRef(0);
 const refresh=useCallback(async()=>{
  const request=++refreshCounter.current;
  const [n,m,d]=await Promise.all([
   section==="notifications"
    ?supabase.from("tw_notifications").select("id,title,body,read_at,created_at").eq("organization_id",organizationId).eq("user_id",userId).order("created_at",{ascending:false}).limit(100)
    :Promise.resolve(null),
   section==="collaboration"
    ?(channel==="all"
      ?supabase.from("tw_messages").select("id,body,created_at,author_id,team_id").eq("organization_id",organizationId).is("team_id",null).order("created_at",{ascending:false}).limit(100)
      :supabase.from("tw_messages").select("id,body,created_at,author_id,team_id").eq("organization_id",organizationId).eq("team_id",channel).order("created_at",{ascending:false}).limit(100))
    :Promise.resolve(null),
   section==="collaboration"
    ?supabase.from("tw_task_dependencies").select("id,task_id,depends_on_id").eq("organization_id",organizationId)
    :Promise.resolve(null)
  ]);
  if(request!==refreshCounter.current)return;
  const problems=[n?.error,m?.error,d?.error].filter(Boolean);
  if(n&&!n.error)setNotes(n.data??[]);
  if(m&&!m.error)setMessages(m.data??[]);
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

 return <div className="operations">
 {error&&<p className="feedback bad" role="alert">{error}</p>}{notice&&<p className="feedback good">{notice}</p>}
 {section==="notifications"&&<section className="card"><div className="sectionHead"><h2>Notifications</h2><div className="notificationHeadActions"><span className="chip">{notes.filter(n=>!n.read_at).length} unread</span><button type="button" disabled={loading} className="textAction" onClick={()=>void refresh()}>{loading?"Checking…":"↻ Refresh"}</button>{notes.some(n=>!n.read_at)&&<button type="button" disabled={busy} className="textAction" onClick={()=>void markAllNotesRead()}>Mark all read</button>}</div></div><p className="muted">Updates refresh automatically while Trackwise is open.</p>{notes.length?notes.map(n=><div className="reportRow" key={n.id}><div><strong>{n.title}</strong><p className="muted">{n.body}</p><small>{new Date(n.created_at).toLocaleString()}</small></div>{!n.read_at&&<button onClick={()=>void readNote(n.id)}>Mark read</button>}</div>):<p className="muted">You are all caught up.</p>}</section>}
 {section==="collaboration"&&<><section className="card"><h2>Team messages</h2><p className="muted">Messages are organized by channel. Switch channels to load its recent conversation.</p><label htmlFor="channel">Channel</label><select id="channel" value={channel} onChange={e=>setChannel(e.target.value)}><option value="all">Organization channel</option>{teams.map(t=><option value={t.id} key={t.id}>{t.name}</option>)}</select><form onSubmit={send}><label htmlFor="message">New message</label><textarea id="message" rows={3} maxLength={3000} required value={message} onChange={e=>setMessage(e.target.value)} placeholder="Share an update with your team"/><button className="primary" disabled={busy}>Post message</button></form><div className="messageFeed">{loading&&<p className="muted">Loading recent messages…</p>}{!loading&&messages.length===0&&<p className="muted">No messages in this channel yet. Start the conversation above.</p>}{messages.filter(m=>channel==="all"?m.team_id===null:m.team_id===channel).map(m=><div className="messageItem" key={m.id}><p>{m.body}</p><small>{m.author_id===userId?"You":"Team member"} · {new Date(m.created_at).toLocaleString()}</small></div>)}</div></section><section className="card"><h2>Task dependencies</h2><p className="muted">Identify tasks that must finish before another can proceed.</p>{deps.map(d=><div className="reportRow" key={d.id}><span>{tasks.find(t=>t.id===d.task_id)?.title??"Task"}</span><strong>Needs: {tasks.find(t=>t.id===d.depends_on_id)?.title??"Task"}</strong>{manager&&<button type="button" className="textAction" disabled={busy} onClick={()=>void removeDependency(d)}>Remove</button>}</div>)}{manager&&<form onSubmit={addDependency}><label htmlFor="dependent">Dependent task</label><select id="dependent" required value={task} onChange={e=>setTask(e.target.value)}><option value="">Select task</option>{tasks.map(t=><option key={t.id} value={t.id}>{t.title}</option>)}</select><label htmlFor="prerequisite">Must be completed first</label><select id="prerequisite" required value={prerequisite} onChange={e=>setPrerequisite(e.target.value)}><option value="">Select prerequisite</option>{tasks.filter(t=>t.id!==task).map(t=><option key={t.id} value={t.id}>{t.title}</option>)}</select><button className="primary" disabled={busy}>Add dependency</button></form>}</section></>}

 </div>;
}
