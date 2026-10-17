"use client";
import {useEffect,useRef,useState,type FormEvent} from "react";
import {Building2,CalendarDays,Check,ChevronDown,ChevronRight,FolderKanban,Plus,SquareCheckBig,UsersRound,X,type LucideIcon} from "lucide-react";
import {supabase} from "../lib/supabase";

export type QuickCreateKind="task"|"project"|"team"|"organization";
export type QuickCreateResult={kind:QuickCreateKind;id:string;name:string};
type Project={id:string;name:string};
type Person={user_id:string;display_name:string;role:string};
type Props={
 initialKind:QuickCreateKind;
 initialProjectId?:string;
 organizationId:string;
 userId:string;
 canManage:boolean;
 projects:Project[];
 directory:Person[];
 onClose:()=>void;
 onSaved:(created:QuickCreateResult)=>Promise<void>;
 onOpen:(created:QuickCreateResult)=>void;
 onInvite:()=>void;
};
const CATEGORIES:{kind:QuickCreateKind;label:string;hint:string;icon:LucideIcon}[]=[
 {kind:"task",label:"Task",hint:"Assign something",icon:SquareCheckBig},
 {kind:"project",label:"Project",hint:"Plan a result",icon:FolderKanban},
 {kind:"team",label:"Team",hint:"Group people",icon:UsersRound},
 {kind:"organization",label:"Organization",hint:"Start a workspace",icon:Building2}
];
const TASK_IDEAS=["Prepare the next meeting","Follow up on an action item","Review the project timeline"];
const PROJECT_IDEAS=["Plan an event","Run a community project","Organize a new initiative"];
const COPY:Record<QuickCreateKind,{heading:string,desc:string,label:string,placeholder:string,submit:string}>={
 task:{heading:"Create a task",desc:"Start with what needs to get done. Assign it and choose a date if you know them.",label:"What needs to be done?",placeholder:"e.g. Prepare the meeting agenda",submit:"Create task"},
 project:{heading:"Create a project",desc:"A project brings related tasks together. Give your plan a name to begin.",label:"What are you working towards?",placeholder:"e.g. School beautification",submit:"Create project"},
 team:{heading:"Create a team",desc:"Organize people who share responsibility. Add members after creating your team.",label:"What is your team called?",placeholder:"e.g. Outreach committee",submit:"Create team"},
 organization:{heading:"Create an organization",desc:"A private workspace for your club, business or community group. You'll be the administrator.",label:"Organization name",placeholder:"e.g. Volunteerism Club",submit:"Create organization"}
};
function readableError(value:unknown){
 if(value&&typeof value==="object"&&"message" in value)return String(value.message);
 return value instanceof Error?value.message:"Please try again.";
}
export default function QuickCreate({
 initialKind,initialProjectId,organizationId,userId,canManage,projects,directory,onClose,onSaved,onOpen,onInvite
}:Props){
 const [kind,setKind]=useState<QuickCreateKind>(initialKind);
 const [title,setTitle]=useState("");
 const [description,setDescription]=useState("");
 const [owner,setOwner]=useState("");
 const [due,setDue]=useState("");
 const [project,setProject]=useState(initialProjectId??"");
 const [priority,setPriority]=useState("normal");
 const [more,setMore]=useState(false);
 const [planTask,setPlanTask]=useState(false);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [success,setSuccess]=useState<QuickCreateResult|null>(null);
 const firstField=useRef<HTMLInputElement>(null);
 const dialogRef=useRef<HTMLDivElement>(null);
 const heading=COPY[kind];

 useEffect(()=>{
  const before=document.activeElement instanceof HTMLElement?document.activeElement:null;
  const old=document.body.style.overflow;
  document.body.style.overflow="hidden";
  firstField.current?.focus();
  return()=>{document.body.style.overflow=old;before?.focus()};
 },[]);
 useEffect(()=>{
  function handle(event:KeyboardEvent){
   if(event.key==="Escape"&&!busy){event.preventDefault();onClose()}
   if(event.key!=="Tab"||!dialogRef.current)return;
   const focusable=Array.from(dialogRef.current.querySelectorAll<HTMLElement>("button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),a[href]"))
    .filter(el=>el.getClientRects().length>0);
   if(!focusable.length)return;
   const start=focusable[0],end=focusable[focusable.length-1];
   if(event.shiftKey&&document.activeElement===start){event.preventDefault();end.focus()}
   if(!event.shiftKey&&document.activeElement===end){event.preventDefault();start.focus()}
  }
  window.addEventListener("keydown",handle);
  return()=>window.removeEventListener("keydown",handle);
 },[busy,onClose]);

 const allowed=canManage&&organizationId?CATEGORIES:CATEGORIES.filter(x=>x.kind==="organization");
 function changeType(next:QuickCreateKind){
  if(busy||next===kind)return;
  setKind(next);setSuccess(null);setTitle("");setDescription("");setOwner("");setDue("");setProject("");setMore(false);setPlanTask(false);setError("");
  window.requestAnimationFrame(()=>firstField.current?.focus());
 }
 async function submit(event:FormEvent<HTMLFormElement>){
  event.preventDefault();
  if(busy)return;
  const name=title.replace(/\s+/g," ").trim();
  if(name.length<2){setError("Please enter at least two characters.");return}
  if(name.length>(kind==="organization"||kind==="team"?120:180)){setError("That name is too long.");return}
  if(kind!=="organization"&&!organizationId){setError("Choose or create an organization first.");return}
  if(kind!=="organization"&&!canManage){setError("Only a leader or administrator can create work in this organization.");return}
  setBusy(true);setError("");
  try{
   const db=supabase();
   let created:QuickCreateResult;
   if(kind==="organization"){
    const {data,error}=await db.rpc("tw_create_organization",{org_name:name});
    if(error)throw error;
    if(typeof data!=="string")throw new Error("Could not confirm that your organization was created.");
    created={kind,id:data,name};
   }else if(kind==="project"){
    const {data,error}=await db.from("tw_projects").insert({
     organization_id:organizationId,name,description:description.trim()||null
    }).select("id,name").single();
    if(error)throw error;
    if(!data)throw new Error("Could not confirm that your project was created.");
    created={kind,id:data.id,name:data.name};
   }else if(kind==="team"){
    const {data,error}=await db.from("tw_teams").insert({organization_id:organizationId,name}).select("id,name").single();
    if(error)throw error;
    if(!data)throw new Error("Could not confirm that your team was created.");
    created={kind,id:data.id,name:data.name};
   }else{
    const {data,error}=await db.from("tw_tasks").insert({
     organization_id:organizationId,created_by:userId,title:name,description:description.trim()||null,
     owner_id:owner||null,project_id:project||null,priority,
     due_at:due?new Date(due+"T23:59:00").toISOString():null
    }).select("id,title").single();
    if(error)throw error;
    if(!data)throw new Error("Could not confirm that your task was created.");
    created={kind,id:data.id,name:data.title};
   }
   setSuccess(created);
   try{await onSaved(created)}
   catch{/* The record is saved; show success even if refreshing the list fails. */}
  }catch(failure){setError(readableError(failure))}
  finally{setBusy(false)}
 }
 function createAnother(next:QuickCreateKind=kind){
  if(next==="task"&&success?.kind==="project")setProject(success.id);
  else setProject("");
  setKind(next);setTitle("");setDescription("");setDue("");setOwner("");setPriority("normal");
  setMore(false);setPlanTask(false);setError("");setSuccess(null);
  window.requestAnimationFrame(()=>firstField.current?.focus());
 }
 return <div className="quickCreateOverlay" onPointerDown={event=>{if(event.currentTarget===event.target&&!busy)onClose()}}>
  <div className="quickCreateDialog" ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="quickCreateHeading" aria-describedby="quickCreateDesc">
   <div className="quickCreateTop">
    <div><span className="quickCreateKicker">TRACKWISE · QUICK CREATE</span><h2 id="quickCreateHeading">{success?"You're all set!":heading.heading}</h2>
     <p id="quickCreateDesc">{success?"Saved successfully. Choose what to do next.":heading.desc}</p></div>
    <button type="button" onClick={onClose} className="quickCreateClose" aria-label="Close quick create" disabled={busy}><X size={21}/></button>
   </div>
   {success?<div className="quickCreateSuccess" role="status">
    <span className="quickCreateSuccessIcon"><Check size={32}/></span>
    <h3>{success.name}</h3>
    <p>Successfully added to Trackwise. You can open it, or continue setting up your workspace.</p>
    <div className="quickCreateSuccessActions">
     <button className="primary" type="button" onClick={()=>onOpen(success)}>View {success.kind} <ChevronRight size={17}/></button>
     {success.kind==="project"&&<button type="button" onClick={()=>createAnother("task")}>+ Add its first task</button>}
     {success.kind==="organization"&&<button type="button" onClick={()=>createAnother("project")}>+ Start a project</button>}
     {success.kind==="team"&&<button type="button" onClick={()=>{onClose();onInvite()}}>Invite teammates</button>}
     <button type="button" onClick={()=>createAnother()}>Create another</button>
    </div>
   </div>:
   <>
    <div className="quickCreateTypes" role="group" aria-label="What to create">
     {allowed.map(({kind:option,label,icon:Icon})=><button type="button" key={option}
      className={"quickCreateType "+(kind===option?"selected":"")} aria-pressed={kind===option}
      disabled={busy} onClick={()=>changeType(option)}><Icon size={19}/><span>{label}</span></button>)}
    </div>
    <form className="quickCreateForm" onSubmit={submit}>
     <div className="quickCreateStep"><span>1</span><strong>Start with a name</strong><small>We’ll take care of the rest. You can change details later.</small></div>
     <div className="quickCreateField"><label htmlFor="quickCreateTitle">{heading.label} <span>*</span></label>
      <input ref={firstField} id="quickCreateTitle" autoComplete="off" minLength={2} maxLength={kind==="organization"||kind==="team"?120:180} required
       value={title} onChange={e=>setTitle(e.target.value)} placeholder={heading.placeholder}/>
      <small>Give it a short, clear name. Only this field is required.</small>
      {!title.trim()&&(kind==="task"||kind==="project")&&<div className="quickCreateIdeas" aria-label="Suggestions">{(kind==="task"?TASK_IDEAS:PROJECT_IDEAS).map(idea=><button type="button" key={idea} onClick={()=>{setTitle(idea);firstField.current?.focus()}}>{idea} ↗</button>)}</div>}</div>
     {kind==="task"&&<div className="quickCreateTaskPlan">
      <div className="quickCreateAssignee"><span className="quickCreateAssigneeLabel">Who will do it?</span><div className="quickCreateAssigneeChoices"><button type="button" aria-pressed={!owner} className={!owner?"chosen":""} onClick={()=>setOwner("")}>Decide later</button><button type="button" aria-pressed={owner===userId} className={owner===userId?"chosen":""} onClick={()=>setOwner(userId)}>Assign to me</button><button type="button" aria-expanded={planTask} onClick={()=>setPlanTask(true)}>Choose someone else →</button></div></div>
      {initialProjectId&&project===initialProjectId&&<p className="quickCreateContext">Project: <strong>{projects.find(p=>p.id===project)?.name??"Selected project"}</strong></p>}
      <button type="button" className="quickCreatePlanToggle" aria-expanded={planTask} onClick={()=>setPlanTask(v=>!v)}><span><strong>{planTask?"Hide planning options":"Add deadline, project or teammate"}</strong><small>Optional: you can also do this later.</small></span><ChevronDown size={19} className={planTask?"rotated":""}/></button>
      {planTask&&<div className="quickCreatePlanFields"><div className="quickCreateSplit">
       <div className="quickCreateField"><label htmlFor="quickOwner">Assign to a teammate</label><select id="quickOwner" value={owner} onChange={e=>setOwner(e.target.value)}>
        <option value="">Unassigned (choose later)</option>
        {directory.filter(member=>["admin","leader","member"].includes(member.role)).map(member=><option value={member.user_id} key={member.user_id}>{member.user_id===userId?"Me":member.display_name}</option>)}
       </select></div>
       <div className="quickCreateField"><label htmlFor="quickDue"><CalendarDays size={15}/> Due date</label><input id="quickDue" type="date" value={due} onChange={e=>setDue(e.target.value)}/></div>
      </div>
      <div className="quickCreateField"><label htmlFor="quickProject">Which project?</label><select id="quickProject" value={project} onChange={e=>setProject(e.target.value)}><option value="">No project (organize later)</option>{projects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></div></div>}
     </div>}
     {(kind==="task"||kind==="project")&&<div className="quickCreateMore">
      <button type="button" aria-expanded={more} onClick={()=>setMore(v=>!v)}>{more?"− Hide optional details":kind==="project"?"+ Add a description (optional)":"+ Add instructions or priority (optional)"}</button>
      {more&&<div className="quickCreateMoreFields"><div className="quickCreateField"><label htmlFor="quickDescription">Instructions / description</label><textarea id="quickDescription" rows={3} maxLength={3000} value={description} onChange={e=>setDescription(e.target.value)} placeholder="What should everyone know?"/></div>
       {kind==="task"&&<div className="quickCreateField"><label htmlFor="quickPriority">Priority</label><select id="quickPriority" value={priority} onChange={e=>setPriority(e.target.value)}><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option></select></div>}
      </div>}
     </div>}
     {error&&<p className="feedback bad" role="alert">{error}</p>}
     <div className="quickCreateFooter"><span className="quickCreateFooterHelp"><Check size={16}/> You can edit it after creation.</span><button type="button" onClick={onClose} disabled={busy}>Cancel</button><button type="submit" className="primary" disabled={busy}><Plus size={18}/>{busy?"Saving…":heading.submit}</button></div>
    </form>
   </>}
  </div>
 </div>;
}
